import { BLOCK_KINDS, DOCUMENT_KINDS, PROJECT_KINDS } from '../model';
import type { Asset, DocumentModel, Project } from '../model';
import { dataUrl, dataUrlBytes, MAX_FILE_BYTES, pack, requiredText, unpack } from './container';

const VERSION = 1;
const MAGIC = 'swdr-project';
const assetMime = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i;

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('The project archive contains an invalid record.');
  return value as Record<string, unknown>;
}

function list(value: unknown, max = 40000): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error('The project archive contains an invalid collection.');
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error('The project archive contains an invalid ' + label + '.');
  return value;
}

function opaqueId(value: unknown): string {
  const id = string(value, 'identifier');
  if (!/^[a-z0-9][-a-z0-9_.:]{0,127}$/i.test(id)) throw new Error('The project archive contains an invalid identifier.');
  return id;
}

function uniqueIds(values: unknown[], validate: (item: Record<string, unknown>) => void): Set<string> {
  const seen = new Set<string>();
  for (const value of values) {
    const item = record(value);
    const id = opaqueId(item.id);
    if (seen.has(id)) throw new Error('The project archive repeats identifier ' + id + '.');
    seen.add(id);
    validate(item);
  }
  return seen;
}

function optionalString(value: unknown, label: string): void {
  if (value !== undefined) string(value, label);
}

function isNonnegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function acceptKind(value: unknown, kinds: readonly string[], label: string): void {
  if (typeof value !== 'string' || !kinds.includes(value)) throw new Error('The archive contains an unknown ' + label + '.');
}

function validateDocument(item: Record<string, unknown>, episodes: Set<string>, assets: Set<string>): void {
  string(item.title, 'document title');
  opaqueId(item.revisionId);
  acceptKind(item.kind, DOCUMENT_KINDS, 'document type');
  acceptKind(item.paper, ['letter', 'a4'], 'paper size');
  if (item.episodeId !== undefined && !episodes.has(opaqueId(item.episodeId))) throw new Error('A document links to a missing episode.');
  const scenes = new Set<string>();
  const blockIds = uniqueIds(list(item.blocks), block => {
    acceptKind(block.kind, BLOCK_KINDS, 'screenplay element');
    string(block.text, 'screenplay line');
    optionalString(block.sceneNumber, 'scene number');
    optionalString(block.revision, 'block revision');
    if (block.kind === 'scene') {
      const scene = opaqueId(block.sceneId ?? block.id);
      if (scenes.has(scene)) throw new Error('A screenplay has duplicate scene identifiers.');
      scenes.add(scene);
    }
    if (block.dual !== undefined) acceptKind(block.dual, ['left', 'right'], 'dialogue alignment');
    if (block.alternate !== undefined) list(block.alternate, 200).forEach(text => string(text, 'alternate dialogue'));
  });
  uniqueIds(list(item.beats), beat => {
    string(beat.title, 'beat title');
    string(beat.notes, 'beat notes');
    if (beat.sceneId !== undefined) opaqueId(beat.sceneId);
  });
  uniqueIds(list(item.avRows), row => {
    string(row.video, 'video description');
    string(row.audio, 'audio description');
    if (!isNonnegativeNumber(row.durationSeconds) || row.cueSeconds !== undefined && !isNonnegativeNumber(row.cueSeconds)) {
      throw new Error('The archive contains an invalid AV timing value.');
    }
    if (row.storyboardAssetId !== undefined && !assets.has(opaqueId(row.storyboardAssetId))) {
      throw new Error('An AV storyboard links to a missing asset.');
    }
  });
  if (item.titlePage !== undefined) {
    const titlePage = record(item.titlePage);
    string(titlePage.title, 'title page title');
    for (const field of ['byline', 'author', 'contact', 'draftDate']) optionalString(titlePage[field], 'title page field');
  }
  if (item.lockedPages !== undefined) {
    for (const page of list(item.lockedPages)) {
      const locked = record(page);
      string(locked.label, 'locked page label');
      if (!blockIds.has(opaqueId(locked.firstBlockId))) throw new Error('A locked page links to a missing block.');
    }
  }
}

