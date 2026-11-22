import { newId } from '../model';
import type { Project, SourceRef } from '../model';
import { retainSources, sourceDocument, upsert, validSource } from './source';
import { storyStructure } from './story-profile';

export const STORY_KINDS = ['event', 'appearance', 'interaction', 'relationship', 'knowledge', 'arc'] as const;
export type StoryKind = (typeof STORY_KINDS)[number];
export const RELATIONSHIPS = ['Trust', 'Alliance', 'Romance', 'Conflict', 'Betrayal', 'Pressure', 'Distance'] as const;
export type RelationshipState = (typeof RELATIONSHIPS)[number];
export const RELATIONSHIP_BONDS = [
  'Partner', 'Colleague', 'Family', 'Friend', 'Mentor', 'Romantic',
  'Rival', 'Antagonist', 'Suspect', 'Informant', 'Employer', 'Neighbour'
] as const;
export type RelationshipBond = (typeof RELATIONSHIP_BONDS)[number];
export type RelationshipDirection = 'mutual' | 'directed';
export const KNOWLEDGE = ['Confirmed', 'Unresolved', 'Believes', 'Refuted'] as const;
export type KnowledgeState = (typeof KNOWLEDGE)[number];
export const CHARACTER_STATUSES = ['Active', 'Supporting', 'Departed', 'Archived'] as const;
export type CharacterStatus = (typeof CHARACTER_STATUSES)[number];
export const CHARACTER_BILLINGS = ['Series regular', 'Recurring', 'Guest'] as const;
export type CharacterBilling = (typeof CHARACTER_BILLINGS)[number];

export interface Character {
  id: string;
  name: string;
  role: string;
  motivation: string;
  conflict: string;
  aliases: string[];
  source: SourceRef;
  photoAssetId?: string;
  portraitUrl?: string;
  billing?: string;
  status?: CharacterStatus;
  bio?: string;
  notes?: string;
  assetIds?: string[];
}

export interface StoryPoint {
  id: string;
  kind: StoryKind;
  title: string;
  detail: string;
  participants: string[];
  source: SourceRef;
  storyOrder: number;
  relationship?: RelationshipState;
  /** Social/dramatic relationship type (e.g. Partner, Family, Rival, Suspect, or custom). */
  bond?: string;
  /** 'mutual' (default, A ↔ B) or 'directed' (asymmetric: participants[0] → participants[1]). */
  direction?: RelationshipDirection;
  knowledge?: KnowledgeState;
  factKey?: string;
  causeId?: string;
}

interface ReviewedException {
  id: string;
  reason: string;
  reviewedAt: string;
}

export interface StoryState {
  characters: Character[];
  points: StoryPoint[];
  exceptions: ReviewedException[];
}

export interface CanonSnapshot {
  id: string;
  createdAt: string;
  label: string;
  data: StoryState;
}

export interface StoryStore {
  schema: 1;
  draft: StoryState;
  canon: CanonSnapshot[];
}

export interface StoryScope {
  /** Season number (episodic) or Act number (film / stage play). */
  season?: number;
  /** Exact Episode ID (episodic) or Sequence/Scene unit ID (film / stage play). */
  episodeId?: string;
  /** Cutoff Episode ID (episodic) or Sequence/Scene unit ID (film / stage play). */
  asOfId?: string;
  /** Active script document when scoping a non-episodic film or stage play. */
  documentId?: string;
}

const emptyState = (): StoryState => ({ characters: [], points: [], exceptions: [] });

export function getStory(project: Project): StoryStore {
  const value = project.modules.story as Partial<StoryStore> | undefined;
  if (value?.schema === 1 && Array.isArray(value.draft?.characters)
    && Array.isArray(value.draft?.points) && Array.isArray(value.draft?.exceptions) && Array.isArray(value.canon)) {
    return value as StoryStore;
  }
  return { schema: 1, draft: emptyState(), canon: [] };
}

export function withStory(project: Project, store: StoryStore): Project {
  return { ...project, modules: { ...project.modules, story: store } };
}

function blockPosition(project: Project, source: SourceRef): number {
  const doc = sourceDocument(project, source);
  return doc && source.blockId ? Math.max(0, doc.blocks.findIndex(block => block.id === source.blockId)) : 0;
}

