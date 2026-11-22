import { sceneList } from '../model';
import type { Episode, Project } from '../model';
import { characterName } from '../writing/script-insights';
import { episodeCode, exactSource, orderedEpisodes, sourceDocument } from './source';
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

export interface CastLink {
  name: string;
  artist: string;
  status?: string;
  photoAssetId?: string;
  agent?: string;
}

interface ProductionPeopleShape {
  documents?: Record<string, {
    people?: Array<{ name?: string; type?: string; role?: string; status?: string; photoAssetId?: string; agent?: string }>;
  }>;
}

function normalizedNames(character: Pick<Character, 'name' | 'aliases'>): Set<string> {
  const names = [character.name, ...character.aliases, character.name.split(/\s+/)[0] ?? ''];
  return new Set(names.map(item => item.trim().toLocaleLowerCase('en-GB')).filter(Boolean));
}

/** Finds a matching Cast member in any Production plan of the same project, linking Series Intelligence and Production. */
export function findCastMatch(project: Project, character: Pick<Character, 'name' | 'aliases'>): CastLink | undefined {
  const production = project.modules.production as ProductionPeopleShape | undefined;
  if (!production?.documents) return undefined;
  const targets = normalizedNames(character);
  for (const plan of Object.values(production.documents)) {
    for (const person of plan.people ?? []) {
      if (person.type !== 'Cast' || !person.name) continue;
      const key = person.name.trim().toLocaleLowerCase('en-GB');
      const roleKey = (person.role ?? '').trim().toLocaleLowerCase('en-GB');
      if (targets.has(key) || (roleKey && targets.has(roleKey))) {
        return { name: person.name, artist: person.role ?? '', status: person.status, photoAssetId: person.photoAssetId, agent: person.agent };
      }
    }
  }
  return undefined;
}

/** Resolves a character's portrait URL: uploaded character asset -> linked production cast photo -> built-in portrait URL. */
export function resolveCharacterPhoto(project: Project, character: Pick<Character, 'name' | 'aliases' | 'photoAssetId' | 'portraitUrl'>): string | undefined {
  if (character.photoAssetId) {
    const asset = project.assets.find(item => item.id === character.photoAssetId);
    if (asset?.dataUrl) return asset.dataUrl;
  }
  const cast = findCastMatch(project, character);
  if (cast?.photoAssetId) {
    const asset = project.assets.find(item => item.id === cast.photoAssetId);
    if (asset?.dataUrl) return asset.dataUrl;
  }
  return character.portraitUrl || undefined;
}

export interface CharacterStats {
  records: number;
  episodes: number;
  relationships: number;
  interactions: number;
  arcMilestones: number;
  openQuestions: number;
  latestPoint?: StoryPoint;
}

/** Summary counts and latest cited point for one character inside the visible scope. */
export function characterSummaryStats(project: Project, data: StoryState, personId: string): CharacterStats {
  const own = sortStory(project, data.points.filter(point => point.participants.includes(personId)), 'reveal');
  const episodeIds = new Set(own.map(point => point.source.episodeId).filter(Boolean));
  const pairs = new Set(own.filter(point => point.kind === 'relationship').map(point => pairKey(point.participants)));
  const openQuestions = knowledgeStates(project, own).filter(point => point.knowledge === 'Unresolved' || point.knowledge === 'Believes').length;
  return {
    records: own.length,
    episodes: episodeIds.size,
    relationships: pairs.size,
    interactions: own.filter(point => point.kind === 'interaction').length,
    arcMilestones: own.filter(point => point.kind === 'arc').length,
    openQuestions,
    latestPoint: own.at(-1)
  };
}

export interface ArcStageNode {
  point: StoryPoint;
  episodeLabel: string;
  stageLabel: string;
  /** Normalized 0..1 horizontal position across the arc. */
  x: number;
  /** Normalized 0..1 dramatic intensity height (higher = more tension/stakes). */
  y: number;
  tone: 'accent' | 'warning' | 'error' | 'success';
}

const ARC_STAGES = ['Setup', 'Challenge', 'Escalation', 'Crisis', 'Choice', 'Resolution'] as const;
const ARC_TONES: ArcStageNode['tone'][] = ['accent', 'warning', 'error', 'success'];

/** Maps a character's arc milestones onto a dramatic progression curve for the dossier chart. */
export function characterArcStages(project: Project, points: StoryPoint[]): ArcStageNode[] {
  const episodes = orderedEpisodes(project);
  const byId = new Map(episodes.map(item => [item.id, item]));
  const arcs = sortStory(project, points.filter(point => point.kind === 'arc'), 'reveal');
  if (!arcs.length) return [];
  return arcs.map((point, index) => {
    const t = arcs.length === 1 ? 0.5 : index / (arcs.length - 1);
    const episode = point.source.episodeId ? byId.get(point.source.episodeId) : undefined;
    const stageIdx = arcs.length <= 4
      ? Math.min(ARC_STAGES.length - 1, Math.round(t * Math.min(3, Math.max(0, arcs.length - 1))))
      : Math.min(ARC_STAGES.length - 1, Math.floor(t * ARC_STAGES.length));
    const stageNames = arcs.length === 4 ? ['Setup', 'Challenge', 'Crisis', 'Choice']
      : arcs.length === 3 ? ['Setup', 'Turning point', 'Confrontation']
      : arcs.length === 2 ? ['Setup', 'Turn']
      : arcs.length === 1 ? ['Arc beat']
      : ARC_STAGES;
    const stageLabel = stageNames[Math.min(stageNames.length - 1, stageIdx)] ?? 'Arc beat';
    // Gentle dramatic rise into climax/choice: starts at 0.25, climbs toward 0.85
    const y = arcs.length === 1 ? 0.58 : 0.24 + t * 0.58 + Math.sin(t * Math.PI) * 0.1;
    const tone = ARC_TONES[Math.min(ARC_TONES.length - 1, Math.floor(t * ARC_TONES.length))] ?? 'accent';
    return {
      point,
      episodeLabel: episode ? episodeCode(episode) : 'Script',
      stageLabel,
      x: t,
      y: Math.min(0.92, Math.max(0.18, y)),
      tone
    };
  });
}

