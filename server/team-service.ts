import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { DocumentModel, Project } from '../src/model.js';
import type {
  LineChange, ReviewDocument, TeamAccount, TeamConfig, TeamGrant, TeamListing, TeamNote, TeamPresence, TeamProject, TeamRole,
  TeamSignedIn, TeamSignupMode
} from '../src/workspace/team-contract.js';
import {
  ACCESS_KEY_SESSION_SECONDS, assertNotThrottled, clearAttempts, hashPassword, newToken, PASSWORD_SESSION_SECONDS,
  recordAttempt, requirePassword, sessionCookie, signInRules, signUpRules, TOKEN, tokenDigest, verifyPassword
} from './team-auth.js';
import {
  acceptInvitation, createInvitation, episodeScope, listInvitations, listMembers, lockInvitation, previewInvitation,
  reissueInvitation, revokeInvitation, roleField
} from './team-invitations.js';
import {
  applyProjection, asObject, canReadEpisode, canWrite, currentBlock, emailField, idField,
  integerField, mergeTeamProjects, preserveSnapshots, TeamFault, textField, toVisibleProject,
  validateProject, visibleDocument
} from './team-model.js';

const HASH = /^[a-fA-F0-9]{64}$/;

export type TeamAccounts = Map<string, Buffer>;
type Body = Record<string, unknown>;
interface StoredProject {
  body: Project;
  version: number;
  role: TeamRole;
  episode_ids: string[] | null;
}
interface StoredNote {
  id: string;
  document_id: string;
  revision_id: string;
  block_id: string;
  kind: TeamNote['kind'];
  author: string;
  body: string;
  original: string | null;
  state: TeamNote['state'];
  created_at: Date;
}

export interface TeamResult {
  data: unknown;
  cookie?: string;
}

/** Deployment settings and the caller's network address, resolved by the HTTP route. */
export interface TeamContext {
  signup: TeamSignupMode;
  address: string;
}

const defaultContext: TeamContext = { signup: 'invite', address: 'unknown' };

class TeamConflict extends TeamFault {
  constructor(public readonly latest: TeamProject, public readonly paths: string[]) {
    super(409, 'Another writer changed this draft. Your local edits are still available.');
  }
}

export function conflictDetails(error: unknown) {
  return error instanceof TeamConflict ? { latest: error.latest, conflicts: error.paths } : {};
}

/**
 * Operator-provisioned access keys (SWDR_TEAM_ACCOUNTS). The variable is optional now that people can
 * create password accounts; a present but malformed value still fails closed.
 */
export function readAccounts(value?: string): TeamAccounts {
  const accounts: TeamAccounts = new Map();
  if (value === undefined || !value.trim()) return accounts;
  let configured: Body;
  try {
    configured = asObject(JSON.parse(value), 'accounts');
  } catch {
    throw new TeamFault(503, 'Private team access is not configured.');
  }
  for (const [email, digest] of Object.entries(configured)) {
    if (typeof digest !== 'string' || !HASH.test(digest)) {
      throw new TeamFault(503, 'Private team access is not configured.');
    }
    try {
      accounts.set(emailField(email), Buffer.from(digest, 'hex'));
    } catch {
      throw new TeamFault(503, 'Private team access is not configured.');
    }
  }
  return accounts;
}

const keyHash = tokenDigest;
const token = newToken;
const cookie = sessionCookie;
const blankDigest = Buffer.alloc(32);

/** Legacy sign-in with an operator-provisioned 256-bit access key. Guessing is infeasible, so it is not throttled. */
async function signIn(db: Pool, accounts: TeamAccounts, request: Body): Promise<TeamResult> {
  const email = emailField(request.email);
  const key = textField(request.key, 'access key', 256);
  const digest = accounts.get(email);
  const valid = timingSafeEqual(Buffer.from(keyHash(key), 'hex'), digest ?? blankDigest);
  if (!valid || !digest || !TOKEN.test(key)) throw new TeamFault(401, 'Email or access key was not accepted.');
  const session = token();
  await db.query(
    "INSERT INTO swdr_team_sessions (digest, email, expires_at) VALUES ($1, $2, now() + interval '12 hours')",
    [keyHash(session), email]
  );
  return { data: { email }, cookie: cookie(session, ACCESS_KEY_SESSION_SECONDS) };
}