/** Monotonic reveal position: episode index for series, or (scene index, line index) for films and stage plays. */
export function revealTime(project: Project, source: SourceRef): number {
  const structure = storyStructure(project, source.documentId);
  if (structure.mode === 'episodic') {
    return structure.unitIndexOfSource(source);
  }
  const sceneIdx = structure.sceneIndexOfSource(source);
  return sceneIdx < 0 ? -1 : sceneIdx * 10_000 + blockPosition(project, source);
}

export function saveCharacter(project: Project, character: Character): Project {
  if (!character.name.trim() || !validSource(project, character.source, true)) throw new Error('Enter a name and choose an exact source line.');
  const store = getStory(project);
  const retained = retainSources(project, [character.source], 'Character source');
  return withStory(retained, { ...store, draft: { ...store.draft, characters: upsert(store.draft.characters, character) } });
}

export function saveStoryPoint(project: Project, point: StoryPoint): Project {
  if (!point.title.trim() || !Number.isFinite(point.storyOrder) || !validSource(project, point.source, true)) {
    throw new Error('Enter a title, story order and exact source line.');
  }
  const store = getStory(project);
  const linked = [...new Set(point.participants)];
  const pointTime = revealTime(project, point.source);
  if (linked.some(id => !store.draft.characters.some(person => person.id === id
    && revealTime(project, person.source) <= pointTime))) {
    throw new Error('Choose characters already introduced at this reveal point.');
  }
  if ((point.kind === 'relationship' || point.kind === 'interaction') && linked.length !== 2) {
    throw new Error('Choose two distinct characters.');
  }
  if ((point.kind === 'appearance' || point.kind === 'knowledge' || point.kind === 'arc') && linked.length !== 1) {
    throw new Error('Choose one character.');
  }
  if (point.kind === 'relationship' && !point.relationship) throw new Error('Choose a relationship state.');
  if (point.kind === 'knowledge' && (!point.knowledge || !point.factKey?.trim())) throw new Error('Enter a shared fact key and choose the character’s knowledge.');
  if (point.causeId && (point.causeId === point.id || !store.draft.points.some(item => item.kind === 'event' && item.id === point.causeId))) {
    throw new Error('Choose another recorded event as the cause.');
  }
  const retained = retainSources(project, [point.source], 'Story evidence');
  return withStory(retained, { ...store, draft: { ...store.draft, points: upsert(store.draft.points, { ...point, participants: linked }) } });
}

export function deleteStoryPoint(project: Project, pointId: string): Project {
  const store = getStory(project);
  const points = store.draft.points
    .filter(item => item.id !== pointId)
    .map(item => item.causeId === pointId ? { ...item, causeId: undefined } : item);
  return withStory(project, { ...store, draft: { ...store.draft, points } });
}

export function deleteCharacter(project: Project, characterId: string): Project {
  const store = getStory(project);
  const characters = store.draft.characters.filter(item => item.id !== characterId);
  const removedEventIds = new Set<string>();
  const points: StoryPoint[] = [];
  for (const item of store.draft.points) {
    if (!item.participants.includes(characterId)) {
      points.push(item);
      continue;
    }
    if (item.kind === 'event') {
      points.push({ ...item, participants: item.participants.filter(id => id !== characterId) });
    } else {
      removedEventIds.add(item.id);
    }
  }
  const cleaned = removedEventIds.size
    ? points.map(item => item.causeId && removedEventIds.has(item.causeId) ? { ...item, causeId: undefined } : item)
    : points;
  return withStory(project, { ...store, draft: { ...store.draft, characters, points: cleaned } });
}

export function approveCanon(project: Project, label?: string): Project {
  const store = getStory(project);
  if (!store.draft.characters.length && !store.draft.points.length) throw new Error('Add story records before approving canon.');
  const snapshot: CanonSnapshot = { id: newId(), createdAt: new Date().toISOString(),
    label: label?.trim() || `Canon ${store.canon.length + 1}`, data: structuredClone(store.draft) };
  return withStory(project, { ...store, canon: [...store.canon, snapshot] });
}

