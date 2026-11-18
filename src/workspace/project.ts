import { newDocument, newId } from '../model';
import type { DocumentModel, Project, ProjectKind, Snapshot, SourceRef } from '../model';

export function createProject(title: string, kind: ProjectKind, synopsis = ''): Project {
  const now = new Date().toISOString();
  const cleanTitle = title.trim() || 'Untitled project';
  const episode = kind === 'series' ? { id: newId(), season: 1, number: 1, title: 'Episode 1', synopsis: '' } : undefined;
  const document = newDocument(
    episode?.title ?? cleanTitle,
    kind === 'commercial' || kind === 'creator' ? 'av' : kind === 'stage' ? 'stageplay' : 'screenplay',
    episode?.id
  );
  return {
    id: newId(), title: cleanTitle, kind, synopsis, createdAt: now, updatedAt: now,
    episodes: episode ? [episode] : [], documents: [document], snapshots: [], assets: [], modules: {}
  };
}

function captureDocument(project: Project, documentId: string, label: string, kind: Snapshot['kind']) {
  const current = project.documents.find(document => document.id === documentId);
  if (!current) throw new Error('The selected document is missing.');
  const snapshot: Snapshot = {
    id: newId(),
    kind,
    label: label.trim() || new Date().toLocaleDateString(),
    createdAt: new Date().toISOString(),
    document: structuredClone(current)
  };
  const next = {
    ...project,
    documents: project.documents.map(document => document.id === documentId
      ? { ...document, revisionId: newId() }
      : document),
    snapshots: [...project.snapshots, snapshot]
  };
  return { project: next, snapshot };
}

export function snapshotDocument(project: Project, documentId: string, label: string, kind: Snapshot['kind'] = 'draft'): Project {
  return captureDocument(project, documentId, label, kind).project;
}

export function issueDocument(project: Project, documentId: string, label: string) {
  return captureDocument(project, documentId, label, 'issued');
}

export function restoreDocument(project: Project, snapshotId: string): Project {
  const saved = project.snapshots.find(snapshot => snapshot.id === snapshotId);
  if (!saved) throw new Error('The selected snapshot is missing.');
  const existing = project.documents.find(document => document.id === saved.document.id);
  const next = existing
    ? snapshotDocument(project, existing.id, 'Before restore', 'stash')
    : project;
  const document = { ...structuredClone(saved.document), revisionId: newId() };
  return {
    ...next,
    documents: existing
      ? next.documents.map(current => current.id === document.id ? document : current)
      : [...next.documents, document]
  };
}

export function resolveSource(project: Project, source: SourceRef): DocumentModel | undefined {
  if (project.id !== source.projectId) return undefined;
  const matches = (document: DocumentModel) => document.id === source.documentId
    && document.revisionId === source.revisionId
    && document.episodeId === source.episodeId;
  const document = project.documents.find(matches) ?? project.snapshots.find(snapshot => matches(snapshot.document))?.document;
  if (!document) return undefined;
  const sceneIndex = source.sceneId
    ? document.blocks.findIndex(block => block.kind === 'scene' && (block.sceneId ?? block.id) === source.sceneId)
    : -1;
  if (source.sceneId && sceneIndex < 0) return undefined;
  if (source.blockId) {
    const blockIndex = document.blocks.findIndex(block => block.id === source.blockId);
    if (blockIndex < 0 || blockIndex < sceneIndex) return undefined;
    if (sceneIndex >= 0 && document.blocks.slice(sceneIndex + 1, blockIndex + 1).some(block => block.kind === 'scene')) {
      return undefined;
    }
  }
  return document;
}
