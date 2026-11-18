import type { Episode, Project } from '../model';
import { episodeCode, orderedEpisodes, sourceDocument } from './source';
import { knowledgeStates, sortStory } from './series-model';
import type { Character, RelationshipState, StoryPoint, StoryState, StoryStore } from './series-model';

/** Position of each episode in broadcast order across every season. */
export function episodePositions(project: Project): Map<string, number> {
  return new Map(orderedEpisodes(project).map((episode, position) => [episode.id, position]));
}

export function cellKey(characterId: string, episodeId: string): string {
  return `${characterId}|${episodeId}`;
}

export function pairKey(participants: string[]): string {
  return [...participants].sort().join('/');
}

/** Every record a character takes part in, grouped by the episode where the audience learns it. */
export function storyMap(project: Project, data: StoryState): Map<string, StoryPoint[]> {
  const cells = new Map<string, StoryPoint[]>();
  for (const point of sortStory(project, data.points, 'reveal')) {
    if (!point.source.episodeId) continue;
    for (const id of point.participants) {
      const key = cellKey(id, point.source.episodeId);
      cells.set(key, [...(cells.get(key) ?? []), point]);
    }
  }
  return cells;
}

export function episodeRecords(project: Project, points: StoryPoint[]): Map<string, StoryPoint[]> {
  const episodes = new Map<string, StoryPoint[]>();
  for (const point of sortStory(project, points, 'reveal')) {
    if (point.source.episodeId) episodes.set(point.source.episodeId, [...(episodes.get(point.source.episodeId) ?? []), point]);
  }
  return episodes;
}

export interface RelationshipTurn {
  point: StoryPoint;
  previous?: RelationshipState;
}

/** The full history of each pair, in reveal order, with the state each record replaced. */
export function relationshipHistory(project: Project, points: StoryPoint[]): Map<string, RelationshipTurn[]> {
  const history = new Map<string, RelationshipTurn[]>();
  for (const point of sortStory(project, points.filter(item => item.kind === 'relationship'), 'reveal')) {
    const key = pairKey(point.participants);
    const turns = history.get(key) ?? [];
    turns.push({ point, previous: turns.at(-1)?.point.relationship });
    history.set(key, turns);
  }
  return history;
}

/** Events revealed after another event that happens later in story time. */
export function flashbacks(project: Project, points: StoryPoint[]): Set<string> {
  const events = sortStory(project, points.filter(point => point.kind === 'event'), 'reveal');
  const result = new Set<string>();
  let latest = -Infinity;
  for (const event of events) {
    if (event.storyOrder < latest) result.add(event.id);
    latest = Math.max(latest, event.storyOrder);
  }
  return result;
}

export type CanonState = 'approved' | 'changed' | 'draft';

/** How each working-draft record compares with the latest approved canon. */
export function canonStates(store: StoryStore): Map<string, CanonState> {
  const canon = store.canon.at(-1)?.data;
  const approved = new Map<string, string>([
    ...(canon?.points ?? []).map(point => [point.id, JSON.stringify(point)] as const),
    ...(canon?.characters ?? []).map(character => [character.id, JSON.stringify(character)] as const)
  ]);
  const states = new Map<string, CanonState>();
  for (const record of [...store.draft.points, ...store.draft.characters]) {
    const saved = approved.get(record.id);
    states.set(record.id, saved === undefined ? 'draft' : saved === JSON.stringify(record) ? 'approved' : 'changed');
  }
  return states;
}

export type SourceDrift = 'current' | 'changed' | 'removed' | 'unavailable';

/** Whether the exact line a record cites still reads the same in the live draft. */
export function sourceDrift(project: Project, record: Pick<StoryPoint, 'source'>): SourceDrift {
  const cited = sourceDocument(project, record.source)?.blocks.find(block => block.id === record.source.blockId);
  const live = project.documents.find(document => document.id === record.source.documentId);
  if (!cited || !live) return 'unavailable';
  const current = live.blocks.find(block => block.id === cited.id);
  if (!current) return 'removed';
  return current.text === cited.text ? 'current' : 'changed';
}

export type CheckKind = 'open-thread' | 'absence' | 'unseen-turn' | 'source-changed' | 'early-appearance';

export interface StoryCheck {
  id: string;
  kind: CheckKind;
  title: string;
  detail: string;
  records: StoryPoint[];
  characterIds: string[];
}

const ABSENCE_EPISODES = 6;

/**
 * Suggested review prompts derived from recorded story data. They never alter records or canon:
 * the writer decides whether each one is intentional.
 */