export function queryStory(project: Project, data: StoryState, scope: StoryScope): StoryState {
  const structure = storyStructure(project, scope.documentId);
  const units = structure.units;
  const cutoffUnitIdx = scope.asOfId ? units.findIndex(unit => unit.id === scope.asOfId) : units.length - 1;
  // Also allow scene-level asOfId (e.g. cursor scene inside a long bucketed feature script).
  const cutoffSceneIdx = scope.asOfId && cutoffUnitIdx < 0
    ? structure.scenes.findIndex(slot => slot.scene.id === scope.asOfId)
    : -1;

  const beforeCutoff = (source: SourceRef) => {
    if (!scope.asOfId) return true;
    if (cutoffSceneIdx >= 0) {
      const sIdx = structure.sceneIndexOfSource(source);
      return sIdx >= 0 && sIdx <= cutoffSceneIdx;
    }
    if (cutoffUnitIdx < 0) return true;
    if (structure.mode === 'episodic') {
      if (!source.episodeId) return true;
      const idx = structure.unitIndexOfSource(source);
      return idx >= 0 && idx <= cutoffUnitIdx;
    }
    const idx = structure.unitIndexOfSource(source);
    return idx >= 0 && idx <= cutoffUnitIdx;
  };

  const matchesExact = (source: SourceRef) => {
    if (!scope.episodeId) return true;
    if (structure.mode === 'episodic') return source.episodeId === scope.episodeId;
    const unit = structure.unitOfSource(source);
    return unit?.id === scope.episodeId || source.sceneId === scope.episodeId;
  };

  const matchesGroup = (source: SourceRef) => {
    if (!scope.season) return true;
    const unit = structure.unitOfSource(source);
    return unit?.groupNumber === scope.season;
  };

  const records = data.points.filter(point =>
    beforeCutoff(point.source) && matchesExact(point.source) && matchesGroup(point.source)
  );
  const scoped = new Set(records.flatMap(record => record.participants));
  const characters = data.characters.filter(character => beforeCutoff(character.source) && (
    (!scope.season && !scope.episodeId)
    || scoped.has(character.id)
    || (scope.episodeId ? matchesExact(character.source) : matchesGroup(character.source))
  ));
  const people = new Set(characters.map(character => character.id));
  const visible = records.filter(point => point.participants.every(id => people.has(id)));
  const events = new Set(visible.filter(point => point.kind === 'event').map(point => point.id));
  const points = visible.map(point => point.causeId && !events.has(point.causeId) ? { ...point, causeId: undefined } : point);
  const allowed = new Set(continuityConflicts(points).map(conflict => conflict.id));
  return { characters, points, exceptions: data.exceptions.filter(exception => allowed.has(exception.id)) };
}

export function sortStory(project: Project, points: StoryPoint[], order: 'reveal' | 'story'): StoryPoint[] {
  if (points.length < 2) return [...points];
  const structure = storyStructure(project);
  const blockIndexByDoc = new Map<string, Map<string, number>>();
  const indexDoc = (doc: { id: string; revisionId: string; blocks: Array<{ id: string }> }) => {
    const key = `${doc.id}:${doc.revisionId}`;
    if (blockIndexByDoc.has(key)) return;
    const map = new Map<string, number>();
    for (let i = 0; i < doc.blocks.length; i += 1) map.set(doc.blocks[i].id, i);
    blockIndexByDoc.set(key, map);
  };
  for (const doc of project.documents) indexDoc(doc);
  for (const snap of project.snapshots) indexDoc(snap.document);

  const meta = new Map<string, { reveal: number; line: number }>();
  for (const point of points) {
    const reveal = structure.mode === 'episodic'
      ? structure.unitIndexOfSource(point.source)
      : structure.sceneIndexOfSource(point.source);
    const line = point.source.blockId
      ? (blockIndexByDoc.get(`${point.source.documentId}:${point.source.revisionId}`)?.get(point.source.blockId) ?? -1)
      : -1;
    meta.set(point.id, { reveal, line });
  }
  return [...points].sort((a, b) => {
    if (order === 'story' && a.storyOrder !== b.storyOrder) return a.storyOrder - b.storyOrder;
    const ma = meta.get(a.id)!;
    const mb = meta.get(b.id)!;
    return (ma.reveal - mb.reveal) || (ma.line - mb.line) || (a.storyOrder - b.storyOrder);
  });
}

