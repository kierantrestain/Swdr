import type { DocumentModel, Project, Snapshot } from '../model';

export type TeamRole = 'owner' | 'editor' | 'reviewer' | 'viewer';

/** Another member who is in the project now, and where. */
export interface TeamPresence {
  email: string;
  name: string;
  documentId?: string;
  blockId?: string;
  offset?: number;
  typing: boolean;
  /** Seconds since they were last seen. */
  seen: number;
}

export interface TeamGrant {
  email: string;
  role: TeamRole;
  episodeIds: string[] | null;
}

export interface TeamProject {
  project: Project;
  grant: TeamGrant;
  version: number;
}

export interface TeamListing {
  id: string;
  title: string;
  kind: Project['kind'];
  updatedAt: string;
  role: TeamRole;
}

export interface TeamNote {
  id: string;
  kind: 'comment' | 'suggestion';
  documentId: string;
  revisionId: string;
  blockId: string;
  author: string;
  text: string;
  original?: string;
  state: 'open' | 'resolved' | 'accepted' | 'rejected';
  createdAt: string;
}

export interface LineChange {
  version: number;
  previous: string;
  text: string;
  author: string;
  createdAt: string;
}

export interface ReviewDocument {
  title: string;
  snapshot: Pick<Snapshot, 'label' | 'createdAt'> & { document: DocumentModel };
  expiresAt: string;
}

export interface TeamResponse<T> {
  data?: T;
  error?: string;
  latest?: TeamProject;
  conflicts?: string[];
}

/** "open": anyone can create an account. "invite": an account needs a valid invitation link. */
export type TeamSignupMode = 'open' | 'invite';

export interface TeamConfig {
  signup: TeamSignupMode;
  /** True when operator-provisioned access keys (SWDR_TEAM_ACCOUNTS) are configured. */
  accessKeys: boolean;
}

export interface TeamAccount {
  email: string;
  name: string;
  method: 'password' | 'access-key';
  hasPassword: boolean;
}

export interface TeamMember extends TeamGrant {
  name: string;
  lastActiveAt: string | null;
  addedAt: string | null;
}

export interface TeamInvitation {
  id: string;
  email: string;
  role: TeamRole;
  episodeIds: string[] | null;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
}

export interface TeamInviteIssued {
  invitation: TeamInvitation;
  /** The single-use secret. The server keeps only its digest, so this is the only time it is visible. */
  token: string;
}

export interface TeamInvitePreview {
  email: string;
  /** Null for a workspace invitation that only lets the person create an account. */
  projectTitle: string | null;
  role: TeamRole | null;
  episodeTitles: string[] | null;
  invitedBy: string;
  expiresAt: string;
  accountExists: boolean;
}

export interface TeamSignedIn {
  account: TeamAccount;
  /** The project an accepted invitation opened, if any. */
  projectId?: string;
}
