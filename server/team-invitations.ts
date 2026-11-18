import { randomBytes } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { Project } from '../src/model.js';
import type {
  TeamGrant, TeamInvitation, TeamInvitePreview, TeamInviteIssued, TeamMember, TeamRole
} from '../src/workspace/team-contract.js';
import { INVITATION_DAYS, newToken, TOKEN, tokenDigest } from './team-auth.js';
import { emailField, idField, integerField, TeamFault } from './team-model.js';

type Body = Record<string, unknown>;
type Queryable = Pool | PoolClient;
export const ROLES: readonly TeamRole[] = ['owner', 'editor', 'reviewer', 'viewer'];

export function roleField(value: unknown): TeamRole {
  if (typeof value !== 'string' || !ROLES.includes(value as TeamRole)) throw new TeamFault(400, 'Invalid project role.');
  return value as TeamRole;
}

/** Validates an episode scope against the project: null means the whole project. */
export function episodeScope(project: Project, value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || value.length === 0 || value.length > 500) {
    throw new TeamFault(400, 'Select one or more episodes.');
  }
  const known = new Set(project.episodes.map(episode => episode.id));
  const episodes = [...new Set(value.map(item => idField(item, 'episode ID')))];
  if (episodes.some(id => !known.has(id))) throw new TeamFault(400, 'An episode is missing.');
  return episodes;
}

export interface InvitationRow {
  id: string;
  project_id: string | null;
  email: string;
  role: TeamRole | null;
  episode_ids: string[] | null;
  invited_by: string;
  created_at: Date;
  expires_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
}

function invitation(row: InvitationRow): TeamInvitation {
  return {
    id: row.id, email: row.email, role: row.role ?? 'viewer', episodeIds: row.episode_ids,
    invitedBy: row.invited_by, createdAt: row.created_at.toISOString(), expiresAt: row.expires_at.toISOString(),
    expired: row.expires_at.getTime() <= Date.now()
  };
}

function daysField(value: unknown): number {
  return value === undefined ? INVITATION_DAYS : integerField(value, 'invitation duration', 1, 30);
}

export async function listMembers(db: Queryable, projectId: string): Promise<TeamMember[]> {
  const result = await db.query<Omit<TeamMember, 'lastActiveAt' | 'addedAt'> & { lastActiveAt: Date | null; addedAt: Date | null }>(
    `SELECT g.email, g.role, g.episode_ids AS "episodeIds", coalesce(u.name, '') AS name,
            u.last_active_at AS "lastActiveAt", g.added_at AS "addedAt"
     FROM swdr_team_grants g LEFT JOIN swdr_team_users u ON u.email = g.email
     WHERE g.project_id = $1 ORDER BY (g.role = 'owner') DESC, g.email`,
    [projectId]
  );
  return result.rows.map(row => ({
    ...row,
    lastActiveAt: row.lastActiveAt?.toISOString() ?? null,
    addedAt: row.addedAt?.toISOString() ?? null
  }));
}

export async function listInvitations(db: Queryable, projectId: string): Promise<TeamInvitation[]> {
  const result = await db.query<InvitationRow>(
    `SELECT * FROM swdr_team_invitations
     WHERE project_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL
     ORDER BY created_at DESC LIMIT 200`,
    [projectId]
  );
  return result.rows.map(invitation);
}

async function insertInvitation(db: Queryable, fields: {
  projectId: string | null; email: string; role: TeamRole | null; episodeIds: string[] | null; invitedBy: string; days: number;
}): Promise<TeamInviteIssued> {
  const token = newToken();
  const result = await db.query<InvitationRow>(
    `INSERT INTO swdr_team_invitations (id, digest, project_id, email, role, episode_ids, invited_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(days => $8)) RETURNING *`,
    [randomBytes(12).toString('base64url'), tokenDigest(token), fields.projectId, fields.email, fields.role,
      fields.episodeIds, fields.invitedBy, fields.days]
  );
  return { invitation: invitation(result.rows[0]), token };
}

/** Owner action: invite an email to a project with a role and optional episode scope. */
export async function createInvitation(db: PoolClient, project: Project, grant: TeamGrant, body: Body): Promise<TeamInviteIssued> {
  const email = emailField(body.email);
  if (email === grant.email) throw new TeamFault(400, 'You already have access to this project.');
  const role = roleField(body.role);
  const episodeIds = episodeScope(project, body.episodeIds);
  const existing = await db.query('SELECT 1 FROM swdr_team_grants WHERE project_id = $1 AND email = $2', [project.id, email]);
  if (existing.rows.length) {
    throw new TeamFault(409, `${email} already has access. Change their role in the members list.`);
  }
  // One live invitation per person per project: a new invitation replaces any pending link.
  await db.query(
    `UPDATE swdr_team_invitations SET revoked_at = now()
     WHERE project_id = $1 AND email = $2 AND accepted_at IS NULL AND revoked_at IS NULL`,
    [project.id, email]
  );
  return insertInvitation(db, { projectId: project.id, email, role, episodeIds, invitedBy: grant.email, days: daysField(body.days) });
}

/** Operator action (CLI): an account-only invitation, used to bootstrap the first owner in invite mode. */
export async function createWorkspaceInvitation(db: Queryable, email: string, invitedBy: string, days = INVITATION_DAYS) {
  return insertInvitation(db, { projectId: null, email: emailField(email), role: null, episodeIds: null, invitedBy, days });
}

