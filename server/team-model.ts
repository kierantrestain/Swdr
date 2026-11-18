import type { Block, DocumentModel, Project } from '../src/model.js';
import { BLOCK_KINDS, DOCUMENT_KINDS, PROJECT_KINDS } from '../src/model.js';
import type { TeamGrant } from '../src/workspace/team-contract.js';

export class TeamFault extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

type JsonRecord = Record<string, unknown>;

function hasObject(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function asObject(value: unknown, label = 'request'): JsonRecord {
  if (!hasObject(value)) throw new TeamFault(400, `Invalid ${label}.`);
  return value;
}

export function textField(value: unknown, name: string, maximum = 250, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > maximum || (!allowEmpty && !value.trim())) {
    throw new TeamFault(400, `Invalid ${name}.`);
  }
  return value;
}

export function idField(value: unknown, name: string): string {
  const id = textField(value, name, 128);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new TeamFault(400, `Invalid ${name}.`);
  return id;
}

export function emailField(value: unknown): string {
  // NFKC folds visually identical code points (full-width letters, ligatures) so one address has one form.
  const email = textField(value, 'email', 254).normalize('NFKC').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new TeamFault(400, 'Invalid email.');
  return email;
}

export function integerField(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new TeamFault(400, `Invalid ${name}.`);
  }
  return value;
}

function array(value: unknown, name: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new TeamFault(400, `Invalid ${name}.`);
  return value;
}

function records(value: unknown, name: string, max: number): JsonRecord[] {
  const ids = new Set<string>();
  return array(value, name, max).map(item => {
    const row = asObject(item, name);
    const id = idField(row.id, `${name} ID`);
    if (ids.has(id)) throw new TeamFault(400, `Duplicate ${name} ID.`);
    ids.add(id);
    return row;
  });
}

function memberOf(value: unknown, options: readonly string[], name: string): void {
  if (typeof value !== 'string' || !options.includes(value)) throw new TeamFault(400, `Invalid ${name}.`);
}

function verifyBlock(row: JsonRecord): void {
  memberOf(row.kind, BLOCK_KINDS, 'block type');
  textField(row.text, 'block text', 200000, true);
  if (row.sceneId !== undefined) idField(row.sceneId, 'scene ID');
  if (row.sceneNumber !== undefined) textField(row.sceneNumber, 'scene number', 24);
  if (row.dual !== undefined) memberOf(row.dual, ['left', 'right'], 'dialogue side');
  if (row.alternate !== undefined) array(row.alternate, 'alternative lines', 100).forEach(line => textField(line, 'alternative line', 40000, true));
}

function verifyDocument(document: JsonRecord, episodeIds: Set<string>): void {
  idField(document.id, 'document ID');
  idField(document.revisionId, 'revision ID');
  if (document.episodeId !== undefined && !episodeIds.has(idField(document.episodeId, 'episode ID'))) {
    throw new TeamFault(400, 'Document references a missing episode.');
  }
  textField(document.title, 'document title', 250, true);
  memberOf(document.kind, DOCUMENT_KINDS, 'document kind');
  memberOf(document.paper, ['letter', 'a4'], 'paper size');
  records(document.blocks, 'blocks', 24000).forEach(verifyBlock);
  records(document.avRows, 'AV rows', 24000).forEach(row => {
    textField(row.video, 'AV visual', 100000, true);
    textField(row.audio, 'AV audio', 100000, true);
    if (typeof row.durationSeconds !== 'number' || row.durationSeconds < 0 || row.durationSeconds > 86400) {
      throw new TeamFault(400, 'Invalid AV duration.');
    }
    if (row.storyboardAssetId !== undefined) idField(row.storyboardAssetId, 'storyboard asset ID');
  });
  records(document.beats, 'beats', 24000).forEach(row => {
    textField(row.title, 'beat title', 250, true);
    textField(row.notes, 'beat notes', 40000, true);
  });
}

const dataUrl = /^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/;