async function startPasswordSession(db: Pool | PoolClient, email: string): Promise<string> {
  const session = token();
  await db.query(
    `INSERT INTO swdr_team_sessions (digest, email, expires_at, method)
     VALUES ($1, $2, now() + make_interval(secs => $3), 'password')`,
    [keyHash(session), email, PASSWORD_SESSION_SECONDS]
  );
  await db.query("DELETE FROM swdr_team_sessions WHERE expires_at < now() - interval '1 day'");
  return cookie(session, PASSWORD_SESSION_SECONDS);
}

interface StoredCredential {
  name: string;
  scheme: string;
  salt: Buffer;
  hash: Buffer;
}

async function signInWithPassword(db: Pool, request: Body, context: TeamContext): Promise<TeamResult> {
  const email = emailField(request.email);
  const password = textField(request.password, 'password', 1024, true);
  const rules = signInRules(email, context.address);
  await assertNotThrottled(db, rules);
  const stored = await db.query<StoredCredential>(
    `SELECT u.name, c.scheme, c.salt, c.hash FROM swdr_team_credentials c
     JOIN swdr_team_users u ON u.email = c.email WHERE c.email = $1`,
    [email]
  );
  const credential = stored.rows[0];
  if (!await verifyPassword(password, credential)) {
    await recordAttempt(db, rules);
    throw new TeamFault(401, 'Email or password was not accepted.');
  }
  await clearAttempts(db, rules.slice(0, 1));
  const sessionHeader = await startPasswordSession(db, email);
  await db.query('UPDATE swdr_team_users SET last_active_at = now() WHERE email = $1', [email]);
  const account: TeamAccount = { email, name: credential.name, method: 'password', hasPassword: true };
  return { data: { account } satisfies TeamSignedIn, cookie: sessionHeader };
}

function nameField(value: unknown): string {
  const name = textField(value, 'name', 100, true).normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!name || /\p{Cc}/u.test(name)) throw new TeamFault(400, 'Enter your name.');
  return name;
}

async function signUp(pool: Pool, accounts: TeamAccounts, request: Body, context: TeamContext): Promise<TeamResult> {
  const email = emailField(request.email);
  const name = nameField(request.name);
  const password = requirePassword(request.password, email);
  const invited = request.invite !== undefined && request.invite !== null && request.invite !== '';
  if (!invited && context.signup !== 'open') {
    throw new TeamFault(403, 'This workspace is invite-only. Open the invitation link you were sent to create an account.');
  }
  const rules = signUpRules(context.address);
  await assertNotThrottled(pool, rules);
  await recordAttempt(pool, rules);
  if (accounts.has(email)) {
    throw new TeamFault(409, 'This email signs in with a team access key. Use the access key option to sign in.');
  }
  // Derive the key before taking locks: scrypt is deliberately slow.
  const credential = await hashPassword(password);
  return transaction(pool, async db => {
    const invitation = invited ? await lockInvitation(db, request.invite) : undefined;
    if (invitation && invitation.email !== email) {
      throw new TeamFault(403, `This invitation was sent to ${invitation.email}. Create the account with that email.`);
    }
    const created = await db.query(
      'INSERT INTO swdr_team_users (email, name, last_active_at) VALUES ($1, $2, now()) ON CONFLICT DO NOTHING',
      [email, name]
    );
    if (created.rowCount !== 1) throw new TeamFault(409, 'An account with this email already exists. Sign in instead.');
    // Grants are keyed by email. A new account must not inherit access left behind by an earlier identity.
    const leftovers = await db.query('SELECT 1 FROM swdr_team_grants WHERE email = $1 LIMIT 1', [email]);
    if (leftovers.rows.length) {
      throw new TeamFault(409, 'This email already has workspace records. Ask the workspace operator to restore the account.');
    }
    await db.query(
      'INSERT INTO swdr_team_credentials (email, scheme, salt, hash) VALUES ($1, $2, $3, $4)',
      [email, credential.scheme, credential.salt, credential.hash]
    );
    const projectId = invitation ? await acceptInvitation(db, invitation, email) : undefined;
    const sessionHeader = await startPasswordSession(db, email);
    const account: TeamAccount = { email, name, method: 'password', hasPassword: true };
    return { data: { account, projectId } satisfies TeamSignedIn, cookie: sessionHeader };
  });
}

interface SessionRow {
  email: string;
  method?: TeamAccount['method'];
  name?: string | null;
  registered?: boolean;
  has_password?: boolean;
}

