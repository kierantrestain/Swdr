import { newId, sceneList } from '../model';
import type { AVRow, Block, DocumentModel, Scene } from '../model';

export interface SceneMatch {
  incoming: Scene;
  previous?: Scene;
  candidates: Scene[];
  moved: boolean;
  edited: boolean;
  outcome: 'linked' | 'added' | 'unmatched';
}

export interface RevisionReview {
  matches: SceneMatch[];
  omitted: Scene[];
}

function normalize(text: string): string {
  return text.normalize('NFKC').trim().toUpperCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ');
}

function blocksFor(document: DocumentModel, index: number): Block[] {
  const end = document.blocks.findIndex((item, at) => at > index && item.kind === 'scene');
  return document.blocks.slice(index, end < 0 ? undefined : end);
}

function sameContent(left: Block[], right: Block[]): boolean {
  return left.length === right.length && left.every((block, index) =>
    block.text === right[index].text && block.kind === right[index].kind &&
    block.sceneNumber === right[index].sceneNumber && block.dual === right[index].dual &&
    block.revision === right[index].revision && JSON.stringify(block.alternate) === JSON.stringify(right[index].alternate));
}

function approximate(a: string, b: string): number {
  const left = new Set(normalize(a).split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const right = new Set(normalize(b).split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const common = [...left].filter(word => right.has(word)).length;
  return common / Math.max(left.size, right.size, 1);
}

function oldOrderStillIncreasing(matches: SceneMatch[]): Set<string> {
  const ordered = matches.filter(match => match.previous);
  const tails: number[] = [];
  const previousIndexes = Array<number>(ordered.length).fill(-1);
  ordered.forEach((match, index) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (ordered[tails[mid]].previous!.index < match.previous!.index) lo = mid + 1;
      else hi = mid;
    }
    if (lo) previousIndexes[index] = tails[lo - 1];
    tails[lo] = index;
  });
  const unmoved = new Set<string>();
  for (let position = tails[tails.length - 1]; position !== undefined && position >= 0; position = previousIndexes[position]) {
    unmoved.add(ordered[position].incoming.id);
  }
  return unmoved;
}

export function reviewRevision(previous: DocumentModel, incoming: DocumentModel, overrides: Record<string, string> = {}): RevisionReview {
  const oldScenes = sceneList(previous);
  const newScenes = sceneList(incoming);
  const used = new Set<string>();
  const explicitIds = new Set(Object.values(overrides).filter(Boolean));
  const matches = newScenes.map((scene): SceneMatch => {
    const available = oldScenes.filter(old => !used.has(old.id) && (!explicitIds.has(old.id) || overrides[scene.id] === old.id));
    const sameId = available.find(old => old.id === scene.id);
    const sameHeading = available.filter(old => normalize(old.heading) === normalize(scene.heading));
    const newNumber = incoming.blocks[scene.index].sceneNumber;
    const sameNumber = newNumber ? available.filter(old => previous.blocks[old.index].sceneNumber === newNumber) : [];
    const sameNumberAndHeading = sameNumber.filter(item => sameHeading.includes(item));
    const uniqueHeading = newScenes.filter(other => normalize(other.heading) === normalize(scene.heading)).length === 1 && sameHeading.length === 1;
    const automatic = sameId ?? (sameNumberAndHeading.length === 1 ? sameNumberAndHeading[0] : undefined) ??
      (uniqueHeading ? sameHeading[0] : undefined);
    const chosen = Object.hasOwn(overrides, scene.id) ? available.find(old => old.id === overrides[scene.id]) : automatic;
    if (chosen) used.add(chosen.id);
    const candidates = available.filter(old => sameHeading.includes(old) || sameNumber.includes(old) || approximate(old.heading, scene.heading) >= 0.75);
    return { incoming: scene, previous: chosen, candidates, moved: false,
      edited: chosen ? !sameContent(blocksFor(previous, chosen.index), blocksFor(incoming, scene.index)) : false,
      outcome: chosen ? 'linked' : candidates.length && !Object.hasOwn(overrides, scene.id) ? 'unmatched' : 'added' };
  });
  const unmoved = oldOrderStillIncreasing(matches);
  for (const match of matches) match.moved = Boolean(match.previous) && !unmoved.has(match.incoming.id);
  return { matches, omitted: oldScenes.filter(scene => !used.has(scene.id)) };
}

