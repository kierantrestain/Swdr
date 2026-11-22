import { sceneList } from '../model';
import type { DocumentModel, Episode, Project, ProjectKind, Scene, SourceRef } from '../model';
import { episodeCode, orderedEpisodes, sourceDocument } from './source';

export const STORY_PROJECT_KINDS = ['series', 'film', 'stage', 'documentary'] as const;

export function isStoryProject(project: Pick<Project, 'kind'>): boolean {
  return project.kind === 'series' || project.kind === 'film' || project.kind === 'stage' || project.kind === 'documentary';
}

export function storyWorkspaceTitle(kind: ProjectKind): string {
  switch (kind) {
    case 'series': return 'Series Intelligence';
    case 'film': return 'Film Intelligence';
    case 'stage': return 'Stage Intelligence';
    case 'documentary': return 'Story Intelligence';
    default: return 'Story Intelligence';
  }
}

export function storyBillings(kind: ProjectKind): readonly string[] {
  switch (kind) {
    case 'film': return ['Lead', 'Supporting', 'Featured', 'Day player'];
    case 'stage': return ['Principal', 'Featured', 'Ensemble', 'Understudy'];
    case 'documentary': return ['Subject', 'Contributor', 'Expert', 'Archival'];
    default: return ['Series regular', 'Recurring', 'Guest'];
  }
}

export interface StoryGroup {
  number: number;
  label: string;
  shortLabel: string;
}

export interface StoryUnit {
  id: string;
  groupNumber: number;
  number: number;
  code: string;
  shortAxis: string;
  title: string;
  /** Scene ids mapped to this unit (for film/stage script mode). */
  sceneIds: string[];
  documentId?: string;
  firstSceneNumber?: number;
  lastSceneNumber?: number;
  isGroupStart: boolean;
}

export interface SceneSlot {
  scene: Scene;
  sceneIndex: number;
  actNumber: number;
  actLabel: string;
  unitId: string;
  documentId: string;
}

export interface StoryTerminology {
  workspaceTitle: string;
  timelineTitle: string;
  groupLabel: string;
  allGroupsLabel: string;
  unitSingular: string;
  unitPlural: string;
  asOfLabel: string;
  asOfAllLabel: string;
  exactFilterLabel: string;
  exactAllLabel: string;
  presenceTitle: string;
  canonLabel: string;
  structureBadge: string;
}

export interface StoryStructure {
  mode: 'episodic' | 'script';
  kind: ProjectKind;
  document?: DocumentModel;
  groups: StoryGroup[];
  units: StoryUnit[];
  scenes: SceneSlot[];
  /** Whether a long feature/script was bucketed into multi-scene Sequences on the visual axis. */
  bucketed: boolean;
  /** Whether act headings came directly from explicit script `act` blocks or outline beats rather than default proportions. */
  explicitActs: boolean;
  terms: StoryTerminology;
  unitOfSource: (source: SourceRef) => StoryUnit | undefined;
  unitIndexOfSource: (source: SourceRef) => number;
  unitCodeOfSource: (source: SourceRef) => string;
  sceneIndexOfSource: (source: SourceRef) => number;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'] as const;

export function romanAct(num: number): string {
  return ROMAN[num - 1] ?? String(num);
}

/** Parses an explicit `act` block heading (e.g. "ACT II", "Act 2", "PROLOGUE", "EPILOGUE") into a display label. */
function cleanActLabel(raw: string, fallbackIndex: number): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed) return `Act ${romanAct(fallbackIndex)}`;
  const upper = trimmed.toUpperCase();
  if (/^PROLOGUE\b/.test(upper)) return 'Prologue';
  if (/^EPILOGUE\b/.test(upper)) return 'Epilogue';
  if (/^INTERMISSION\b/.test(upper)) return '';
  const match = /^ACT\s+([IVX]+|\d+|ONE|TWO|THREE|FOUR|FIVE)\b/i.exec(trimmed);
  if (match) {
    const wordMap: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
    const token = match[1].toUpperCase();
    const numeric = wordMap[token] ?? Number.parseInt(token, 10);
    if (Number.isFinite(numeric) && numeric >= 1) return `Act ${romanAct(numeric)}`;
    return `Act ${token}`;
  }
  return trimmed.length <= 18 ? trimmed : `Act ${romanAct(fallbackIndex)}`;
}

