import { sceneList } from '../model';
import type { Episode, Project, SourceRef } from '../model';
import { characterName } from '../writing/script-insights';
import { episodeCode, exactSource, orderedEpisodes, sourceDocument } from './source';
import { knowledgeStates, revealTime, sortStory } from './series-model';
import type { Character, RelationshipState, StoryPoint, StoryState, StoryStore } from './series-model';
import { primaryStoryDocument, storyBillings, storyStructure } from './story-profile';
import type { StoryUnit } from './story-profile';

/** Position of each episode in broadcast order across every season. */
export function episodePositions(project: Project): Map<string, number> {
  return new Map(orderedEpisodes(project).map((episode, position) => [episode.id, position]));
}

export function cellKey(characterId: string, unitId: string): string {
  return `${characterId}|${unitId}`;
}

export function pairKey(participants: string[]): string {
  return [...participants].sort().join('/');
}

/** Every record a character takes part in, grouped by the episode, sequence or scene where the audience learns it. */
export function storyMap(project: Project, data: StoryState, documentId?: string): Map<string, StoryPoint[]> {
  const structure = storyStructure(project, documentId);
  const cells = new Map<string, StoryPoint[]>();
  for (const point of sortStory(project, data.points, 'reveal')) {
    const unit = structure.unitOfSource(point.source);
    if (!unit) continue;
    for (const id of point.participants) {
      const key = cellKey(id, unit.id);
      cells.set(key, [...(cells.get(key) ?? []), point]);
    }
  }
  return cells;
}

/** Records grouped by their visible narrative unit (episode for series, scene/sequence for film and stage play). */
export function unitRecords(project: Project, points: StoryPoint[], documentId?: string): Map<string, StoryPoint[]> {
  const structure = storyStructure(project, documentId);
  const grouped = new Map<string, StoryPoint[]>();
  for (const point of sortStory(project, points, 'reveal')) {
    const unit = structure.unitOfSource(point.source);
    if (unit) grouped.set(unit.id, [...(grouped.get(unit.id) ?? []), point]);
  }
  return grouped;
}

export function episodeRecords(project: Project, points: StoryPoint[]): Map<string, StoryPoint[]> {
  return unitRecords(project, points);
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

export type CheckKind = 'open-thread' | 'absence' | 'unseen-turn' | 'source-changed' | 'early-appearance' | 'turnaround' | 'act-balance';

export interface StoryCheck {
  id: string;
  kind: CheckKind;
  title: string;
  detail: string;
  records: StoryPoint[];
  characterIds: string[];
}

const ABSENCE_EPISODES = 6;

function normalizeLocation(heading: string): string {
  return heading
    .replace(/^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|INT\.?|EXT\.?|I\/E\.?)\s*/i, '')
    .replace(/\s*[-–—]\s*(DAY|NIGHT|DAWN|DUSK|MORNING|EVENING|LATER|CONTINUOUS|SAME TIME|MOMENTS LATER).*$/i, '')
    .trim()
    .toLocaleLowerCase('en-GB');
}

/**
 * Suggested review prompts derived from recorded story data, tailored to the medium
 * (episodic series, 3-act film, or multi-act stage play). Never alters records or canon.
 */