export async function requireAccount(db: Pool, accounts: TeamAccounts, session?: string): Promise<TeamAccount> {
  if (!session || !TOKEN.test(session)) throw new TeamFault(401, 'Sign in to the private workspace.');
  const result = await db.query<SessionRow>(
    `SELECT s.email, s.method, u.name, u.email IS NOT NULL AS registered, c.email IS NOT NULL AS has_password
     FROM swdr_team_sessions s
     LEFT JOIN swdr_team_users u ON u.email = s.email
     LEFT JOIN swdr_team_credentials c ON c.email = s.email
     WHERE s.digest = $1 AND s.expires_at > now()`,
    [keyHash(session)]
  );
  const row = result.rows[0];
  const method = row?.method ?? 'access-key';
  // Access-key sessions end when the operator removes the key; password sessions end when the account is deleted.
  const valid = row && (method === 'password' ? row.has_password === true : accounts.has(row.email));
  if (!row || !valid) throw new TeamFault(401, 'Sign in to the private workspace.');
  if (row.registered) {
    await db.query(
      `UPDATE swdr_team_users SET last_active_at = now()
       WHERE email = $1 AND (last_active_at IS NULL OR last_active_at < now() - interval '5 minutes')`,
      [row.email]
    );
  }
  return { email: row.email, name: row.name ?? '', method, hasPassword: row.has_password === true };
}

/** Lets someone signed in with an access key add a password, so the operator can later retire the key. */
async function setPassword(pool: Pool, account: TeamAccount, request: Body): Promise<TeamAccount> {
  if (account.hasPassword) throw new TeamFault(409, 'This account already has a password.');
  const password = requirePassword(request.password, account.email);
  const name = request.name === undefined ? account.name : nameField(request.name);
  const credential = await hashPassword(password);
  await transaction(pool, async db => {
    await db.query(
      `INSERT INTO swdr_team_users (email, name, last_active_at) VALUES ($1, $2, now())
       ON CONFLICT (email) DO UPDATE SET name = CASE WHEN EXCLUDED.name = '' THEN swdr_team_users.name ELSE EXCLUDED.name END`,
      [account.email, name]
    );
    const inserted = await db.query(
      'INSERT INTO swdr_team_credentials (email, scheme, salt, hash) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
      [account.email, credential.scheme, credential.salt, credential.hash]
    );
    if (inserted.rowCount !== 1) throw new TeamFault(409, 'This account already has a password.');
  });
  return { ...account, name, hasPassword: true };
}

async function transaction<T>(pool: Pool, run: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await run(db);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    db.release();
  }
}

function access(stored: StoredProject, email: string): TeamGrant {
  return { email, role: stored.role, episodeIds: stored.episode_ids };
}

function teamProject(stored: StoredProject, email: string): TeamProject {
  const grant = access(stored, email);
  return { project: toVisibleProject(stored.body, grant), version: stored.version, grant };
}

async function requireProject(db: PoolClient, id: string, email: string): Promise<StoredProject> {
  // Use the same lock for permission changes and edits, then freshly read the grant.
  const row = await db.query<{ body: Project; version: number }>(
    'SELECT body, version FROM swdr_team_projects WHERE id = $1 FOR UPDATE', [id]
  );
  const member = await db.query<{ role: TeamRole; episode_ids: string[] | null }>(
    'SELECT role, episode_ids FROM swdr_team_grants WHERE project_id = $1 AND email = $2', [id, email]
  );
  if (!row.rows[0] || !member.rows[0]) throw new TeamFault(404, 'Project unavailable.');
  return { ...row.rows[0], ...member.rows[0] };
}

function ownerOnly(grant: TeamGrant): void {
  if (grant.role !== 'owner') throw new TeamFault(403, 'Project owner access is required.');
}

function reviewerOnly(grant: TeamGrant): void {
  if (grant.role === 'viewer') throw new TeamFault(403, 'This project grants read-only access.');
}

function editorOnly(grant: TeamGrant): void {
  if (!canWrite(grant)) throw new TeamFault(403, 'Editing access is required.');
}

async function retainDocumentBindings(db: PoolClient, project: Project): Promise<void> {
  const current = await db.query<{ document_id: string; episode_id: string | null }>(
    'SELECT document_id, episode_id FROM swdr_team_documents WHERE project_id = $1',
    [project.id]
  );
  const known = new Map(current.rows.map(binding => [binding.document_id, binding.episode_id]));
  const additions = [];
  for (const document of [...project.documents, ...project.snapshots.map(snapshot => snapshot.document)]) {
    const episodeId = document.episodeId ?? null;
    if (known.has(document.id)) {
      if (known.get(document.id) !== episodeId) {
        throw new TeamFault(422, 'A document cannot move between scopes. Create a new document in that episode.');
      }
    } else {
      additions.push({ document_id: document.id, episode_id: episodeId });
      known.set(document.id, episodeId);
    }
  }
  if (additions.length) {
    await db.query(
      `INSERT INTO swdr_team_documents (project_id, document_id, episode_id)
       SELECT $1, document_id, episode_id FROM jsonb_to_recordset($2) AS b(document_id text, episode_id text)`,
      [project.id, JSON.stringify(additions)]
    );
  }
}