export function validateProject(input: unknown): Project {
  const project = asObject(input, 'project');
  idField(project.id, 'project ID');
  textField(project.title, 'project title');
  memberOf(project.kind, PROJECT_KINDS, 'project kind');
  textField(project.synopsis, 'synopsis', 40000, true);
  textField(project.createdAt, 'created date');
  textField(project.updatedAt, 'updated date');
  asObject(project.modules, 'workspace modules');

  const episodes = records(project.episodes, 'episodes', 500);
  const episodeIds = new Set(episodes.map(episode => idField(episode.id, 'episode ID')));
  episodes.forEach(episode => {
    textField(episode.title, 'episode title', 250, true);
    textField(episode.synopsis, 'episode synopsis', 40000, true);
    integerField(episode.season, 'season', 1, 1000);
    integerField(episode.number, 'episode number', 1, 1000);
  });
  const revisions = new Set<string>();
  const bindings = new Map<unknown, unknown>();
  const register = (document: JsonRecord) => {
    verifyDocument(document, episodeIds);
    if (bindings.has(document.id) && bindings.get(document.id) !== document.episodeId) {
      throw new TeamFault(422, 'Revisions of a document must retain their original episode.');
    }
    bindings.set(document.id, document.episodeId);
    const key = `${document.id}:${document.revisionId}`;
    if (revisions.has(key)) throw new TeamFault(400, 'A document revision can identify only one saved state.');
    revisions.add(key);
  };
  records(project.documents, 'documents', 500).forEach(register);
  records(project.snapshots, 'snapshots', 1000).forEach(snapshot => {
    memberOf(snapshot.kind, ['draft', 'issued', 'stash'], 'snapshot kind');
    textField(snapshot.label, 'snapshot label', 250);
    textField(snapshot.createdAt, 'snapshot time');
    register(asObject(snapshot.document, 'snapshot document'));
  });
  records(project.assets, 'assets', 1000).forEach(asset => {
    textField(asset.name, 'asset name', 512);
    const mime = textField(asset.mime, 'asset type', 150);
    const embedded = dataUrl.exec(textField(asset.dataUrl, 'asset bytes', 4000000));
    if (!embedded || embedded[1] !== mime) throw new TeamFault(400, 'Invalid embedded asset.');
    textField(asset.addedAt, 'asset date');
  });
  return input as Project;
}

export function canReadEpisode(grant: TeamGrant, episodeId?: string): boolean {
  return grant.episodeIds === null || (episodeId !== undefined && grant.episodeIds.includes(episodeId));
}

export function canWrite(grant: TeamGrant): boolean {
  return grant.role === 'owner' || grant.role === 'editor';
}

export function toVisibleProject(project: Project, grant: TeamGrant): Project {
  if (grant.episodeIds === null) return project;
  const documents = project.documents.filter(document => canReadEpisode(grant, document.episodeId));
  const snapshots = project.snapshots.filter(snapshot => canReadEpisode(grant, snapshot.document.episodeId));
  const visibleAssets = new Set(
    [...documents, ...snapshots.map(snapshot => snapshot.document)]
      .flatMap(document => document.avRows.map(row => row.storyboardAssetId))
  );
  return {
    id: project.id, title: project.title, kind: project.kind, synopsis: '',
    createdAt: project.createdAt, updatedAt: project.updatedAt, archivedAt: project.archivedAt,
    episodes: project.episodes.filter(episode => canReadEpisode(grant, episode.id)),
    documents, snapshots, modules: {},
    assets: project.assets.filter(asset => visibleAssets.has(asset.id))
  };
}

export function visibleDocument(project: Project, grant: TeamGrant, id: string): DocumentModel {
  const document = project.documents.find(item => item.id === id);
  if (!document || !canReadEpisode(grant, document.episodeId)) throw new TeamFault(404, 'Document unavailable.');
  return document;
}