export interface DiscoveredCharacter {
  name: string;
  cueName: string;
  speeches: number;
  episodes: number;
  firstEpisodeLabel: string;
  source: import('../model').SourceRef;
}

export interface DiscoveredAppearance {
  characterId: string;
  characterName: string;
  episodeLabel: string;
  sceneHeading: string;
  title: string;
  storyOrder: number;
  source: import('../model').SourceRef;
}

export interface ScriptScanResult {
  newCharacters: DiscoveredCharacter[];
  newAppearances: DiscoveredAppearance[];
}

function titleCaseName(cue: string): string {
  return cue.toLowerCase().replace(/\b([a-z])/g, letter => letter.toUpperCase());
}

/**
 * Scans the project's screenplay/stageplay episodes for speaking roles and scene appearances not yet
 * recorded in the working draft. Nothing is written until the writer explicitly confirms what to import.
 */
export function scanSeriesScripts(project: Project, existing: StoryState): ScriptScanResult {
  const episodes = orderedEpisodes(project);
  const episodeById = new Map(episodes.map(item => [item.id, item]));
  const positionById = episodePositions(project);
  const docs = [...project.documents]
    .filter(doc => doc.kind !== 'av')
    .sort((a, b) => (positionById.get(a.episodeId ?? '') ?? 999) - (positionById.get(b.episodeId ?? '') ?? 999));

  const knownLookup = new Map<string, Character>();
  for (const person of existing.characters) {
    for (const key of normalizedNames(person)) knownLookup.set(key, person);
  }
  const recordedAppearances = new Set(
    existing.points
      .filter(point => point.kind === 'appearance')
      .flatMap(point => point.participants.map(id => `${id}:${point.source.documentId}:${point.source.sceneId ?? ''}`))
  );

  const discovered = new Map<string, { cueName: string; speeches: number; episodes: Set<string>; firstEpisodeLabel: string; source: import('../model').SourceRef }>();
  const newAppearances: DiscoveredAppearance[] = [];
  const seenAppearances = new Set<string>();

  for (const doc of docs) {
    const scenes = sceneList(doc);
    if (!scenes.length) continue;
    const episode = doc.episodeId ? episodeById.get(doc.episodeId) : undefined;
    const epLabel = episode ? episodeCode(episode) : doc.title;
    const epOrder = (positionById.get(doc.episodeId ?? '') ?? 0) * 10 + 10;

    for (let s = 0; s < scenes.length; s += 1) {
      const scene = scenes[s];
      const nextIndex = scenes[s + 1]?.index ?? doc.blocks.length;
      const slice = doc.blocks.slice(scene.index, nextIndex);
      for (const block of slice) {
        if (block.kind !== 'character') continue;
        const cue = characterName(block.text);
        if (!cue || cue.length < 2) continue;
        const key = cue.toLocaleLowerCase('en-GB');
        const matched = knownLookup.get(key);
        const ref = exactSource(project, doc, block.id);
        if (matched) {
          const introPos = positionById.get(matched.source.episodeId ?? '') ?? -1;
          const curPos = positionById.get(doc.episodeId ?? '') ?? -1;
          const appKey = `${matched.id}:${doc.id}:${scene.id}`;
          if (curPos >= introPos && !recordedAppearances.has(appKey) && !seenAppearances.has(appKey)) {
            seenAppearances.add(appKey);
            const heading = scene.heading || `Scene ${scene.number}`;
            newAppearances.push({
              characterId: matched.id,
              characterName: matched.name,
              episodeLabel: epLabel,
              sceneHeading: heading,
              title: `${matched.name.split(' ')[0]} in ${heading}`,
              storyOrder: epOrder + s + 1,
              source: ref
            });
          }
        } else {
          const entry = discovered.get(key);
          if (entry) {
            entry.speeches += 1;
            entry.episodes.add(epLabel);
          } else {
            discovered.set(key, {
              cueName: cue, speeches: 1, episodes: new Set([epLabel]), firstEpisodeLabel: epLabel, source: ref
            });
          }
        }
      }
    }
  }

  return {
    newCharacters: [...discovered.values()]
      .sort((a, b) => b.episodes.size - a.episodes.size || b.speeches - a.speeches)
      .map(entry => ({
        name: titleCaseName(entry.cueName),
        cueName: entry.cueName,
        speeches: entry.speeches,
        episodes: entry.episodes.size,
        firstEpisodeLabel: entry.firstEpisodeLabel,
        source: entry.source
      })),
    newAppearances
  };
}