async function createProject(db: PoolClient, email: string, request: Body): Promise<TeamProject> {
  const project = validateProject(request.project);
  const insert = await db.query(
    'INSERT INTO swdr_team_projects (id, version, body) VALUES ($1, 1, $2) ON CONFLICT DO NOTHING',
    [project.id, project]
  );
  if (insert.rowCount !== 1) {
    const existing = await db.query<{ body: Project; version: number; role: TeamRole; episode_ids: string[] | null }>(
      `SELECT p.body, p.version, m.role, m.episode_ids
       FROM swdr_team_projects p JOIN swdr_team_grants m ON m.project_id = p.id
       WHERE p.id = $1 AND m.email = $2 AND m.role = 'owner'`, [project.id, email]
    );
    if (!existing.rows[0]) throw new TeamFault(409, 'That project could not be created.');
    return teamProject(existing.rows[0], email);
  }
  await retainDocumentBindings(db, project);
  await db.query("INSERT INTO swdr_team_grants (project_id, email, role) VALUES ($1, $2, 'owner')", [project.id, email]);
  await db.query('INSERT INTO swdr_team_versions (project_id, version, body) VALUES ($1, 1, $2)', [project.id, project]);
  return { project, grant: { email, role: 'owner', episodeIds: null }, version: 1 };
}

async function listProjects(db: Pool, email: string): Promise<TeamListing[]> {
  const result = await db.query<TeamListing>(
    `SELECT p.id, p.body->>'title' AS title, p.body->>'kind' AS kind, p.body->>'updatedAt' AS "updatedAt", m.role
     FROM swdr_team_grants m JOIN swdr_team_projects p ON p.id = m.project_id
     WHERE m.email = $1 ORDER BY p.body->>'updatedAt' DESC`, [email]
  );
  return result.rows;
}

function lineEdits(before: Project, after: Project, version: number, author: string) {
  const documents = new Map(before.documents.map(document => [document.id, document]));
  const lines = [];
  for (const document of after.documents) {
    const current = new Map(documents.get(document.id)?.blocks.map(block => [block.id, block.text]) ?? []);
    for (const block of document.blocks) {
      const previous = current.get(block.id);
      if (previous !== undefined && previous !== block.text) {
        lines.push({
          document_id: document.id, block_id: block.id, version,
          previous_text: previous, body: block.text, author
        });
      }
    }
  }
  return lines;
}

async function commitProject(db: PoolClient, stored: StoredProject, project: Project, grant: TeamGrant): Promise<TeamProject> {
  preserveSnapshots(stored.body, project);
  const version = stored.version + 1;
  const head = { ...project, updatedAt: new Date().toISOString() };
  validateProject(head);
  await retainDocumentBindings(db, head);
  await db.query(
    'UPDATE swdr_team_projects SET body = $2, version = $3 WHERE id = $1',
    [project.id, head, version]
  );
  await db.query('INSERT INTO swdr_team_versions (project_id, version, body) VALUES ($1, $2, $3)', [project.id, version, head]);
  await db.query('DELETE FROM swdr_team_versions WHERE project_id = $1 AND version < $2', [project.id, version - 100]);
  const changed = lineEdits(stored.body, head, version, grant.email);
  if (changed.length) {
    await db.query(
      `INSERT INTO swdr_team_lines (project_id, document_id, block_id, version, previous_text, body, author)
       SELECT $1, document_id, block_id, version, previous_text, body, author
       FROM jsonb_to_recordset($2) AS c(document_id text, block_id text, version int, previous_text text, body text, author text)`,
      [project.id, JSON.stringify(changed)]
    );
  }
  return { project: toVisibleProject(head, grant), version, grant };
}