export function currentBlock(document: DocumentModel, id: string): Block {
  const block = document.blocks.find(item => item.id === id);
  if (!block) throw new TeamFault(404, 'Line unavailable.');
  return block;
}

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => equal(item, b[index]));
  }
  if (hasObject(a) && hasObject(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
  }
  return false;
}

function keyedItems(value: unknown): value is Array<JsonRecord & { id: string }> {
  return Array.isArray(value) && value.every(item => hasObject(item) && typeof item.id === 'string');
}

function mergeNode(base: unknown, local: unknown, remote: unknown, path: string, conflicts: string[]): unknown {
  if (equal(base, local)) return remote;
  if (equal(base, remote) || equal(local, remote)) return local;
  if (keyedItems(base) && keyedItems(local) && keyedItems(remote)) {
    const baseIds = base.map(item => item.id);
    const localIds = local.map(item => item.id);
    const remoteIds = remote.map(item => item.id);
    let order: string[] | undefined;
    if (equal(baseIds, localIds)) order = remoteIds;
    else if (equal(baseIds, remoteIds) || equal(localIds, remoteIds)) order = localIds;
    else if (equal(baseIds, localIds.slice(0, baseIds.length)) && equal(baseIds, remoteIds.slice(0, baseIds.length))) {
      order = [...new Set([...remoteIds, ...localIds])];
    }
    if (order) {
      const source = new Map(base.map(item => [item.id, item]));
      const left = new Map(local.map(item => [item.id, item]));
      const right = new Map(remote.map(item => [item.id, item]));
      const kept = new Set(order);
      for (const id of baseIds) {
        if (!kept.has(id)) mergeNode(source.get(id), left.get(id), right.get(id), `${path}/${id}`, conflicts);
      }
      return order.map(id => mergeNode(source.get(id), left.get(id), right.get(id), `${path}/${id}`, conflicts))
        .filter(value => value !== undefined);
    }
  }
  if (hasObject(base) && hasObject(local) && hasObject(remote)) {
    const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
    return Object.fromEntries([...keys].map(key => {
      if (path === 'project' && key === 'updatedAt') return [key, remote[key]];
      return [key, mergeNode(base[key], local[key], remote[key], `${path}/${key}`, conflicts)];
    }).filter(([, value]) => value !== undefined));
  }
  conflicts.push(path);
  return remote;
}

export function mergeTeamProjects(base: Project, local: Project, remote: Project) {
  const conflicts: string[] = [];
  const project = mergeNode(base, local, remote, 'project', conflicts) as Project;
  return { project, conflicts };
}

export function applyProjection(current: Project, input: Project, grant: TeamGrant): Project {
  if (!canWrite(grant)) throw new TeamFault(403, 'This project grants review access.');
  if (input.id !== current.id) throw new TeamFault(400, 'The project ID does not match.');
  if (grant.episodeIds === null) return input;
  if (input.documents.some(document => !canReadEpisode(grant, document.episodeId))
    || input.snapshots.some(snapshot => !canReadEpisode(grant, snapshot.document.episodeId))) {
    throw new TeamFault(403, 'This update contains an episode outside your access.');
  }
  const permittedAssets = new Set(toVisibleProject(current, grant).assets.map(asset => asset.id));
  if ([...input.documents, ...input.snapshots.map(snapshot => snapshot.document)].some(document =>
    document.avRows.some(row => row.storyboardAssetId && !permittedAssets.has(row.storyboardAssetId)))) {
    throw new TeamFault(403, 'This update contains an asset outside your episode access.');
  }
  const hiddenIds = new Set(current.documents.filter(document => !canReadEpisode(grant, document.episodeId)).map(document => document.id));
  if (input.documents.some(document => hiddenIds.has(document.id))) {
    throw new TeamFault(403, 'The document ID belongs to a restricted episode.');
  }
  const replacements = new Map(input.documents.map(document => [document.id, document]));
  const originalIds = new Set(current.documents.map(document => document.id));
  const ordered = current.documents.flatMap(document => {
    if (!canReadEpisode(grant, document.episodeId)) return [document];
    return replacements.has(document.id) ? [replacements.get(document.id)!] : [];
  });
  return {
    ...current,
    documents: [...ordered, ...input.documents.filter(document => !originalIds.has(document.id))],
    snapshots: [
      ...current.snapshots.filter(snapshot => !canReadEpisode(grant, snapshot.document.episodeId)),
      ...input.snapshots
    ]
  };
}