/**
 * Canonical channel key for relationship state tracking:
 * - Mutual relationships (`direction !== 'directed'`) share one symmetric key `minId/maxId` (works both ways).
 * - Directed relationships (`direction === 'directed'`) use `fromId>toId` so A→B and B→A can hold independent states.
 */
export function relationshipChannelKey(point: Pick<StoryPoint, 'participants' | 'direction'>): string {
  if (point.direction === 'directed' && point.participants.length === 2) {
    return `${point.participants[0]}>${point.participants[1]}`;
  }
  return [...point.participants].sort().join('/');
}

export function relationshipStates(project: Project, points: StoryPoint[]): StoryPoint[] {
  const states = new Map<string, StoryPoint>();
  for (const point of sortStory(project, points.filter(item => item.kind === 'relationship'), 'reveal')) {
    states.set(relationshipChannelKey(point), point);
  }
  return [...states.values()];
}

export function knowledgeStates(project: Project, points: StoryPoint[]): StoryPoint[] {
  const states = new Map<string, StoryPoint>();
  for (const point of sortStory(project, points.filter(item => item.kind === 'knowledge'), 'reveal')) {
    states.set(`${point.participants[0]}:${point.factKey?.trim().toLowerCase()}`, point);
  }
  return [...states.values()];
}

export interface SceneMatrixRow {
  source: SourceRef;
  appearances: string[];
  interactions: StoryPoint[];
}

export function sceneMatrix(points: StoryPoint[]): SceneMatrixRow[] {
  const rows = new Map<string, SceneMatrixRow>();
  for (const point of points.filter(item => item.kind === 'appearance' || item.kind === 'interaction')) {
    const key = `${point.source.documentId}:${point.source.revisionId}:${point.source.sceneId}`;
    const row = rows.get(key) ?? { source: point.source, appearances: [], interactions: [] };
    if (point.kind === 'appearance') row.appearances = [...new Set([...row.appearances, ...point.participants])];
    else row.interactions.push(point);
    rows.set(key, row);
  }
  return [...rows.values()];
}

export interface ContinuityConflict {
  id: string;
  title: string;
  records: StoryPoint[];
}

export function continuityConflicts(points: StoryPoint[]): ContinuityConflict[] {
  const problems: ContinuityConflict[] = [];
  const events = new Map(points.filter(point => point.kind === 'event').map(point => [point.id, point]));
  const groups = new Map<string, StoryPoint[]>();
  for (const point of points) {
    const cause = point.causeId ? events.get(point.causeId) : undefined;
    if (cause && cause.storyOrder > point.storyOrder) {
      problems.push({ id: `causality:${cause.id}:${cause.storyOrder}:${point.id}:${point.storyOrder}`,
        title: 'The cause follows its effect in story time', records: [cause, point] });
    }
    let key: string | undefined;
    if (point.kind === 'knowledge' && (point.knowledge === 'Confirmed' || point.knowledge === 'Refuted')) {
      key = `knowledge:${point.participants[0]}:${point.factKey?.trim().toLowerCase()}:${point.storyOrder}`;
    } else if (point.kind === 'relationship') {
      key = `relationship:${relationshipChannelKey(point)}:${point.storyOrder}`;
    }
    if (key) groups.set(key, [...(groups.get(key) ?? []), point]);
  }
  for (const [key, records] of groups) {
    const values = records.map(point => point.knowledge ?? point.relationship);
    if (new Set(values).size < 2) continue;
    const evidence = records.map((point, i) => `${point.id}=${values[i]}@${point.source.revisionId}`).sort().join('/');
    problems.push({ id: `${key}:${evidence}`, title: key.startsWith('knowledge:')
      ? 'A character both confirms and refutes the same fact' : 'Two relationship states share a story point', records });
  }
  return problems;
}

export function reviewException(project: Project, id: string, reason: string, recordIds?: string[]): Project {
  const store = getStory(project);
  const evidence = recordIds ? store.draft.points.filter(record => recordIds.includes(record.id)) : store.draft.points;
  if (!reason.trim() || !continuityConflicts(evidence).some(conflict => conflict.id === id)) {
    throw new Error('Enter a reason for the visible continuity exception.');
  }
  const exception = { id, reason: reason.trim(), reviewedAt: new Date().toISOString() };
  return withStory(project, { ...store, draft: { ...store.draft, exceptions: upsert(store.draft.exceptions, exception) } });
}