async function saveProject(db: PoolClient, stored: StoredProject, grant: TeamGrant, request: Body) {
  editorOnly(grant);
  const clientEpisodes = request.expectedEpisodeIds;
  const sameScope = grant.episodeIds === null
    ? clientEpisodes === null
    : Array.isArray(clientEpisodes) && clientEpisodes.length === grant.episodeIds.length
      && grant.episodeIds.every(id => clientEpisodes.includes(id));
  if (request.expectedRole !== grant.role || !sameScope) {
    throw new TeamConflict(teamProject(stored, grant.email), ['access']);
  }
  const baseVersion = integerField(request.version, 'base version', 1, stored.version);
  const operation = idField(request.operationId, 'operation ID');
  const duplicate = await db.query<{ email: string }>(
    'SELECT email FROM swdr_team_operations WHERE project_id = $1 AND operation_id = $2',
    [stored.body.id, operation]
  );
  if (duplicate.rows[0]) {
    if (duplicate.rows[0].email !== grant.email) throw new TeamFault(409, 'The update ID is already in use.');
    return teamProject(stored, grant.email);
  }
  let proposed = validateProject(request.project);
  if (proposed.id !== stored.body.id) throw new TeamFault(400, 'The project ID does not match.');
  if (baseVersion !== stored.version) {
    const base = await db.query<{ body: Project }>(
      'SELECT body FROM swdr_team_versions WHERE project_id = $1 AND version = $2',
      [stored.body.id, baseVersion]
    );
    const older = base.rows[0]?.body;
    if (!older) throw new TeamConflict(teamProject(stored, grant.email), ['project']);
    const latest = toVisibleProject(stored.body, grant);
    const merge = mergeTeamProjects(toVisibleProject(older, grant), proposed, latest);
    if (merge.conflicts.length) throw new TeamConflict(teamProject(stored, grant.email), merge.conflicts);
    proposed = merge.project;
  }
  const result = await commitProject(db, stored, applyProjection(stored.body, proposed, grant), grant);
  await db.query(
    'INSERT INTO swdr_team_operations (project_id, operation_id, email, version) VALUES ($1, $2, $3, $4)',
    [stored.body.id, operation, grant.email, result.version]
  );
  return result;
}

/**
 * Owner action: change a member's role or episode scope, or remove them (role null). New people join through
 * an invitation link, which proves they hold the address; only operator-provisioned access-key accounts can be
 * added directly by email.
 */
async function setGrant(db: PoolClient, accounts: TeamAccounts, stored: StoredProject, grant: TeamGrant, body: Body) {
  ownerOnly(grant);
  const email = emailField(body.email);
  if (email === grant.email) throw new TeamFault(400, 'The owner cannot revoke their own access.');
  if (body.role === null) {
    await db.query('DELETE FROM swdr_team_grants WHERE project_id = $1 AND email = $2', [stored.body.id, email]);
    await db.query(
      `UPDATE swdr_team_invitations SET revoked_at = now()
       WHERE project_id = $1 AND email = $2 AND accepted_at IS NULL AND revoked_at IS NULL`,
      [stored.body.id, email]
    );
    return;
  }
  const role = roleField(body.role);
  if (body.episodeIds === undefined) throw new TeamFault(400, 'Select one or more episodes.');
  const episodes = episodeScope(stored.body, body.episodeIds);
  const member = await db.query('SELECT 1 FROM swdr_team_grants WHERE project_id = $1 AND email = $2', [stored.body.id, email]);
  if (!member.rows.length && !accounts.has(email)) {
    throw new TeamFault(400, 'This email has no private workspace account. Invite them with a link from Team & sharing.');
  }
  await db.query(
    `INSERT INTO swdr_team_grants (project_id, email, role, episode_ids) VALUES ($1, $2, $3, $4)
     ON CONFLICT (project_id, email) DO UPDATE SET role = EXCLUDED.role, episode_ids = EXCLUDED.episode_ids`,
    [stored.body.id, email, role, role === 'owner' ? null : episodes]
  );
}

async function listGrants(db: PoolClient, projectId: string, grant: TeamGrant) {
  ownerOnly(grant);
  return listMembers(db, projectId);
}

function visibleSource(project: Project, grant: TeamGrant, request: Body) {
  const id = idField(request.documentId, 'document ID');
  const revisionId = idField(request.revisionId, 'revision ID');
  const document = project.documents.find(item => item.id === id && item.revisionId === revisionId)
    ?? project.snapshots.find(item => item.document.id === id && item.document.revisionId === revisionId)?.document;
  if (!document || !canReadEpisode(grant, document.episodeId)) throw new TeamFault(404, 'Source revision unavailable.');
  return document;
}

function noteRow(row: StoredNote): TeamNote {
  return {
    id: row.id, documentId: row.document_id, revisionId: row.revision_id,
    blockId: row.block_id, kind: row.kind, author: row.author, text: row.body,
    original: row.original ?? undefined, state: row.state, createdAt: row.created_at.toISOString()
  };
}