export function storyChecks(project: Project, data: StoryState, visible: Array<Episode | StoryUnit>, documentId?: string): StoryCheck[] {
  const structure = storyStructure(project, documentId);
  const unitIndex = new Map(structure.units.map((unit, idx) => [unit.id, idx]));
  const at = (point: Pick<StoryPoint, 'source'>) => structure.unitIndexOfSource(point.source);
  const lastVisible = Math.max(-1, ...visible.map(item => unitIndex.get(item.id) ?? -1));
  const code = (position: number) => structure.units[position]?.code ?? 'this script';
  const name = (id: string) => data.characters.find(character => character.id === id)?.name ?? 'A character';
  const checks: StoryCheck[] = [];
  const unitNoun = structure.terms.unitSingular;
  const unitPlural = structure.terms.unitPlural;

  // 1. Open story questions & unconfirmed beliefs (setups waiting for payoffs)
  for (const state of knowledgeStates(project, data.points)) {
    if (state.knowledge !== 'Unresolved' && state.knowledge !== 'Believes') continue;
    const raised = sortStory(project, data.points.filter(point => point.kind === 'knowledge'
      && point.factKey?.trim().toLowerCase() === state.factKey?.trim().toLowerCase()
      && point.participants[0] === state.participants[0]), 'reveal')[0] ?? state;
    const open = Math.max(0, lastVisible - at(raised));
    checks.push({
      id: `open:${state.participants[0]}:${state.factKey}`, kind: 'open-thread', characterIds: state.participants,
      title: `${state.knowledge === 'Believes' ? 'Unconfirmed belief' : 'Open question'}: ${state.title}`,
      detail: `Raised in ${code(at(raised))}${open ? `, still ${state.knowledge === 'Believes' ? 'unconfirmed' : 'unanswered'} ${open} ${open === 1 ? unitNoun : unitPlural} later` : ''}. Pay it off or record the answer.`,
      records: raised === state ? [state] : [raised, state]
    });
  }

  // 2. Character absence & early appearances
  const absenceThreshold = structure.mode === 'episodic'
    ? ABSENCE_EPISODES
    : structure.bucketed ? 4 : project.kind === 'stage' ? 4 : 6;

  for (const character of data.characters) {
    const records = data.points.filter(point => point.participants.includes(character.id));
    const introIdx = at(character);
    const introTime = revealTime(project, character.source);
    const last = Math.max(introIdx, ...records.map(at));
    const gap = lastVisible - last;
    if (last >= 0 && gap >= absenceThreshold) {
      checks.push({
        id: `absence:${character.id}`, kind: 'absence', characterIds: [character.id],
        title: `${character.name} has no recorded story after ${code(last)}`,
        detail: `${gap} later ${gap === 1 ? unitNoun : unitPlural} in this view have no appearance, interaction or state change for this character.`,
        records: sortStory(project, records, 'reveal').slice(-1)
      });
    }
    for (const point of records) {
      const pointTime = revealTime(project, point.source);
      if (pointTime >= 0 && introTime >= 0 && pointTime < introTime) {
        checks.push({
          id: `early:${character.id}:${point.id}`, kind: 'early-appearance', characterIds: [character.id], records: [point],
          title: `${character.name} appears before the introduction`,
          detail: `“${point.title}” is revealed in ${code(at(point))}, before the character is introduced.`
        });
      }
    }
  }

  // 3. Off-screen relationship turns
  for (const turns of relationshipHistory(project, data.points).values()) {
    for (const { point, previous } of turns) {
      if (!previous || previous === point.relationship) continue;
      const pointUnit = structure.unitOfSource(point.source)?.id;
      const together = data.points.some(item => item.kind === 'interaction'
        && (structure.mode === 'episodic'
          ? item.source.episodeId === point.source.episodeId
          : structure.unitOfSource(item.source)?.id === pointUnit)
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

  // 4. Film-specific Act pacing balance check (when >= 4 events span multi-act film)
  if (structure.mode === 'script' && project.kind === 'film' && structure.groups.length >= 2) {
    const events = data.points.filter(point => point.kind === 'event');
    if (events.length >= 4) {
      const coveredActs = new Set(events.map(point => structure.unitOfSource(point.source)?.groupNumber).filter(Boolean));
      for (const group of structure.groups) {
        if (!coveredActs.has(group.number) && visible.some(item => ('groupNumber' in item ? item.groupNumber : item.season) === group.number)) {
          checks.push({
            id: `act-balance:${group.number}`,
            kind: 'act-balance',
            characterIds: [],
            records: [],
            title: `${group.label} has no recorded major story beats`,
            detail: `${events.length} major beats are recorded elsewhere in the script, but ${group.label} currently has none.`
          });
        }
      }
    }
  }

  // 5. Stage-play quick-change / backstage turnaround alert (back-to-back scenes in different settings within the same Act)
  if (structure.mode === 'script' && project.kind === 'stage' && structure.scenes.length >= 2) {
    const byChar = new Map<string, Map<number, StoryPoint>>();
    for (const point of data.points.filter(item => item.kind === 'appearance' || item.kind === 'interaction')) {
      const sIdx = structure.sceneIndexOfSource(point.source);
      if (sIdx < 0) continue;
      for (const id of point.participants) {
        const map = byChar.get(id) ?? new Map<number, StoryPoint>();
        if (!map.has(sIdx)) map.set(sIdx, point);
        byChar.set(id, map);
      }
    }
    for (const [charId, sceneMap] of byChar) {
      const indices = [...sceneMap.keys()].sort((a, b) => a - b);
      for (let i = 1; i < indices.length; i += 1) {
        const prevIdx = indices[i - 1];
        const nextIdx = indices[i];
        if (nextIdx !== prevIdx + 1) continue;
        const prevSlot = structure.scenes[prevIdx];
        const nextSlot = structure.scenes[nextIdx];
        if (!prevSlot || !nextSlot || prevSlot.actNumber !== nextSlot.actNumber) continue;
        const locA = normalizeLocation(prevSlot.scene.heading);
        const locB = normalizeLocation(nextSlot.scene.heading);
        if (!locA || !locB || locA === locB) continue;
        checks.push({
          id: `turnaround:${charId}:${prevIdx}:${nextIdx}`,
          kind: 'turnaround',
          characterIds: [charId],
          records: [sceneMap.get(prevIdx)!, sceneMap.get(nextIdx)!],
          title: `Quick-change alert: ${name(charId)} (${prevSlot.actLabel} Sc ${prevSlot.scene.number} → Sc ${nextSlot.scene.number})`,
          detail: `${name(charId)} exits ${prevSlot.scene.heading || `Scene ${prevSlot.scene.number}`} and immediately enters ${nextSlot.scene.heading || `Scene ${nextSlot.scene.number}`} with no scene break or intermission between them.`
        });
      }
    }
  }

  // 6. Rewritten or removed script citations
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

  const rank: Record<CheckKind, number> = {
    'early-appearance': 0,
    'source-changed': 1,
    'open-thread': 2,
    'turnaround': 3,
    'unseen-turn': 4,
    'act-balance': 5,
    'absence': 6
  };
  return checks.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

export interface StageCharacterLoad {
  character: Character;
  totalScenes: number;
  byAct: Array<{ actNumber: number; actLabel: string; scenes: number }>;
}

export interface DoublingCandidate {
  a: Character;
  b: Character;
  combinedScenes: number;
  note: string;
}

/**
 * Stage-play specific breakdown: on-stage scene load per Act and repertory actor doubling candidates
 * (non-Principal characters who never share a scene and never have a 0-scene turnaround).
 */
export function stageDoublingAnalysis(project: Project, data: StoryState, documentId?: string): {
  loads: StageCharacterLoad[];
  doublingPairs: DoublingCandidate[];
} {
  const structure = storyStructure(project, documentId);
  const sceneSets = new Map<string, Set<number>>();
  for (const person of data.characters) sceneSets.set(person.id, new Set());
  for (const point of data.points.filter(item => item.kind === 'appearance' || item.kind === 'interaction')) {
    const sIdx = structure.sceneIndexOfSource(point.source);
    if (sIdx < 0) continue;
    for (const id of point.participants) {
      sceneSets.get(id)?.add(sIdx);
    }
  }

  const loads: StageCharacterLoad[] = data.characters.map(character => {
    const indices = sceneSets.get(character.id) ?? new Set<number>();
    const byAct = structure.groups.map(group => {
      let count = 0;
      for (const sIdx of indices) {
        if (structure.scenes[sIdx]?.actNumber === group.number) count += 1;
      }
      return { actNumber: group.number, actLabel: group.label, scenes: count };
    });
    return { character, totalScenes: indices.size, byAct };
  }).sort((a, b) => b.totalScenes - a.totalScenes);

  const doublingPairs: DoublingCandidate[] = [];
  const eligible = data.characters.filter(person => (person.billing ?? '') !== 'Principal' && (sceneSets.get(person.id)?.size ?? 0) > 0);
  for (let i = 0; i < eligible.length; i += 1) {
    for (let j = i + 1; j < eligible.length; j += 1) {
      const a = eligible[i];
      const b = eligible[j];
      const setA = sceneSets.get(a.id)!;
      const setB = sceneSets.get(b.id)!;
      let clashes = false;
      let tightChange = false;
      for (const idx of setA) {
        if (setB.has(idx)) { clashes = true; break; }
        if ((setB.has(idx - 1) && structure.scenes[idx - 1]?.actNumber === structure.scenes[idx]?.actNumber)
          || (setB.has(idx + 1) && structure.scenes[idx + 1]?.actNumber === structure.scenes[idx]?.actNumber)) {
          tightChange = true;
        }
      }
      if (!clashes) {
        doublingPairs.push({
          a,
          b,
          combinedScenes: setA.size + setB.size,
          note: tightChange ? 'Never share a scene (tight adjacent-scene costume change)' : 'Never share a scene · clean backstage turnaround'
        });
      }
    }
  }

  return {
    loads,
    doublingPairs: doublingPairs.sort((x, y) => Number(x.note.includes('tight')) - Number(y.note.includes('tight')) || x.combinedScenes - y.combinedScenes).slice(0, 8)
  };
}

export function introducedAt(project: Project, character: Character, documentId?: string): number {
  return storyStructure(project, documentId).unitIndexOfSource(character.source);
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

/** Finds a matching Cast member in any Production plan of the same project, linking Story Intelligence and Production. */
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
export function characterSummaryStats(project: Project, data: StoryState, personId: string, documentId?: string): CharacterStats {
  const structure = storyStructure(project, documentId);
  const own = sortStory(project, data.points.filter(point => point.participants.includes(personId)), 'reveal');
  const unitIds = new Set(own.map(point => structure.unitOfSource(point.source)?.id).filter(Boolean));
  const pairs = new Set(own.filter(point => point.kind === 'relationship').map(point => pairKey(point.participants)));
  const openQuestions = knowledgeStates(project, own).filter(point => point.knowledge === 'Unresolved' || point.knowledge === 'Believes').length;
  return {
    records: own.length,
    episodes: unitIds.size,
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
export function characterArcStages(project: Project, points: StoryPoint[], documentId?: string): ArcStageNode[] {
  const structure = storyStructure(project, documentId);
  const arcs = sortStory(project, points.filter(point => point.kind === 'arc'), 'reveal');
  if (!arcs.length) return [];
  return arcs.map((point, index) => {
    const t = arcs.length === 1 ? 0.5 : index / (arcs.length - 1);
    const stageIdx = arcs.length <= 4
      ? Math.min(ARC_STAGES.length - 1, Math.round(t * Math.min(3, Math.max(0, arcs.length - 1))))
      : Math.min(ARC_STAGES.length - 1, Math.floor(t * ARC_STAGES.length));
    const stageNames = arcs.length === 4 ? ['Setup', 'Challenge', 'Crisis', 'Choice']
      : arcs.length === 3 ? ['Setup', 'Turning point', 'Confrontation']
      : arcs.length === 2 ? ['Setup', 'Turn']
      : arcs.length === 1 ? ['Arc beat']
      : ARC_STAGES;
    const stageLabel = stageNames[Math.min(stageNames.length - 1, stageIdx)] ?? 'Arc beat';
    const y = arcs.length === 1 ? 0.58 : 0.24 + t * 0.58 + Math.sin(t * Math.PI) * 0.1;
    const tone = ARC_TONES[Math.min(ARC_TONES.length - 1, Math.floor(t * ARC_TONES.length))] ?? 'accent';
    return {
      point,
      episodeLabel: structure.unitCodeOfSource(point.source),
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
  scenes: number;
  suggestedBilling: string;
  firstEpisodeLabel: string;
  source: SourceRef;
}

export interface DiscoveredAppearance {
  characterId: string;
  characterName: string;
  episodeLabel: string;
  sceneHeading: string;
  title: string;
  storyOrder: number;
  source: SourceRef;
}

export interface DiscoveredLink {
  key: string;
  aKey: string;
  bKey: string;
  aName: string;
  bName: string;
  sharedScenes: number;
  firstSceneLabel: string;
  title: string;
  storyOrder: number;
  source: SourceRef;
}

export interface ScriptScanResult {
  newCharacters: DiscoveredCharacter[];
  newAppearances: DiscoveredAppearance[];
  suggestedLinks: DiscoveredLink[];
}

export interface ScriptDiscoveryPreview {
  speakingRoles: number;
  scenes: number;
  groups: number;
  groupLabel: string;
  sharedPairs: number;
  topNames: string[];
}

function titleCaseName(cue: string): string {
  return cue.toLowerCase().replace(/\b([a-z])/g, letter => letter.toUpperCase());
}

/** Lightweight summary of what exists in the script(s) right now, used for empty-state onboarding on films, stage plays and series. */
export function scriptDiscoveryPreview(project: Project, documentId?: string): ScriptDiscoveryPreview {
  const structure = storyStructure(project, documentId);
  const docs = structure.mode === 'episodic'
    ? project.documents.filter(doc => doc.kind !== 'av')
    : [primaryStoryDocument(project, documentId)].filter((item): item is NonNullable<typeof item> => Boolean(item && item.kind !== 'av'));

  const speechesByChar = new Map<string, number>();
  const pairs = new Set<string>();
  let totalScenes = 0;

  for (const doc of docs) {
    const scenes = sceneList(doc);
    totalScenes += scenes.length;
    for (let s = 0; s < scenes.length; s += 1) {
      const scene = scenes[s];
      const nextIndex = scenes[s + 1]?.index ?? doc.blocks.length;
      const speakersInScene = new Set<string>();
      for (const block of doc.blocks.slice(scene.index, nextIndex)) {
        if (block.kind !== 'character') continue;
        const cue = characterName(block.text);
        if (!cue || cue.length < 2) continue;
        const key = cue.toLocaleLowerCase('en-GB');
        speechesByChar.set(key, (speechesByChar.get(key) ?? 0) + 1);
        speakersInScene.add(key);
      }
      const list = [...speakersInScene].sort();
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          pairs.add(`${list[i]}/${list[j]}`);
        }
      }
    }
  }

  const topNames = [...speechesByChar.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([key]) => titleCaseName(key));

  return {
    speakingRoles: speechesByChar.size,
    scenes: totalScenes,
    groups: structure.groups.length,
    groupLabel: structure.terms.groupLabel.toLowerCase(),
    sharedPairs: pairs.size,
    topNames
  };
}

/**
 * Scans the project's screenplay or stageplay scripts for speaking roles, scene appearances, and
 * recurring shared-scene character pairs not yet recorded in the working draft. Nothing is written
 * until the writer explicitly confirms what to import.
 */
export function scanProjectScripts(project: Project, existing: StoryState, documentId?: string): ScriptScanResult {
  const structure = storyStructure(project, documentId);
  const episodes = orderedEpisodes(project);
  const episodeById = new Map(episodes.map(item => [item.id, item]));
  const positionById = episodePositions(project);
  const docs = structure.mode === 'episodic'
    ? [...project.documents]
      .filter(doc => doc.kind !== 'av')
      .sort((a, b) => (positionById.get(a.episodeId ?? '') ?? 999) - (positionById.get(b.episodeId ?? '') ?? 999))
    : [...project.documents].filter(doc => doc.kind !== 'av');

  const knownLookup = new Map<string, Character>();
  for (const person of existing.characters) {
    for (const key of normalizedNames(person)) knownLookup.set(key, person);
  }
  const recordedAppearances = new Set(
    existing.points
      .filter(point => point.kind === 'appearance')
      .flatMap(point => point.participants.map(id => `${id}:${point.source.documentId}:${point.source.sceneId ?? ''}`))
  );
  const existingRelPairs = new Set(
    existing.points
      .filter(point => point.kind === 'relationship')
      .map(point => pairKey(point.participants))
  );

  const discovered = new Map<string, { cueName: string; speeches: number; episodes: Set<string>; scenes: Set<string>; firstEpisodeLabel: string; source: SourceRef }>();
  const newAppearances: DiscoveredAppearance[] = [];
  const seenAppearances = new Set<string>();
  const coPresence = new Map<string, { aKey: string; bKey: string; aName: string; bName: string; sharedScenes: number; firstSceneLabel: string; firstHeading: string; storyOrder: number; source: SourceRef }>();

  for (const doc of docs) {
    const scenes = sceneList(doc);
    if (!scenes.length) continue;
    const episode = doc.episodeId ? episodeById.get(doc.episodeId) : undefined;
    const docLabel = episode ? episodeCode(episode) : doc.title;
    const baseOrder = structure.mode === 'episodic'
      ? (positionById.get(doc.episodeId ?? '') ?? 0) * 100 + 10
      : 10;

    for (let s = 0; s < scenes.length; s += 1) {
      const scene = scenes[s];
      const nextIndex = scenes[s + 1]?.index ?? doc.blocks.length;
      const slice = doc.blocks.slice(scene.index, nextIndex);
      const sceneSpeakers = new Map<string, { name: string; ref: SourceRef; existingId?: string }>();

      for (const block of slice) {
        if (block.kind !== 'character') continue;
        const cue = characterName(block.text);
        if (!cue || cue.length < 2) continue;
        const key = cue.toLocaleLowerCase('en-GB');
        const matched = knownLookup.get(key);
        const ref = exactSource(project, doc, block.id);
        const unitLabel = structure.mode === 'episodic' ? docLabel : structure.unitCodeOfSource(ref);

        if (!sceneSpeakers.has(key)) {
          sceneSpeakers.set(key, { name: matched?.name ?? titleCaseName(cue), ref, existingId: matched?.id });
        }

        if (matched) {
          const introTime = revealTime(project, matched.source);
          const curTime = revealTime(project, ref);
          const appKey = `${matched.id}:${doc.id}:${scene.id}`;
          if (curTime >= introTime && !recordedAppearances.has(appKey) && !seenAppearances.has(appKey)) {
            seenAppearances.add(appKey);
            const heading = scene.heading || `Scene ${scene.number}`;
            newAppearances.push({
              characterId: matched.id,
              characterName: matched.name,
              episodeLabel: unitLabel,
              sceneHeading: heading,
              title: `${matched.name.split(' ')[0]} in ${heading}`,
              storyOrder: baseOrder + s + 1,
              source: ref
            });
          }
        } else {
          const entry = discovered.get(key);
          if (entry) {
            entry.speeches += 1;
            entry.episodes.add(docLabel);
            entry.scenes.add(`${doc.id}:${scene.id}`);
          } else {
            discovered.set(key, {
              cueName: cue,
              speeches: 1,
              episodes: new Set([docLabel]),
              scenes: new Set([`${doc.id}:${scene.id}`]),
              firstEpisodeLabel: unitLabel,
              source: ref
            });
          }
        }
      }

      // Track shared-scene pairs for optional co-presence relationship seeding
      const speakerEntries = [...sceneSpeakers.entries()].sort((x, y) => x[0].localeCompare(y[0]));
      for (let i = 0; i < speakerEntries.length; i += 1) {
        for (let j = i + 1; j < speakerEntries.length; j += 1) {
          const [aKey, aInfo] = speakerEntries[i];
          const [bKey, bInfo] = speakerEntries[j];
          if (aInfo.existingId && bInfo.existingId && existingRelPairs.has(pairKey([aInfo.existingId, bInfo.existingId]))) {
            continue;
          }
          const k = `${aKey}/${bKey}`;
          const existingPair = coPresence.get(k);
          if (existingPair) {
            existingPair.sharedScenes += 1;
          } else {
            // Anchor the link to the later of the two speakers' cues in this scene so both are already introduced.
            const anchorRef = revealTime(project, aInfo.ref) >= revealTime(project, bInfo.ref) ? aInfo.ref : bInfo.ref;
            const label = structure.mode === 'episodic' ? docLabel : structure.unitCodeOfSource(anchorRef);
            coPresence.set(k, {
              aKey,
              bKey,
              aName: aInfo.name,
              bName: bInfo.name,
              sharedScenes: 1,
              firstSceneLabel: label,
              firstHeading: scene.heading || `Scene ${scene.number}`,
              storyOrder: baseOrder + s + 1,
              source: anchorRef
            });
          }
        }
      }
    }
  }

  const billings = storyBillings(project.kind);
  const sortedChars = [...discovered.values()]
    .sort((a, b) => b.scenes.size - a.scenes.size || b.speeches - a.speeches);
  const topSpeeches = sortedChars[0]?.speeches ?? 1;

  const newCharacters: DiscoveredCharacter[] = sortedChars.map((entry, idx) => {
    const share = entry.speeches / Math.max(1, topSpeeches);
    const suggestedBilling = idx < 2 || share >= 0.45
      ? billings[0]
      : share >= 0.15 || entry.scenes.size >= 3
        ? (billings[1] ?? billings[0])
        : (billings[2] ?? billings[billings.length - 1]);
    return {
      name: titleCaseName(entry.cueName),
      cueName: entry.cueName,
      speeches: entry.speeches,
      episodes: entry.episodes.size,
      scenes: entry.scenes.size,
      suggestedBilling,
      firstEpisodeLabel: entry.firstEpisodeLabel,
      source: entry.source
    };
  });

  // Require >= 2 shared scenes on large scripts, or >= 1 on short scripts with few pairs
  const minShared = structure.scenes.length > 10 ? 2 : 1;
  const suggestedLinks: DiscoveredLink[] = [...coPresence.entries()]
    .filter(([, entry]) => entry.sharedScenes >= minShared)
    .sort((x, y) => y[1].sharedScenes - x[1].sharedScenes)
    .slice(0, 12)
    .map(([key, entry]) => ({
      key,
      aKey: entry.aKey,
      bKey: entry.bKey,
      aName: entry.aName,
      bName: entry.bName,
      sharedScenes: entry.sharedScenes,
      firstSceneLabel: entry.firstSceneLabel,
      title: `Share ${entry.sharedScenes} scene${entry.sharedScenes === 1 ? '' : 's'} (first in ${entry.firstHeading})`,
      storyOrder: entry.storyOrder,
      source: entry.source
    }));

  return { newCharacters, newAppearances, suggestedLinks };
}

/** Backwards-compatible alias for episodic series callers and tests. */
export const scanSeriesScripts = scanProjectScripts;