export function acceptRevision(previous: DocumentModel, incoming: DocumentModel, review: RevisionReview): DocumentModel {
  if (review.matches.some(match => match.outcome === 'unmatched')) throw new Error('Resolve the unmatched scenes before committing.');
  const blocks = incoming.blocks.map(item => ({ ...item }));
  const linkedBlockIds = new Map<string, string>();
  for (const match of review.matches) {
    if (!match.previous) continue;
    const old = blocksFor(previous, match.previous.index);
    const current = blocksFor(incoming, match.incoming.index);
    const heading = blocks[match.incoming.index];
    linkedBlockIds.set(heading.id, old[0].id);
    heading.id = old[0].id;
    heading.sceneId = match.previous.id;
    const oldByText = new Map<string, Block[]>();
    for (const block of old.slice(1)) {
      const key = JSON.stringify([block.kind, block.text]);
      if (!oldByText.has(key)) oldByText.set(key, []);
      oldByText.get(key)!.push(block);
    }
    const used = new Set<string>();
    function linkBlock(index: number, id: string) {
      linkedBlockIds.set(current[index].id, id);
      blocks[match.incoming.index + index].id = id;
      used.add(id);
    }
    for (let index = 1; index < current.length; index++) {
      const item = current[index];
      const exact = oldByText.get(JSON.stringify([item.kind, item.text]))?.shift();
      if (exact) linkBlock(index, exact.id);
    }
    for (let index = 1; index < current.length; index++) {
      if (linkedBlockIds.has(current[index].id)) continue;
      const samePosition = old[index];
      if (samePosition?.kind === current[index].kind && !used.has(samePosition.id)) linkBlock(index, samePosition.id);
    }
  }
  const sceneIds = new Map(review.matches.map(match => [match.incoming.id, match.previous?.id ?? match.incoming.id]));
  return {
    ...incoming,
    id: previous.id,
    episodeId: previous.episodeId,
    revisionId: newId(),
    blocks,
    lockedPages: incoming.lockedPages?.map(page => ({
      ...page, firstBlockId: linkedBlockIds.get(page.firstBlockId) ?? page.firstBlockId
    })),
    beats: previous.beats.length ? previous.beats : incoming.beats.map(beat => ({
      ...beat, sceneId: beat.sceneId ? sceneIds.get(beat.sceneId) : undefined
    }))
  };
}

interface CueMatch {
  incoming: AVRow;
  index: number;
  previous?: AVRow;
  moved: boolean;
  edited: boolean;
  outcome: 'linked' | 'added' | 'unmatched';
}

interface CueReview {
  matches: CueMatch[];
  omitted: AVRow[];
}

function cueContent(row: AVRow): string {
  return JSON.stringify([row.video.replace(/\s+/gu, ' ').trim(), row.audio.replace(/\s+/gu, ' ').trim()]);
}

export function reviewAvRevision(previous: DocumentModel, incoming: DocumentModel, overrides: Record<string, string> = {}): CueReview {
  const previousOrder = new Map(previous.avRows.map((row, index) => [row.id, index]));
  const previousById = new Map(previous.avRows.map(row => [row.id, row]));
  const previousByContent = new Map<string, AVRow[]>();
  for (const row of previous.avRows) {
    const key = cueContent(row);
    if (!previousByContent.has(key)) previousByContent.set(key, []);
    previousByContent.get(key)!.push(row);
  }
  const outgoing = new Set<string>();
  const manualIds = new Set(Object.values(overrides).filter(Boolean));
  const keyCounts = new Map<string, number>();
  for (const row of incoming.avRows) {
    const key = cueContent(row);
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
  }
  const matches = incoming.avRows.map((row, index): CueMatch => {
    const eligible = (item: AVRow | undefined): item is AVRow => Boolean(item && !outgoing.has(item.id) && (!manualIds.has(item.id) || item.id === overrides[row.id]));
    const content = cueContent(row);
    const sameContent = (previousByContent.get(content) ?? []).filter(eligible);
    const direct = previousById.get(row.id);
    const automatic = eligible(direct) ? direct : sameContent.length === 1 && keyCounts.get(content) === 1 ? sameContent[0] : undefined;
    const manual = Object.hasOwn(overrides, row.id);
    const candidate = previousById.get(overrides[row.id]);
    const picked = manual ? eligible(candidate) ? candidate : undefined : automatic;
    if (picked) outgoing.add(picked.id);
    return { incoming: row, index, previous: picked,
      moved: picked !== undefined && previousOrder.get(picked.id) !== index,
      edited: picked !== undefined && (cueContent(picked) !== content || picked.durationSeconds !== row.durationSeconds || picked.cueSeconds !== row.cueSeconds),
      outcome: picked ? 'linked' : sameContent.length && !manual ? 'unmatched' : 'added' };
  });
  return { matches, omitted: previous.avRows.filter(row => !outgoing.has(row.id)) };
}

export function acceptAvRevision(previous: DocumentModel, incoming: DocumentModel, review: CueReview): DocumentModel {
  if (review.matches.some(match => match.outcome === 'unmatched')) throw new Error('Resolve the unmatched AV cues before committing.');
  return {
    ...incoming, id: previous.id, episodeId: previous.episodeId, revisionId: newId(), beats: previous.beats,
    avRows: review.matches.map(match => match.previous ? {
      ...match.incoming, id: match.previous.id,
      storyboardAssetId: match.incoming.storyboardAssetId ?? match.previous.storyboardAssetId
    } : match.incoming)
  };
}