async function listNotes(db: PoolClient, project: Project, grant: TeamGrant): Promise<TeamNote[]> {
  const projected = toVisibleProject(project, grant);
  const visible = new Map(projected.documents.map(doc => [doc.id, doc]));
  for (const snapshot of projected.snapshots) visible.set(snapshot.document.id, snapshot.document);
  const result = await db.query<StoredNote>(
    `SELECT * FROM swdr_team_notes WHERE project_id = $1 AND document_id = ANY($2::text[])
     ORDER BY created_at DESC, id DESC LIMIT 250`, [project.id, [...visible.keys()]]
  );
  return result.rows.map(noteRow);
}

async function addNote(db: PoolClient, project: Project, grant: TeamGrant, request: Body): Promise<TeamNote> {
  reviewerOnly(grant);
  const source = visibleSource(project, grant, request);
  const block = currentBlock(source, idField(request.blockId, 'line ID'));
  if (request.kind !== 'comment' && request.kind !== 'suggestion') throw new TeamFault(400, 'Invalid note type.');
  const suggestion = request.kind === 'suggestion';
  const value = textField(request.text, 'note text', suggestion ? 200000 : 10000, suggestion);
  if (suggestion && request.original !== block.text) throw new TeamFault(409, 'This line changed before the suggestion was saved.');
  const result = await db.query<StoredNote>(
    `INSERT INTO swdr_team_notes (project_id, id, document_id, revision_id, block_id, kind, author, body, original, state)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open') RETURNING *`,
    [project.id, randomBytes(16).toString('hex'), source.id, source.revisionId, block.id, request.kind, grant.email, value, block.text]
  );
  return noteRow(result.rows[0]);
}

function replaceLine(project: Project, document: DocumentModel, blockId: string, text: string): Project {
  return {
    ...project,
    documents: project.documents.map(current => current.id === document.id
      ? { ...current, blocks: current.blocks.map(block => block.id === blockId ? { ...block, text } : block) }
      : current)
  };
}

async function settleNote(db: PoolClient, stored: StoredProject, grant: TeamGrant, request: Body) {
  editorOnly(grant);
  const id = idField(request.noteId, 'note ID');
  const result = await db.query<StoredNote>('SELECT * FROM swdr_team_notes WHERE project_id = $1 AND id = $2', [stored.body.id, id]);
  const note = result.rows[0];
  if (!note) throw new TeamFault(404, 'Note unavailable.');
  visibleSource(stored.body, grant, { documentId: note.document_id, revisionId: note.revision_id });
  if (note.state !== 'open') throw new TeamFault(409, 'This note was already closed.');
  const state = request.state;
  if ((note.kind === 'comment' && state !== 'resolved')
    || (note.kind === 'suggestion' && state !== 'accepted' && state !== 'rejected')) {
    throw new TeamFault(400, 'Invalid note decision.');
  }
  let updated = teamProject(stored, grant.email);
  if (state === 'accepted') {
    const document = visibleDocument(stored.body, grant, note.document_id);
    const line = currentBlock(document, note.block_id);
    if (line.text !== note.original) throw new TeamFault(409, 'The original line changed. Review it before applying this suggestion.');
    updated = await commitProject(db, stored, replaceLine(stored.body, document, line.id, note.body), grant);
  }
  await db.query('UPDATE swdr_team_notes SET state = $3 WHERE project_id = $1 AND id = $2', [stored.body.id, id, state]);
  return updated;
}

