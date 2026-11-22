import { newId, sceneList, sourceFor } from '../model';
import type { DocumentModel, Episode, Project, SourceRef } from '../model';

export function orderedEpisodes(project: Project): Episode[] {
  return [...project.episodes].sort((a, b) => a.season - b.season || a.number - b.number || a.id.localeCompare(b.id));
}

export function episodeCode(episode: Episode): string {
  return `S${episode.season}E${String(episode.number).padStart(2, '0')}`;
}

export function sourceDocument(project: Project, source: SourceRef): DocumentModel | undefined {
  if (source.projectId !== project.id) return undefined;
  const matches = (document: DocumentModel) => document.id === source.documentId
    && document.episodeId === source.episodeId && document.revisionId === source.revisionId;
  return project.snapshots.find(snapshot => matches(snapshot.document))?.document ?? project.documents.find(matches);
}

export function exactSource(project: Project, document: DocumentModel, blockId?: string): SourceRef {
  const index = document.blocks.findIndex(block => block.id === blockId);
  const scene = sceneList(document).filter(entry => entry.index <= index).at(-1);
  return sourceFor(project, document, { blockId, sceneId: scene?.id });
}

export function validSource(project: Project, source: SourceRef, line = false): boolean {
  const document = sourceDocument(project, source);
  if (!document) return false;
  if (line && (!source.blockId || !source.sceneId)) return false;
  if (source.blockId && !document.blocks.some(block => block.id === source.blockId)) return false;
  if (source.blockId && exactSource(project, document, source.blockId).sceneId !== source.sceneId) return false;
  return !source.sceneId || sceneList(document).some(scene => scene.id === source.sceneId);
}

export function retainSources(project: Project, sources: SourceRef[], label: string): Project {
  for (const source of sources) {
    if (!validSource(project, source)) throw new Error('The selected source revision is unavailable.');
  }
  const versions = new Set(sources.map(source => `${source.documentId}:${source.revisionId}`));
  const retained: Project['snapshots'] = [];
  const stamp = new Date().toISOString();
  const documents = project.documents.map(document => {
    if (!versions.has(`${document.id}:${document.revisionId}`)) return document;
    const history = project.snapshots.some(snapshot => snapshot.document.id === document.id
      && snapshot.document.revisionId === document.revisionId);
    if (!history) retained.push({ id: newId(), kind: 'draft', label, createdAt: stamp, document: structuredClone(document) });
    return { ...document, revisionId: newId() };
  });
  return retained.length ? { ...project, documents, snapshots: [...project.snapshots, ...retained] } : project;
}

export function sourceLabel(project: Project, source: SourceRef): string {
  const document = sourceDocument(project, source);
  const episode = project.episodes.find(item => item.id === source.episodeId);
  const scene = document && sceneList(document).find(item => item.id === source.sceneId);
  const line = document?.blocks.findIndex(block => block.id === source.blockId) ?? -1;
  const docPrefix = episode
    ? episodeCode(episode)
    : (project.documents.length > 1 || !scene ? document?.title ?? 'Script' : undefined);
  return [docPrefix, scene && `Scene ${scene.number}`,
    line >= 0 && `Line ${line + 1}`].filter(Boolean).join(' · ');
}

export function sourceText(project: Project, source: SourceRef): string {
  return sourceDocument(project, source)?.blocks.find(block => block.id === source.blockId)?.text ?? '';
}

export function downloadText(name: string, content: string, type = 'text/markdown'): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function fileStem(title: string): string {
  return title.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'swdr';
}

export function upsert<T extends { id: string }>(items: T[], item: T): T[] {
  return items.some(value => value.id === item.id)
    ? items.map(value => value.id === item.id ? item : value) : [...items, item];
}

export function fields(text: string): string[] {
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}
