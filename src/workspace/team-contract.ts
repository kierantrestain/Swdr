import type { DocumentModel, Project, Snapshot } from '../model';

export type TeamRole = 'owner' | 'editor' | 'reviewer' | 'viewer';

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
