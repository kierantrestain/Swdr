import { readWorkspaceCache } from './database';
import { teamRequest } from './team-client';
import type {
  TeamAccount, TeamConfig, TeamGrant, TeamInvitation, TeamInvitePreview, TeamInviteIssued, TeamMember, TeamRole,
  TeamSignedIn
} from './team-contract';

/** People-facing names for the stored roles. "editor" is presented as Writer. */
export const roleLabels: Record<TeamRole, string> = {
  owner: 'Owner', editor: 'Writer', reviewer: 'Reviewer', viewer: 'Viewer'
};

export const roleDescriptions: Record<TeamRole, string> = {
  owner: 'Edits everything and manages people and links',
  editor: 'Writes and edits the scripts they can see',
  reviewer: 'Reads, comments and suggests line changes',
  viewer: 'Reads only'
};

export const accountApi = {
  config: () => teamRequest<TeamConfig>('config'),
  session: () => teamRequest<TeamAccount>('session'),
  signIn: (email: string, password: string) => teamRequest<TeamSignedIn>('sign-in', { email, password }),
  signInWithKey: (email: string, key: string) => teamRequest<{ email: string }>('login', { email, key }),
  signUp: (fields: { name: string; email: string; password: string; invite?: string }) =>
    teamRequest<TeamSignedIn>('sign-up', fields),
  signOut: () => teamRequest<null>('logout'),
  requestReset: (email: string) => teamRequest<{ sent: true }>('request-reset', { email }),
  resetPassword: (token: string, password: string) => teamRequest<{ email: string }>('reset-password', { token, password }),
  setPassword: (password: string, name?: string) => teamRequest<TeamAccount>('set-password', { password, name }),
  previewInvite: (token: string) => teamRequest<TeamInvitePreview>('invitation', { token }),
  acceptInvite: (token: string) => teamRequest<TeamSignedIn>('accept-invite', { token }),
  members: (projectId: string) => teamRequest<TeamMember[]>('grants', { projectId }),
  setMember: (projectId: string, email: string, role: TeamRole | null, episodeIds: string[] | null) =>
    teamRequest<TeamMember[]>('grant', { projectId, email, role, episodeIds }),
  invitations: (projectId: string) => teamRequest<TeamInvitation[]>('invitations', { projectId }),
  invite: (projectId: string, email: string, role: TeamRole, episodeIds: string[] | null) =>
    teamRequest<TeamInviteIssued>('invite', { projectId, email, role, episodeIds }),
  reissueInvite: (projectId: string, invitationId: string) =>
    teamRequest<TeamInviteIssued>('reissue-invite', { projectId, invitationId }),
  revokeInvite: (projectId: string, invitationId: string) =>
    teamRequest<TeamInvitation[]>('revoke-invite', { projectId, invitationId })
};

/** The shareable link for an invitation token. The token stays in the fragment, so it never reaches server logs. */
export function inviteLink(token: string): string {
  return `${window.location.origin}/#team?invite=${encodeURIComponent(token)}`;
}

/** Reads an invitation token from `#team?invite=…` or `/team?invite=…`. */
/** A password reset token from a #team?reset=… link. */
export function readResetToken(): string | undefined {
  const [path, query = ''] = window.location.hash.slice(1).split('?');
  const token = path === 'team' ? new URLSearchParams(query).get('reset') : null;
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
}

export function readInviteToken(): string | undefined {
  const [path, query = ''] = window.location.hash.slice(1).split('?');
  const fromHash = path === 'team' ? new URLSearchParams(query).get('invite') : null;
  const fromPath = window.location.pathname === '/team' ? new URLSearchParams(window.location.search).get('invite') : null;
  const token = fromHash ?? fromPath ?? undefined;
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
}

/** Removes the token from the address bar once it has been used, without leaving the team route. */
export function clearInviteToken(): void {
  if (readInviteToken()) window.history.replaceState(window.history.state, '', `${window.location.pathname === '/team' ? '/team' : '/'}#team`);
}

export function scopeLabel(grant: Pick<TeamGrant, 'episodeIds'>, episodes: { id: string; title: string; season: number; number: number }[]): string {
  if (!grant.episodeIds) return 'Whole project';
  return grant.episodeIds
    .map(id => episodes.find(episode => episode.id === id))
    .map(episode => episode ? `S${episode.season} · E${episode.number} ${episode.title}` : 'Removed episode')
    .join(', ');
}

/** True while the cached team draft holds edits that have not reached the server. */
export async function hasUnsyncedTeamEdits(): Promise<boolean> {
  const cached = await readWorkspaceCache<{ draft?: unknown; pending?: unknown; conflict?: unknown }>('team/current').catch(() => undefined);
  return !!(cached?.draft || cached?.pending || cached?.conflict);
}