interface ArchiveAsset extends Omit<Asset, 'dataUrl'> {
  entry: string;
  size: number;
}

export function exportArchive(project: Project): Uint8Array {
  const files: Record<string, Uint8Array | string> = Object.create(null);
  const assets: ArchiveAsset[] = [];
  for (const asset of project.assets) {
    const { bytes, mime } = dataUrlBytes(asset.dataUrl);
    const entry = 'assets/' + opaqueId(asset.id);
    if (Object.hasOwn(files, entry)) throw new Error('Two attached assets use the same identifier.');
    files[entry] = bytes;
    assets.push({ id: asset.id, name: asset.name, mime, addedAt: asset.addedAt, entry, size: bytes.length });
  }
  files['manifest.json'] = JSON.stringify({ format: MAGIC, version: VERSION, project: { ...project, assets } });
  const archive = pack(files);
  if (archive.byteLength > MAX_FILE_BYTES) throw new Error('The project archive exceeds the 24 MB restore limit.');
  return archive;
}

export function importArchive(data: Uint8Array): Project {
  const files = unpack(data);
  const manifest = record(JSON.parse(requiredText(files, 'manifest.json')) as unknown);
  if (manifest.format !== MAGIC || manifest.version !== VERSION) throw new Error('This SWDR archive uses an unsupported version.');
  const project = record(manifest.project);
  opaqueId(project.id);
  string(project.title, 'project title');
  acceptKind(project.kind, PROJECT_KINDS, 'project type');
  string(project.synopsis, 'project synopsis');
  string(project.createdAt, 'creation date');
  string(project.updatedAt, 'update date');
  optionalString(project.archivedAt, 'archive date');
  record(project.modules);
  const restored: Asset[] = [];
  const assets = uniqueIds(list(project.assets, 1000), asset => {
    const id = opaqueId(asset.id);
    const mime = string(asset.mime, 'asset type');
    const entry = 'assets/' + id;
    const bytes = Object.hasOwn(files, entry) ? files[entry] : undefined;
    if (!assetMime.test(mime) || asset.entry !== entry || !bytes || asset.size !== bytes.length) {
      throw new Error('An asset is missing or inconsistent with its archive manifest.');
    }
    restored.push({ id, mime, name: string(asset.name, 'asset name'), addedAt: string(asset.addedAt, 'asset date'), dataUrl: dataUrl(bytes, mime) });
  });
  const episodes = uniqueIds(list(project.episodes, 5000), episode => {
    if (!Number.isInteger(episode.season) || !Number.isInteger(episode.number)) throw new Error('The archive contains an invalid episode position.');
    string(episode.title, 'episode title');
    string(episode.synopsis, 'episode synopsis');
  });
  const folders = project.folders !== undefined
    ? uniqueIds(list(project.folders, 500), folder => {
      string(folder.name, 'folder name');
      if (typeof folder.order !== 'number' || !Number.isFinite(folder.order)) throw new Error('The archive contains an invalid folder order.');
    })
    : undefined;
  uniqueIds(list(project.documents, 5000), document => {
    validateDocument(document, episodes, assets);
    if (document.folderId !== undefined) {
      const fid = opaqueId(document.folderId);
      if (folders && !folders.has(fid)) throw new Error('A document links to a missing folder.');
    }
  });
  uniqueIds(list(project.snapshots, 5000), snapshot => {
    acceptKind(snapshot.kind, ['draft', 'issued', 'stash'], 'snapshot type');
    string(snapshot.createdAt, 'snapshot date');
    string(snapshot.label, 'snapshot label');
    const document = record(snapshot.document);
    opaqueId(document.id);
    validateDocument(document, episodes, assets);
  });
  return { ...project, assets: restored } as unknown as Project;
}

export function decodeArchiveDocument(project: Project, documentId: string, revisionId: string): DocumentModel | undefined {
  const live = project.documents.find(item => item.id === documentId && item.revisionId === revisionId);
  return live ?? project.snapshots.find(snapshot => snapshot.document.id === documentId && snapshot.document.revisionId === revisionId)?.document;
}