function member(record: unknown, key: string): unknown {
  return hasObject(record) && Object.hasOwn(record, key) ? record[key] : undefined;
}

function immutableIssue(label: string): TeamFault {
  return new TeamFault(422, `Stored ${label} are immutable. Issue a new version instead.`);
}

function preserveIssuedList(previous: unknown, next: unknown, key: string, label: string): boolean {
  const existing = member(previous, key);
  if (!Array.isArray(existing) || !existing.length) return false;
  const candidates = member(next, key);
  if (!Array.isArray(candidates)) throw immutableIssue(label);
  const byId = new Map<string, unknown>();
  for (const candidate of candidates) {
    const id = member(candidate, 'id');
    if (typeof id !== 'string' || byId.has(id)) throw immutableIssue(label);
    byId.set(id, candidate);
  }
  if (existing.some(issue => {
    const id = member(issue, 'id');
    return typeof id !== 'string' || !equal(issue, byId.get(id));
  })) throw immutableIssue(label);
  return true;
}

function preserveModuleIssues(previous: Project['modules'], next: Project['modules']): void {
  if (preserveIssuedList(previous.story, next.story, 'canon', 'canon snapshots')) {
    const draft = member(next.story, 'draft');
    if (member(next.story, 'schema') !== 1
      || !['characters', 'points', 'exceptions'].every(key => Array.isArray(member(draft, key)))) {
      throw immutableIssue('canon snapshots');
    }
  }
  if (preserveIssuedList(previous.editorial, next.editorial, 'issues', 'editorial issues')) {
    if (member(next.editorial, 'schema') !== 1 || !hasObject(member(next.editorial, 'drafts'))
      || !['evidence', 'claims'].every(key => Array.isArray(member(next.editorial, key)))) {
      throw immutableIssue('editorial issues');
    }
  }
  const oldPlans = member(previous.production, 'documents');
  if (!hasObject(oldPlans)) return;
  const newPlans = member(next.production, 'documents');
  for (const [id, plan] of Object.entries(oldPlans)) {
    const retainedPlan = member(newPlans, id);
    const hasSheets = preserveIssuedList(plan, retainedPlan, 'callSheets', 'call sheets');
    const hasOutputs = preserveIssuedList(plan, retainedPlan, 'outputs', 'production outputs');
    if ((hasSheets || hasOutputs) && (member(next.production, 'version') !== 1 || member(retainedPlan, 'documentId') !== id)) {
      throw immutableIssue('production issues');
    }
  }
}

export function preserveSnapshots(previous: Project, next: Project): void {
  const nextSnapshots = new Map(next.snapshots.map(snapshot => [snapshot.id, snapshot]));
  if (previous.snapshots.some(snapshot => !equal(snapshot, nextSnapshots.get(snapshot.id)))) {
    throw new TeamFault(422, 'Stored snapshots are immutable. Restore one as a new draft.');
  }
  preserveModuleIssues(previous.modules, next.modules);
  const known = new Set(previous.snapshots.map(snapshot => snapshot.id));
  const previousDocuments = new Map(previous.documents.map(document => [document.id, document]));
  for (const saved of next.snapshots.filter(snapshot => !known.has(snapshot.id))) {
    const stored = previousDocuments.get(saved.document.id);
    if (stored?.revisionId === saved.document.revisionId && stored.episodeId !== saved.document.episodeId) {
      throw new TeamFault(422, 'An archived revision must retain its episode.');
    }
  }
}
