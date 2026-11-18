export const PROJECT_KINDS = ['film', 'series', 'stage', 'documentary', 'commercial'] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];
export const DOCUMENT_KINDS = ['screenplay', 'stageplay', 'av'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const BLOCK_KINDS = ['scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'shot', 'act', 'note'] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];
export type Paper = 'letter' | 'a4';

export const TEXT_STYLES = ['bold', 'italic', 'underline'] as const;
export type TextStyle = (typeof TEXT_STYLES)[number];
/** An inline style over [from, to) of a block's text. */
export interface StyleRange { from: number; to: number; style: TextStyle }

export interface Block {
  id: string;
  kind: BlockKind;
  text: string;
  sceneId?: string;
  sceneNumber?: string;
  dual?: 'left' | 'right';
  alternate?: string[];
  revision?: string;
  styles?: StyleRange[];
}

export interface AVRow {
  id: string;
  video: string;
  audio: string;
  durationSeconds: number;
  cueSeconds?: number;
  storyboardAssetId?: string;
}

export interface Beat {
  id: string;
  title: string;
  notes: string;
  act?: 1 | 2 | 3;
  sceneId?: string;
  source?: SourceRef;
}

export interface TitlePage {
  title: string;
  byline?: string;
  author?: string;
  contact?: string;
  draftDate?: string;
}

export interface LockedPage {
  label: string;
  firstBlockId: string;
}

/** A note anchored to a passage of one screenplay element (offsets into its text). */
export interface ScriptComment {
  id: string;
  blockId: string;
  from: number;
  to: number;
  quote: string;
  text: string;
  author?: string;
  createdAt: string;
  resolved?: boolean;
  /** The anchored text was deleted; the comment keeps its last known place. */
  detached?: boolean;
}

export interface DocumentModel {
  id: string;
  episodeId?: string;
  title: string;
  kind: DocumentKind;
  paper: Paper;
  revisionId: string;
  titlePage?: TitlePage;
  blocks: Block[];
  avRows: AVRow[];
  beats: Beat[];
  lockedPages?: LockedPage[];
  revisionLabel?: string;
  showSceneNumbers?: boolean;
  comments?: ScriptComment[];
}

export interface Episode {
  id: string;
  season: number;
  number: number;
  title: string;
  synopsis: string;
}

export interface Asset {
  id: string;
  name: string;
  mime: string;
  dataUrl: string;
  addedAt: string;
}

export interface SourceRef {
  projectId: string;
  episodeId?: string;
  documentId: string;
  revisionId: string;
  sceneId?: string;
  blockId?: string;
  segmentId?: string;
  shotId?: string;
}

export interface Snapshot {
  id: string;
  kind: 'draft' | 'issued' | 'stash';
  label: string;
  createdAt: string;
  document: DocumentModel;
}

export interface Project {
  id: string;
  title: string;
  kind: ProjectKind;
  synopsis: string;
  createdAt: string;
  updatedAt: string;
  episodes: Episode[];
  documents: DocumentModel[];
  snapshots: Snapshot[];
  assets: Asset[];
  modules: Record<string, unknown>;
  archivedAt?: string;
}

export interface Scene {
  id: string;
  blockId: string;
  heading: string;
  number: string;
  index: number;
}

export interface WorkspaceViewProps {
  project: Project;
  document: DocumentModel;
  onProjectChange: (project: Project | ((current: Project) => Project)) => void;
  onDocumentChange: (document: DocumentModel | ((current: DocumentModel) => DocumentModel)) => void;
  onOpenSource: (source: SourceRef) => void;
  onStatus: (message: string) => void;
  readOnly?: boolean;
}

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function newBlock(kind: BlockKind = 'action', text = ''): Block {
  return { id: newId(), kind, text, ...(kind === 'scene' ? { sceneId: newId() } : {}) };
}

export function newDocument(title: string, kind: DocumentKind, episodeId?: string): DocumentModel {
  return {
    id: newId(), title, kind, episodeId, paper: 'letter', revisionId: newId(),
    blocks: kind === 'av' ? [] : [newBlock('scene')],
    avRows: kind === 'av' ? [{ id: newId(), video: '', audio: '', durationSeconds: 0 }] : [],
    beats: []
  };
}

export function sceneList(document: DocumentModel): Scene[] {
  const scenes: Scene[] = [];
  document.blocks.forEach((block, index) => {
    if (block.kind === 'scene') {
      scenes.push({
        id: block.sceneId ?? block.id,
        blockId: block.id,
        heading: block.text,
        number: block.sceneNumber ?? String(scenes.length + 1),
        index
      });
    }
  });
  return scenes;
}

export function sourceFor(project: Project, document: DocumentModel, extra: Partial<Pick<SourceRef, 'sceneId' | 'blockId' | 'segmentId' | 'shotId'>> = {}): SourceRef {
  return { projectId: project.id, episodeId: document.episodeId, documentId: document.id, revisionId: document.revisionId, ...extra };
}

export function durationLabel(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const time = [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60];
  return (time[0] ? time : time.slice(1)).map(value => String(value).padStart(2, '0')).join(':');
}
