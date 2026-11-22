import { newId } from '../model';
import type { Project, SourceRef } from '../model';
import { orderedEpisodes, retainSources, upsert, validSource } from './source';

export const STORY_KINDS = ['event', 'appearance', 'interaction', 'relationship', 'knowledge', 'arc'] as const;
export type StoryKind = (typeof STORY_KINDS)[number];
export const RELATIONSHIPS = ['Trust', 'Alliance', 'Romance', 'Conflict', 'Betrayal', 'Pressure', 'Distance'] as const;
export type RelationshipState = (typeof RELATIONSHIPS)[number];
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
  season?: number;
  episodeId?: string;
  asOfId?: string;
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

function revealTime(project: Project, source: SourceRef): number {
  return orderedEpisodes(project).findIndex(episode => episode.id === source.episodeId);
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
  if (linked.some(id => !store.draft.characters.some(person => person.id === id
    && revealTime(project, person.source) <= revealTime(project, point.source)))) {
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

export function approveCanon(project: Project, label?: string): Project {
  const store = getStory(project);
  if (!store.draft.characters.length && !store.draft.points.length) throw new Error('Add story records before approving canon.');
  const snapshot: CanonSnapshot = { id: newId(), createdAt: new Date().toISOString(),
    label: label?.trim() || `Canon ${store.canon.length + 1}`, data: structuredClone(store.draft) };
  return withStory(project, { ...store, canon: [...store.canon, snapshot] });
}

export function queryStory(project: Project, data: StoryState, scope: StoryScope): StoryState {
  const episodes = orderedEpisodes(project);
  const cutoff = scope.asOfId ? episodes.findIndex(episode => episode.id === scope.asOfId) : episodes.length - 1;
  const index = new Map(episodes.map((episode, position) => [episode.id, position]));
  const beforeCutoff = (source: SourceRef) => source.episodeId
    ? index.has(source.episodeId) && (index.get(source.episodeId) ?? Infinity) <= cutoff
    : true;
  const records = data.points.filter(point => {
    if (!beforeCutoff(point.source)) return false;
    if (scope.episodeId && point.source.episodeId !== scope.episodeId) return false;
    if (!scope.season) return true;
    return episodes.find(episode => episode.id === point.source.episodeId)?.season === scope.season;
  });
  const scoped = new Set(records.flatMap(record => record.participants));
  const characters = data.characters.filter(character => beforeCutoff(character.source) && (
    (!scope.season && !scope.episodeId) || scoped.has(character.id)
    || (scope.episodeId ? character.source.episodeId === scope.episodeId
      : episodes.find(episode => episode.id === character.source.episodeId)?.season === scope.season)
  ));
  const people = new Set(characters.map(character => character.id));
  const visible = records.filter(point => point.participants.every(id => people.has(id)));
  const events = new Set(visible.filter(point => point.kind === 'event').map(point => point.id));
  const points = visible.map(point => point.causeId && !events.has(point.causeId) ? { ...point, causeId: undefined } : point);
  const allowed = new Set(continuityConflicts(points).map(conflict => conflict.id));
  return { characters, points, exceptions: data.exceptions.filter(exception => allowed.has(exception.id)) };
}

export function sortStory(project: Project, points: StoryPoint[], order: 'reveal' | 'story'): StoryPoint[] {
  const index = new Map(orderedEpisodes(project).map((episode, position) => [episode.id, position]));
  const revisionDocuments = new Map([
    ...project.documents.map(document => [`${document.id}:${document.revisionId}`, document] as const),
    ...project.snapshots.map(({ document }) => [`${document.id}:${document.revisionId}`, document] as const)
  ]);
  const line = (point: StoryPoint) => revisionDocuments.get(`${point.source.documentId}:${point.source.revisionId}`)
    ?.blocks.findIndex(block => block.id === point.source.blockId) ?? -1;
  const reveal = (point: StoryPoint) => point.source.episodeId ? index.get(point.source.episodeId) ?? -1 : -1;
  return [...points].sort((a, b) => (order === 'story' ? a.storyOrder - b.storyOrder : 0)
    || reveal(a) - reveal(b) || line(a) - line(b) || a.storyOrder - b.storyOrder);
}

function relationshipKey(point: StoryPoint): string {
  return [...point.participants].sort().join('/');
}

export function relationshipStates(project: Project, points: StoryPoint[]): StoryPoint[] {
  const states = new Map<string, StoryPoint>();
  for (const point of sortStory(project, points.filter(item => item.kind === 'relationship'), 'reveal')) {
    states.set(relationshipKey(point), point);
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
      key = `relationship:${relationshipKey(point)}:${point.storyOrder}`;
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