/** Picks the primary screenplay/stageplay document for non-episodic Story Intelligence. */
export function primaryStoryDocument(project: Project, documentId?: string): DocumentModel | undefined {
  if (documentId) {
    const chosen = project.documents.find(doc => doc.id === documentId);
    if (chosen && chosen.kind !== 'av') return chosen;
  }
  return project.documents.find(doc => doc.kind !== 'av' && sceneList(doc).length > 0)
    ?? project.documents.find(doc => doc.kind !== 'av')
    ?? project.documents[0];
}

/** Assigns every scene in a screenplay or stageplay to its Act using explicit Act blocks, outline beats, or medium proportions. */
function partitionScenesIntoActs(
  document: DocumentModel,
  scenes: Scene[],
  kind: ProjectKind
): { acts: Array<{ number: number; label: string; shortLabel: string; scenes: Scene[] }>; explicit: boolean } {
  if (!scenes.length) {
    return { acts: [{ number: 1, label: 'Act I', shortLabel: 'Act I', scenes: [] }], explicit: false };
  }

  // 1. Check explicit `act` blocks in the manuscript (ignoring pure end-of-act / intermission dividers).
  const actBlocks = document.blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.kind === 'act' && !/^(END\s+OF\s+ACT|INTERMISSION|CURTAIN)\b/i.test(block.text.trim()));

  if (actBlocks.length > 0) {
    const buckets: Array<{ number: number; label: string; shortLabel: string; scenes: Scene[] }> = [];
    const seenBeforeFirst = scenes.filter(scene => scene.index < actBlocks[0].index);
    if (seenBeforeFirst.length) {
      buckets.push({ number: 1, label: 'Opening', shortLabel: 'Open', scenes: seenBeforeFirst });
    }
    for (let i = 0; i < actBlocks.length; i += 1) {
      const start = actBlocks[i].index;
      const end = actBlocks[i + 1]?.index ?? document.blocks.length;
      const slice = scenes.filter(scene => scene.index > start && scene.index < end);
      const nextNum = buckets.length + 1;
      const label = cleanActLabel(actBlocks[i].block.text, nextNum);
      if (!label) continue;
      if (slice.length || i === 0) {
        buckets.push({ number: nextNum, label, shortLabel: label, scenes: slice });
      }
    }
    const nonEmpty = buckets.filter(bucket => bucket.scenes.length > 0);
    if (nonEmpty.length > 0) {
      return {
        acts: nonEmpty.map((bucket, idx) => ({ ...bucket, number: idx + 1 })),
        explicit: true
      };
    }
  }

  // 2. Check Outline Beats with explicit act assignments (`beat.act` linked to `beat.sceneId`).
  const beatActByScene = new Map<string, number>();
  for (const beat of document.beats) {
    if (beat.sceneId && beat.act) beatActByScene.set(beat.sceneId, beat.act);
  }
  if (beatActByScene.size > 0) {
    let currentAct = 1;
    const grouped = new Map<number, Scene[]>();
    for (const scene of scenes) {
      const declared = beatActByScene.get(scene.id);
      if (declared && declared >= currentAct) currentAct = declared;
      grouped.set(currentAct, [...(grouped.get(currentAct) ?? []), scene]);
    }
    const acts = [...grouped.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([num, list]) => ({ number: num, label: `Act ${romanAct(num)}`, shortLabel: `Act ${romanAct(num)}`, scenes: list }));
    if (acts.length > 0) return { acts, explicit: true };
  }

  // 3. Default medium-native dramatic proportions when no explicit Act dividers exist yet.
  const total = scenes.length;
  if (kind === 'stage') {
    // Stage plays default to classic Two-Act + Intermission structure (or single Act for short 1-act plays <= 4 scenes).
    if (total <= 4) {
      return { acts: [{ number: 1, label: 'Act I', shortLabel: 'Act I', scenes }], explicit: false };
    }
    const split = Math.ceil(total / 2);
    return {
      acts: [
        { number: 1, label: 'Act I', shortLabel: 'Act I', scenes: scenes.slice(0, split) },
        { number: 2, label: 'Act II', shortLabel: 'Act II', scenes: scenes.slice(split) }
      ],
      explicit: false
    };
  }

  // Film & feature documentary default to classic 3-Act structure (25% / 50% / 25%).
  if (total <= 4) {
    return { acts: [{ number: 1, label: 'Act I', shortLabel: 'Act I', scenes }], explicit: false };
  }
  if (total <= 7) {
    const split = Math.ceil(total / 2);
    return {
      acts: [
        { number: 1, label: 'Act I', shortLabel: 'Act I', scenes: scenes.slice(0, split) },
        { number: 2, label: 'Act II', shortLabel: 'Act II', scenes: scenes.slice(split) }
      ],
      explicit: false
    };
  }
  const act1End = Math.max(1, Math.round(total * 0.25));
  const act2End = Math.max(act1End + 1, Math.min(total - 1, Math.round(total * 0.75)));
  return {
    acts: [
      { number: 1, label: 'Act I', shortLabel: 'Act I', scenes: scenes.slice(0, act1End) },
      { number: 2, label: 'Act II', shortLabel: 'Act II', scenes: scenes.slice(act1End, act2End) },
      { number: 3, label: 'Act III', shortLabel: 'Act III', scenes: scenes.slice(act2End) }
    ],
    explicit: false
  };
}