async function lineHistory(db: PoolClient, project: Project, grant: TeamGrant, request: Body): Promise<LineChange[]> {
  const document = visibleDocument(project, grant, idField(request.documentId, 'document ID'));
  const line = currentBlock(document, idField(request.blockId, 'line ID'));
  const result = await db.query<Omit<LineChange, 'createdAt'> & { createdAt: Date }>(
    `SELECT version, previous_text AS previous, body AS text, author, created_at AS "createdAt"
     FROM swdr_team_lines WHERE project_id = $1 AND document_id = $2 AND block_id = $3 ORDER BY version DESC LIMIT 100`,
    [project.id, document.id, line.id]
  );
  return result.rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

async function restoreLine(db: PoolClient, stored: StoredProject, grant: TeamGrant, request: Body) {
  editorOnly(grant);
  if (request.version !== stored.version) throw new TeamConflict(teamProject(stored, grant.email), ['project/documents']);
  const document = visibleDocument(stored.body, grant, idField(request.documentId, 'document ID'));
  const line = currentBlock(document, idField(request.blockId, 'line ID'));
  const version = integerField(request.changeVersion, 'line change version', 1, stored.version);
  const entry = await db.query<{ previous_text: string; body: string }>(
    'SELECT previous_text, body FROM swdr_team_lines WHERE project_id = $1 AND document_id = $2 AND block_id = $3 AND version = $4',
    [stored.body.id, document.id, line.id, version]
  );
  if (!entry.rows[0]) throw new TeamFault(404, 'Line history unavailable.');
  const text = request.restorePrevious === true ? entry.rows[0].previous_text : entry.rows[0].body;
  return commitProject(db, stored, replaceLine(stored.body, document, line.id, text), grant);
}

async function createReview(db: PoolClient, project: Project, grant: TeamGrant, request: Body) {
  ownerOnly(grant);
  const id = idField(request.snapshotId, 'snapshot ID');
  const snapshot = project.snapshots.find(item => item.id === id && item.kind === 'issued');
  if (!snapshot) throw new TeamFault(404, 'Only an issued draft can be shared by review link.');
  const hours = integerField(request.hours, 'review duration', 1, 168);
  const key = token();
  const expiry = await db.query<{ expires_at: Date }>(
    `INSERT INTO swdr_team_reviews (digest, project_id, snapshot_id, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(hours => $4)) RETURNING expires_at`,
    [keyHash(key), project.id, id, hours]
  );
  return { key, expiresAt: expiry.rows[0].expires_at.toISOString() };
}

async function openReview(db: Pool, request: Body): Promise<ReviewDocument> {
  const key = textField(request.key, 'review link', 128);
  if (!TOKEN.test(key)) throw new TeamFault(404, 'Review unavailable.');
  const result = await db.query<{ body: Project; snapshot_id: string; expires_at: Date }>(
    `SELECT p.body, r.snapshot_id, r.expires_at
     FROM swdr_team_reviews r JOIN swdr_team_projects p ON p.id = r.project_id
     WHERE r.digest = $1 AND r.expires_at > now() AND r.revoked_at IS NULL`,
    [keyHash(key)]
  );
  const review = result.rows[0];
  const snapshot = review?.body.snapshots.find(item => item.id === review.snapshot_id && item.kind === 'issued');
  if (!review || !snapshot) throw new TeamFault(404, 'Review unavailable.');
  return {
    title: review.body.title,
    snapshot: { label: snapshot.label, createdAt: snapshot.createdAt, document: snapshot.document },
    expiresAt: review.expires_at.toISOString()
  };
}

/**
 * Records where the caller is and returns everyone else seen in the last 20 seconds. It reads without
 * the project lock so frequent heartbeats never queue behind saves, and it only reveals positions in
 * documents the caller may read.
 */
async function presence(pool: Pool, email: string, request: Body): Promise<TeamPresence[]> {
  const id = idField(request.projectId, 'project ID');
  const row = await pool.query<{ body: Project; role: TeamRole; episode_ids: string[] | null }>(
    `SELECT p.body, g.role, g.episode_ids FROM swdr_team_projects p JOIN swdr_team_grants g ON g.project_id = p.id
     WHERE p.id = $1 AND g.email = $2`, [id, email]
  );
  if (!row.rows[0]) throw new TeamFault(404, 'Project unavailable.');
  const { body, role, episode_ids: episodeIds } = row.rows[0];
  const grant: TeamGrant = { email, role, episodeIds };
  const readable = (documentId?: string | null) => {
    if (!documentId) return false;
    try { visibleDocument(body, grant, documentId); return true; } catch { return false; }
  };
  const documentId = request.documentId === undefined || request.documentId === null ? null : idField(request.documentId, 'document ID');
  const here = readable(documentId);
  const blockId = here && request.blockId !== undefined && request.blockId !== null ? idField(request.blockId, 'line ID') : null;
  const offset = blockId && request.offset !== undefined ? integerField(request.offset, 'cursor', 0, 1_000_000) : null;
  await pool.query(
    `INSERT INTO swdr_team_presence (project_id, email, document_id, block_id, cursor_offset, typing, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (project_id, email) DO UPDATE SET document_id = EXCLUDED.document_id, block_id = EXCLUDED.block_id,
       cursor_offset = EXCLUDED.cursor_offset, typing = EXCLUDED.typing, updated_at = now()`,
    [id, email, here ? documentId : null, blockId, offset, request.typing === true]
  );
  const others = await pool.query<{ email: string; name: string | null; document_id: string | null; block_id: string | null; cursor_offset: number | null; typing: boolean; seen: number }>(
    `SELECT pr.email, u.name, pr.document_id, pr.block_id, pr.cursor_offset, pr.typing, EXTRACT(EPOCH FROM now() - pr.updated_at)::int AS seen
     FROM swdr_team_presence pr JOIN swdr_team_grants g ON g.project_id = pr.project_id AND g.email = pr.email
     LEFT JOIN swdr_team_users u ON u.email = pr.email
     WHERE pr.project_id = $1 AND pr.email <> $2 AND pr.updated_at > now() - interval '20 seconds'
     ORDER BY pr.email`, [id, email]
  );
  return others.rows.map(other => {
    const visible = readable(other.document_id);
    return {
      email: other.email, name: other.name || other.email.split('@')[0], typing: visible && other.typing, seen: other.seen,
      ...(visible ? { documentId: other.document_id!, ...(other.block_id ? { blockId: other.block_id, offset: other.cursor_offset ?? 0 } : {}) } : {})
    };
  });
}

export async function runTeamAction(
  pool: Pool, accounts: TeamAccounts, request: Body, session?: string, context: TeamContext = defaultContext
): Promise<TeamResult> {
  switch (request.action) {
    case 'config':
      return { data: { signup: context.signup, accessKeys: accounts.size > 0 } satisfies TeamConfig };
    case 'login':
      return signIn(pool, accounts, request);
    case 'sign-in':
      return signInWithPassword(pool, request, context);
    case 'sign-up':
      return signUp(pool, accounts, request, context);
    case 'invitation':
      return { data: await previewInvitation(pool, email => accounts.has(email), request.token) };
    case 'logout':
      if (session && TOKEN.test(session)) await pool.query('DELETE FROM swdr_team_sessions WHERE digest = $1', [keyHash(session)]);
      return { data: null, cookie: cookie('', 0) };
    case 'review':
      return { data: await openReview(pool, request) };
  }
  const account = await requireAccount(pool, accounts, session);
  const email = account.email;
  switch (request.action) {
    case 'session':
      return { data: account };
    case 'set-password':
      return { data: await setPassword(pool, account, request) };
    case 'accept-invite':
      return {
        data: await transaction(pool, async db => ({
          account, projectId: await acceptInvitation(db, await lockInvitation(db, request.token), email)
        } satisfies TeamSignedIn))
      };
    case 'list':
      return { data: await listProjects(pool, email) };
    case 'create':
      return { data: await transaction(pool, db => createProject(db, email, request)) };
  }
  if (request.action === 'presence') return { data: await presence(pool, email, request) };
  const id = idField(request.projectId, 'project ID');
  return transaction(pool, async db => {
    const stored = await requireProject(db, id, email);
    const grant = access(stored, email);
    const project = stored.body;
    switch (request.action) {
      case 'open':
        return { data: teamProject(stored, email) };
      case 'save':
        return { data: await saveProject(db, stored, grant, request) };
      case 'grants':
        return { data: await listGrants(db, id, grant) };
      case 'grant':
        await setGrant(db, accounts, stored, grant, request);
        return { data: await listGrants(db, id, grant) };
      case 'invitations':
        ownerOnly(grant);
        return { data: await listInvitations(db, id) };
      case 'invite':
        ownerOnly(grant);
        return { data: await createInvitation(db, project, grant, request) };
      case 'reissue-invite':
        ownerOnly(grant);
        return { data: await reissueInvitation(db, id, request) };
      case 'revoke-invite':
        ownerOnly(grant);
        await revokeInvitation(db, id, request);
        return { data: await listInvitations(db, id) };
      case 'notes':
        return { data: await listNotes(db, project, grant) };
      case 'add-note':
        return { data: await addNote(db, project, grant, request) };
      case 'settle-note':
        return { data: await settleNote(db, stored, grant, request) };
      case 'history':
        return { data: await lineHistory(db, project, grant, request) };
      case 'restore-line':
        return { data: await restoreLine(db, stored, grant, request) };
      case 'create-review':
        return { data: await createReview(db, project, grant, request) };
      case 'revoke-review':
        ownerOnly(grant);
        await db.query(
          'UPDATE swdr_team_reviews SET revoked_at = now() WHERE project_id = $1 AND digest = $2',
          [id, keyHash(textField(request.key, 'review link', 128))]
        );
        return { data: null };
      default:
        throw new TeamFault(400, 'Unknown action.');
    }
  });
}