export async function reissueInvitation(db: PoolClient, projectId: string, body: Body): Promise<TeamInviteIssued> {
  const id = idField(body.invitationId, 'invitation ID');
  const token = newToken();
  const result = await db.query<InvitationRow>(
    `UPDATE swdr_team_invitations SET digest = $3, expires_at = now() + make_interval(days => $4)
     WHERE project_id = $1 AND id = $2 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING *`,
    [projectId, id, tokenDigest(token), daysField(body.days)]
  );
  if (!result.rows[0]) throw new TeamFault(404, 'That invitation is no longer pending.');
  return { invitation: invitation(result.rows[0]), token };
}

export async function revokeInvitation(db: PoolClient, projectId: string, body: Body): Promise<void> {
  const id = idField(body.invitationId, 'invitation ID');
  await db.query(
    `UPDATE swdr_team_invitations SET revoked_at = now()
     WHERE project_id = $1 AND id = $2 AND accepted_at IS NULL AND revoked_at IS NULL`,
    [projectId, id]
  );
}

function tokenField(value: unknown): string {
  if (typeof value !== 'string' || !TOKEN.test(value)) throw new TeamFault(404, 'This invitation link is not valid.');
  return value;
}

async function findInvitation(db: Queryable, token: unknown, lock: boolean): Promise<InvitationRow> {
  const result = await db.query<InvitationRow>(
    `SELECT * FROM swdr_team_invitations WHERE digest = $1${lock ? ' FOR UPDATE' : ''}`,
    [tokenDigest(tokenField(token))]
  );
  const row = result.rows[0];
  if (!row || row.revoked_at) throw new TeamFault(404, 'This invitation link is not valid. Ask the project owner for a new one.');
  if (row.accepted_at) throw new TeamFault(410, 'This invitation has already been used. Sign in to open the project.');
  if (row.expires_at.getTime() <= Date.now()) {
    throw new TeamFault(410, 'This invitation has expired. Ask the project owner to send a new link.');
  }
  return row;
}

/** Public: what an invitation link offers, so a signed-out person can decide to join. */
export async function previewInvitation(db: Pool, isProvisioned: (email: string) => boolean, token: unknown): Promise<TeamInvitePreview> {
  const row = await findInvitation(db, token, false);
  let projectTitle: string | null = null;
  let episodeTitles: string[] | null = null;
  if (row.project_id) {
    const project = await db.query<{ body: Project }>('SELECT body FROM swdr_team_projects WHERE id = $1', [row.project_id]);
    const body = project.rows[0]?.body;
    if (!body) throw new TeamFault(404, 'This invitation link is not valid. Ask the project owner for a new one.');
    projectTitle = body.title;
    episodeTitles = row.episode_ids?.map(id => {
      const episode = body.episodes.find(item => item.id === id);
      return episode ? `S${episode.season} · E${episode.number} · ${episode.title}` : 'Removed episode';
    }) ?? null;
  }
  const inviter = await db.query<{ name: string }>('SELECT name FROM swdr_team_users WHERE email = $1', [row.invited_by]);
  const account = await db.query('SELECT 1 FROM swdr_team_users WHERE email = $1', [row.email]);
  return {
    email: row.email, projectTitle, role: row.role, episodeTitles,
    invitedBy: inviter.rows[0]?.name || row.invited_by,
    expiresAt: row.expires_at.toISOString(),
    accountExists: account.rows.length > 0 || isProvisioned(row.email)
  };
}

export async function lockInvitation(db: PoolClient, token: unknown): Promise<InvitationRow> {
  return findInvitation(db, token, true);
}

/** Turns a locked, pending invitation into a grant for `email`. Returns the project it opens. */
export async function acceptInvitation(db: PoolClient, row: InvitationRow, email: string): Promise<string | undefined> {
  if (row.email !== email) {
    throw new TeamFault(403, `This invitation was sent to ${row.email}. Sign in with that email to accept it.`);
  }
  let projectId: string | undefined;
  if (row.project_id && row.role) {
    const project = await db.query<{ body: Project }>('SELECT body FROM swdr_team_projects WHERE id = $1 FOR UPDATE', [row.project_id]);
    const body = project.rows[0]?.body;
    if (!body) throw new TeamFault(404, 'This project is no longer available.');
    let episodes = row.episode_ids;
    if (episodes) {
      const known = new Set(body.episodes.map(episode => episode.id));
      episodes = episodes.filter(id => known.has(id));
      if (!episodes.length) throw new TeamFault(409, 'The episodes in this invitation no longer exist. Ask for a new link.');
    }
    // An existing owner keeps ownership; anyone else takes the invited role and scope.
    await db.query(
      `INSERT INTO swdr_team_grants (project_id, email, role, episode_ids) VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, email) DO UPDATE SET
         role = CASE WHEN swdr_team_grants.role = 'owner' THEN 'owner' ELSE EXCLUDED.role END,
         episode_ids = CASE WHEN swdr_team_grants.role = 'owner' THEN swdr_team_grants.episode_ids ELSE EXCLUDED.episode_ids END`,
      [row.project_id, email, row.role, episodes]
    );
    projectId = row.project_id;
  }
  await db.query('UPDATE swdr_team_invitations SET accepted_at = now(), accepted_by = $2 WHERE id = $1', [row.id, email]);
  return projectId;
}