/**
 * Builds the medium-native narrative structure for any project:
 * - Television / episodic docs -> Seasons & Episodes
 * - Film -> Acts & Scenes (auto-grouped into crisp Sequences when a feature exceeds 24 scenes)
 * - Stage Play -> Acts & Scenes (respecting explicit Act breaks & Intermission structure)
 */
export function storyStructure(project: Project, documentId?: string): StoryStructure {
  const episodes = orderedEpisodes(project);
  const workspaceTitle = storyWorkspaceTitle(project.kind);

  if (episodes.length > 0) {
    const seasonNumbers = [...new Set(episodes.map(item => item.season))];
    const groups: StoryGroup[] = seasonNumbers.map(num => ({ number: num, label: `Season ${num}`, shortLabel: `S${num}` }));
    const units: StoryUnit[] = episodes.map((episode: Episode) => ({
      id: episode.id,
      groupNumber: episode.season,
      number: episode.number,
      code: episodeCode(episode),
      shortAxis: String(episode.number),
      title: episode.title,
      sceneIds: [],
      isGroupStart: episode.number === 1
    }));
    const unitById = new Map(units.map((unit, idx) => [unit.id, { unit, idx }] as const));
    const unitOfSource = (source: SourceRef) => source.episodeId ? unitById.get(source.episodeId)?.unit : undefined;
    const unitIndexOfSource = (source: SourceRef) => source.episodeId ? (unitById.get(source.episodeId)?.idx ?? -1) : -1;
    const unitCodeOfSource = (source: SourceRef) => unitOfSource(source)?.code ?? 'Script';

    return {
      mode: 'episodic',
      kind: project.kind,
      groups,
      units,
      scenes: [],
      bucketed: false,
      explicitActs: true,
      terms: {
        workspaceTitle,
        timelineTitle: project.kind === 'documentary' ? 'Major events — Story timeline' : 'Major events — Series timeline',
        groupLabel: 'Season',
        allGroupsLabel: 'All seasons',
        unitSingular: 'episode',
        unitPlural: 'episodes',
        asOfLabel: 'As of episode',
        asOfAllLabel: 'Latest in scope',
        exactFilterLabel: 'Episode filter',
        exactAllLabel: 'All visible episodes',
        presenceTitle: 'Episode presence',
        canonLabel: project.kind === 'series' ? 'Series canon' : 'Story canon',
        structureBadge: `${groups.length} season${groups.length === 1 ? '' : 's'} · ${units.length} episode${units.length === 1 ? '' : 's'}`
      },
      unitOfSource,
      unitIndexOfSource,
      unitCodeOfSource,
      sceneIndexOfSource: unitIndexOfSource
    };
  }

  // Non-episodic Script mode (Film, Stage Play, Feature Documentary)
  const doc = primaryStoryDocument(project, documentId);
  const rawScenes = doc ? sceneList(doc) : [];
  const { acts, explicit } = doc
    ? partitionScenesIntoActs(doc, rawScenes, project.kind)
    : { acts: [{ number: 1, label: 'Act I', shortLabel: 'Act I', scenes: [] }], explicit: false };

  const groups: StoryGroup[] = acts.map(act => ({ number: act.number, label: act.label, shortLabel: act.shortLabel }));
  const bucketed = rawScenes.length > 24;
  const units: StoryUnit[] = [];
  const sceneSlots: SceneSlot[] = [];
  const sceneIdToUnit = new Map<string, StoryUnit>();
  const sceneIdToIndex = new Map<string, number>();

  let runningSceneIdx = 0;
  let runningSeqNum = 0;

  if (!bucketed) {
    for (const act of acts) {
      act.scenes.forEach((scene, idxInAct) => {
        const sceneNum = Number.parseInt(scene.number, 10) || runningSceneIdx + 1;
        const unit: StoryUnit = {
          id: scene.id,
          groupNumber: act.number,
          number: idxInAct + 1,
          code: project.kind === 'stage' ? `${romanAct(act.number)}.${idxInAct + 1}` : `Sc ${scene.number}`,
          shortAxis: scene.number,
          title: scene.heading || `Scene ${scene.number}`,
          sceneIds: [scene.id],
          documentId: doc?.id,
          firstSceneNumber: sceneNum,
          lastSceneNumber: sceneNum,
          isGroupStart: idxInAct === 0
        };
        units.push(unit);
        sceneIdToUnit.set(scene.id, unit);
        sceneIdToIndex.set(scene.id, runningSceneIdx);
        sceneSlots.push({
          scene,
          sceneIndex: runningSceneIdx,
          actNumber: act.number,
          actLabel: act.label,
          unitId: unit.id,
          documentId: doc?.id ?? ''
        });
        runningSceneIdx += 1;
      });
    }
  } else {
    // Long feature (>24 scenes): divide each Act into readable Sequences targeting ~12–16 total columns across the script.
    const targetTotalCols = Math.min(16, Math.max(10, Math.ceil(rawScenes.length / 6)));
    for (const act of acts) {
      if (!act.scenes.length) continue;
      const actShare = Math.max(1, Math.round((act.scenes.length / rawScenes.length) * targetTotalCols));
      const seqCount = Math.min(act.scenes.length, Math.max(1, actShare));
      const baseSize = Math.floor(act.scenes.length / seqCount);
      const remainder = act.scenes.length % seqCount;
      let cursor = 0;
      for (let s = 0; s < seqCount; s += 1) {
        const size = baseSize + (s < remainder ? 1 : 0);
        const slice = act.scenes.slice(cursor, cursor + size);
        cursor += size;
        if (!slice.length) continue;
        runningSeqNum += 1;
        const firstNum = Number.parseInt(slice[0].number, 10) || runningSceneIdx + 1;
        const lastNum = Number.parseInt(slice[slice.length - 1].number, 10) || (firstNum + slice.length - 1);
        const range = firstNum === lastNum ? `Sc ${firstNum}` : `Sc ${firstNum}–${lastNum}`;
        const unit: StoryUnit = {
          id: `seq:${act.number}:${runningSeqNum}`,
          groupNumber: act.number,
          number: s + 1,
          code: `Seq ${runningSeqNum}`,
          shortAxis: `${firstNum}–${lastNum}`,
          title: `Sequence ${runningSeqNum} · ${range}`,
          sceneIds: slice.map(item => item.id),
          documentId: doc?.id,
          firstSceneNumber: firstNum,
          lastSceneNumber: lastNum,
          isGroupStart: s === 0
        };
        units.push(unit);
        for (const scene of slice) {
          sceneIdToUnit.set(scene.id, unit);
          sceneIdToIndex.set(scene.id, runningSceneIdx);
          sceneSlots.push({
            scene,
            sceneIndex: runningSceneIdx,
            actNumber: act.number,
            actLabel: act.label,
            unitId: unit.id,
            documentId: doc?.id ?? ''
          });
          runningSceneIdx += 1;
        }
      }
    }
  }

  const unitIndexById = new Map(units.map((unit, idx) => [unit.id, idx] as const));

  const fallbackSceneIndex = (source: SourceRef): number => {
    if (source.sceneId && sceneIdToIndex.has(source.sceneId)) return sceneIdToIndex.get(source.sceneId)!;
    const citedDoc = sourceDocument(project, source);
    if (!citedDoc) return units.length ? 0 : -1;
    const citedScenes = sceneList(citedDoc);
    const idx = source.sceneId ? citedScenes.findIndex(item => item.id === source.sceneId) : -1;
    if (idx < 0) return rawScenes.length ? 0 : -1;
    return Math.min(Math.max(0, rawScenes.length - 1), idx);
  };

  const unitOfSource = (source: SourceRef): StoryUnit | undefined => {
    if (source.sceneId && sceneIdToUnit.has(source.sceneId)) return sceneIdToUnit.get(source.sceneId);
    const slot = sceneSlots[fallbackSceneIndex(source)];
    return slot ? units.find(u => u.id === slot.unitId) : units[0];
  };

  const unitIndexOfSource = (source: SourceRef): number => {
    const unit = unitOfSource(source);
    return unit ? (unitIndexById.get(unit.id) ?? -1) : -1;
  };

  const unitCodeOfSource = (source: SourceRef): string => {
    const idx = fallbackSceneIndex(source);
    const slot = sceneSlots[idx];
    if (slot) {
      return project.kind === 'stage'
        ? `${romanAct(slot.actNumber)}.${slot.scene.number}`
        : `Act ${romanAct(slot.actNumber)} · Sc ${slot.scene.number}`;
    }
    return unitOfSource(source)?.code ?? 'Script';
  };

  const isStage = project.kind === 'stage';
  const unitSingular = bucketed ? 'sequence' : 'scene';
  const unitPlural = bucketed ? 'sequences' : 'scenes';

  return {
    mode: 'script',
    kind: project.kind,
    document: doc,
    groups,
    units,
    scenes: sceneSlots,
    bucketed,
    explicitActs: explicit,
    terms: {
      workspaceTitle,
      timelineTitle: isStage ? 'Major beats — Play timeline' : project.kind === 'film' ? 'Major beats — Film timeline' : 'Major events — Story timeline',
      groupLabel: 'Act',
      allGroupsLabel: 'All acts',
      unitSingular,
      unitPlural,
      asOfLabel: bucketed ? 'As of sequence' : 'As of scene',
      asOfAllLabel: isStage ? 'Full play' : 'Full script',
      exactFilterLabel: bucketed ? 'Sequence filter' : 'Scene filter',
      exactAllLabel: bucketed ? 'All visible sequences' : 'All visible scenes',
      presenceTitle: isStage ? 'Act & stage presence' : 'Act & scene presence',
      canonLabel: isStage ? 'Stage canon' : project.kind === 'film' ? 'Film canon' : 'Story canon',
      structureBadge: `${groups.length} act${groups.length === 1 ? '' : 's'} · ${rawScenes.length} scene${rawScenes.length === 1 ? '' : 's'}`
    },
    unitOfSource,
    unitIndexOfSource,
    unitCodeOfSource,
    sceneIndexOfSource: fallbackSceneIndex
  };
}