export function storyChecks(project: Project, data: StoryState, visible: Episode[]): StoryCheck[] {
  const positions = episodePositions(project);
  const at = (point: Pick<StoryPoint, 'source'>) => positions.get(point.source.episodeId ?? '') ?? -1;
  const lastVisible = Math.max(-1, ...visible.map(episode => positions.get(episode.id) ?? -1));
  const ordered = orderedEpisodes(project);
  const code = (position: number) => ordered[position] ? episodeCode(ordered[position]) : 'this script';
  const name = (id: string) => data.characters.find(character => character.id === id)?.name ?? 'A character';
  const checks: StoryCheck[] = [];

  for (const state of knowledgeStates(project, data.points)) {
    if (state.knowledge !== 'Unresolved' && state.knowledge !== 'Believes') continue;
    const raised = sortStory(project, data.points.filter(point => point.kind === 'knowledge'
      && point.factKey?.trim().toLowerCase() === state.factKey?.trim().toLowerCase()
      && point.participants[0] === state.participants[0]), 'reveal')[0] ?? state;
    const open = Math.max(0, lastVisible - at(raised));
    checks.push({
      id: `open:${state.participants[0]}:${state.factKey}`, kind: 'open-thread', characterIds: state.participants,
      title: `${state.knowledge === 'Believes' ? 'Unconfirmed belief' : 'Open question'}: ${state.title}`,
      detail: `Raised in ${code(at(raised))}${open ? `, still ${state.knowledge === 'Believes' ? 'unconfirmed' : 'unanswered'} ${open} episode${open === 1 ? '' : 's'} later` : ''}. Pay it off or record the answer.`,
      records: raised === state ? [state] : [raised, state]
    });
  }

  for (const character of data.characters) {
    const records = data.points.filter(point => point.participants.includes(character.id));
    const last = Math.max(positions.get(character.source.episodeId ?? '') ?? -1, ...records.map(at));
    const gap = lastVisible - last;
    if (last >= 0 && gap >= ABSENCE_EPISODES) {
      checks.push({
        id: `absence:${character.id}`, kind: 'absence', characterIds: [character.id],
        title: `${character.name} has no recorded story after ${code(last)}`,
        detail: `${gap} later episodes in this view have no appearance, interaction or state change for this character.`,
        records: sortStory(project, records, 'reveal').slice(-1)
      });
    }
    for (const point of records) {
      if (at(point) >= 0 && at(point) < (positions.get(character.source.episodeId ?? '') ?? -1)) {
        checks.push({
          id: `early:${character.id}:${point.id}`, kind: 'early-appearance', characterIds: [character.id], records: [point],
          title: `${character.name} appears before the introduction`,
          detail: `“${point.title}” is revealed in ${code(at(point))}, before the character is introduced.`
        });
      }
    }
  }

  for (const turns of relationshipHistory(project, data.points).values()) {
    for (const { point, previous } of turns) {
      if (!previous || previous === point.relationship) continue;
      const together = data.points.some(item => item.kind === 'interaction' && item.source.episodeId === point.source.episodeId
        && pairKey(item.participants) === pairKey(point.participants));
      if (together) continue;
      const [a, b] = point.participants.map(name);
      checks.push({
        id: `turn:${point.id}`, kind: 'unseen-turn', characterIds: point.participants, records: [point],
        title: `${a} and ${b}: ${previous} → ${point.relationship} off screen`,
        detail: `No interaction between them is recorded in ${code(at(point))}. Confirm the change is dramatised or intentionally implied.`
      });
    }
  }

  for (const point of data.points) {
    const drift = sourceDrift(project, point);
    if (drift === 'changed' || drift === 'removed') {
      checks.push({
        id: `source:${point.id}:${point.source.revisionId}`, kind: 'source-changed', characterIds: point.participants, records: [point],
        title: drift === 'removed' ? `Source line removed: ${point.title}` : `Source line rewritten: ${point.title}`,
        detail: drift === 'removed'
          ? 'The cited line no longer exists in the current draft. The record still opens the retained revision.'
          : 'The current draft rewords the cited line. Review whether the record still holds.'
      });
    }
  }
  const rank: Record<CheckKind, number> = { 'early-appearance': 0, 'source-changed': 1, 'open-thread': 2, 'unseen-turn': 3, absence: 4 };
  return checks.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

export function introducedAt(project: Project, character: Character): number {
  return episodePositions(project).get(character.source.episodeId ?? '') ?? -1;
}
