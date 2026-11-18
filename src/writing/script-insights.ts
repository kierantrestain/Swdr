/**
 * Script reports, formatting checks and table-read casting, computed from the document alone.
 * Benchmarks: Final Draft reports, WriterDuet stats and formatting checker, Celtx Read Through.
 */
import type { Block, DocumentModel } from '../model';
import { paginateDocument } from './layout';

const WORD = /[\p{L}\p{N}'’-]+/gu;
const PREFIX = /^(INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\/E\.?|INT\.|EXT\.|INT |EXT |EST\.?)\s*/i;
const EXTENSION = /\s*\((V\.?O\.?|O\.?S\.?|O\.?C\.?|CONT'?D|CONT’D|CONTINUING|PRE-?LAP|FILTERED|ON PHONE|INTO PHONE)\)\s*/gi;

export function words(text: string): number {
  return text.match(WORD)?.length ?? 0;
}

/** The speaking character a cue names, without extensions such as (V.O.) or (CONT'D). */
export function characterName(cue: string): string {
  return cue.replace(EXTENSION, ' ').replace(/\s*\^\s*$/, '').replace(/\s+/g, ' ').trim().toLocaleUpperCase('en-GB');
}

export interface SceneFacts {
  setting: 'INT' | 'EXT' | 'INT/EXT' | '—';
  location: string;
  time: string;
}

export function parseHeading(heading: string): SceneFacts {
  const text = heading.trim();
  const prefix = text.match(PREFIX)?.[1]?.toUpperCase().replace(/\s+/g, '') ?? '';
  const setting: SceneFacts['setting'] = !prefix ? '—' : /\/|I\/E/.test(prefix) ? 'INT/EXT' : prefix.startsWith('EXT') ? 'EXT' : prefix.startsWith('EST') ? 'EXT' : 'INT';
  const rest = text.replace(PREFIX, '').replace(/\s+#[^#]*#\s*$/, '');
  const split = rest.split(/\s+[-–—]\s+/);
  const time = split.length > 1 ? split[split.length - 1].trim().toLocaleUpperCase('en-GB') : '';
  const location = (split.length > 1 ? split.slice(0, -1).join(' - ') : rest).trim().toLocaleUpperCase('en-GB');
  return { setting, location, time };
}

export interface CharacterStat {
  name: string;
  speeches: number;
  words: number;
  scenes: number;
  firstScene: string;
}

export interface ScriptReport {
  pages: number;
  scenes: number;
  words: number;
  dialogueWords: number;
  actionWords: number;
  /** Rough screen time: one page a minute. */
  minutes: number;
  characters: CharacterStat[];
  locations: Array<{ name: string; scenes: number }>;
  settings: Record<SceneFacts['setting'], number>;
  times: Array<{ name: string; scenes: number }>;
  longestScenes: Array<{ number: string; heading: string; words: number }>;
}

export function scriptReport(document: DocumentModel): ScriptReport {
  const characters = new Map<string, CharacterStat & { sceneIds: Set<string> }>();
  const locations = new Map<string, number>();
  const times = new Map<string, number>();
  const settings: ScriptReport['settings'] = { INT: 0, EXT: 0, 'INT/EXT': 0, '—': 0 };
  const sceneWords: ScriptReport['longestScenes'] = [];
  let sceneKey = 'opening';
  let sceneNumber = '';
  let speaker: string | undefined;
  let total = 0, dialogue = 0, action = 0, scenes = 0;

  for (const block of document.blocks) {
    if (block.kind === 'note') continue;
    const count = words(block.text);
    total += count;
    if (block.kind === 'scene') {
      scenes += 1;
      sceneKey = block.sceneId ?? block.id;
      sceneNumber = block.sceneNumber ?? String(scenes);
      const facts = parseHeading(block.text);
      settings[facts.setting] += 1;
      if (facts.location) locations.set(facts.location, (locations.get(facts.location) ?? 0) + 1);
      if (facts.time) times.set(facts.time, (times.get(facts.time) ?? 0) + 1);
      sceneWords.push({ number: sceneNumber, heading: block.text.trim() || 'Untitled scene', words: 0 });
      speaker = undefined;
      continue;
    }
    if (sceneWords.length) sceneWords[sceneWords.length - 1].words += count;
    if (block.kind === 'character') {
      const name = characterName(block.text);
      speaker = name || undefined;
      if (!name) continue;
      const stat = characters.get(name) ?? { name, speeches: 0, words: 0, scenes: 0, firstScene: sceneNumber || '—', sceneIds: new Set<string>() };
      stat.speeches += 1;
      stat.sceneIds.add(sceneKey);
      characters.set(name, stat);
    } else if (block.kind === 'dialogue') {
      dialogue += count;
      const stat = speaker && characters.get(speaker);
      if (stat) stat.words += count;
    } else if (block.kind === 'action' || block.kind === 'shot') {
      action += count;
      speaker = undefined;
    } else if (block.kind !== 'parenthetical') {
      speaker = undefined;
    }
  }

  const pages = paginateDocument(document).pages.filter(page => !page.titlePage).length;
  const sorted = <T extends { scenes: number }>(list: T[]) => list.sort((a, b) => b.scenes - a.scenes);
  return {
    pages, scenes, words: total, dialogueWords: dialogue, actionWords: action, minutes: pages,
    characters: [...characters.values()].map(({ sceneIds, ...stat }) => ({ ...stat, scenes: sceneIds.size }))
      .sort((a, b) => b.words - a.words || b.speeches - a.speeches),
    locations: sorted([...locations].map(([name, count]) => ({ name, scenes: count }))),
    times: sorted([...times].map(([name, count]) => ({ name, scenes: count }))),
    settings,
    longestScenes: sceneWords.slice().sort((a, b) => b.words - a.words).slice(0, 5)
  };
}

export interface FormatIssue {
  blockId: string;
  message: string;
  severity: 'error' | 'warning';
}

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const kept = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = kept;
    }
  }
  return row[b.length];
}

/** Formatting problems a script reader or production office would flag, in document order. */
export function formatIssues(document: DocumentModel): FormatIssue[] {
  const issues: FormatIssue[] = [];
  const blocks = document.blocks.filter(block => block.kind !== 'note');
  const numbers = new Map<string, number>();
  const cueBlocks = new Map<string, Block>();
  const cueCounts = new Map<string, number>();

  blocks.forEach((block, index) => {
    const text = block.text.trim();
    const previous = blocks[index - 1];
    const next = blocks[index + 1];
    if (block.kind === 'scene') {
      if (!text) issues.push({ blockId: block.id, severity: 'error', message: 'Empty scene heading' });
      else {
        if (!PREFIX.test(text)) issues.push({ blockId: block.id, severity: 'warning', message: `“${text}” has no INT. or EXT.` });
        if (!parseHeading(text).time) issues.push({ blockId: block.id, severity: 'warning', message: `“${text}” has no time of day` });
      }
      if (block.sceneNumber) numbers.set(block.sceneNumber, (numbers.get(block.sceneNumber) ?? 0) + 1);
    }
    if (block.kind === 'character') {
      const following = next?.kind === 'parenthetical' ? blocks[index + 2] : next;
      if (!text) issues.push({ blockId: block.id, severity: 'error', message: 'Character cue with no name' });
      else if (following?.kind !== 'dialogue' || !following.text.trim()) issues.push({ blockId: block.id, severity: 'error', message: `${text} has no dialogue` });
      const name = characterName(text);
      if (name) {
        cueCounts.set(name, (cueCounts.get(name) ?? 0) + 1);
        if (!cueBlocks.has(name)) cueBlocks.set(name, block);
      }
    }
    if (block.kind === 'dialogue' && !['character', 'parenthetical', 'dialogue'].includes(previous?.kind ?? '')) {
      issues.push({ blockId: block.id, severity: 'error', message: 'Dialogue without a character cue' });
    }
    if (block.kind === 'parenthetical') {
      if (!['character', 'dialogue'].includes(previous?.kind ?? '')) issues.push({ blockId: block.id, severity: 'error', message: 'Parenthetical outside a speech' });
      if (text && !/^\(.*\)$/.test(text)) issues.push({ blockId: block.id, severity: 'warning', message: `Parenthetical “${text}” is missing its brackets` });
    }
    if (block.kind === 'transition' && text && !/(:|\.)$/.test(text)) {
      issues.push({ blockId: block.id, severity: 'warning', message: `Transition “${text}” should end with a colon, such as CUT TO:` });
    }
    if (block.kind === 'action' && words(text) > 90) {
      issues.push({ blockId: block.id, severity: 'warning', message: `Long action paragraph (${words(text)} words). Readers skim anything over four lines.` });
    }
  });

  for (const [number, count] of numbers) {
    if (count > 1) {
      const block = blocks.find(item => item.kind === 'scene' && item.sceneNumber === number);
      if (block) issues.push({ blockId: block.id, severity: 'error', message: `Scene number ${number} is used ${count} times` });
    }
  }

  // Likely misspelt names: a rare cue one letter away from a common one (MARRA beside MARA).
  const names = [...cueCounts.keys()];
  for (const rare of names) {
    const rareCount = cueCounts.get(rare) ?? 0;
    const common = names.find(other => other !== rare && (cueCounts.get(other) ?? 0) > rareCount && distance(rare.replace(/\W/g, ''), other.replace(/\W/g, '')) === 1);
    if (common && rare.length > 2) {
      issues.push({ blockId: cueBlocks.get(rare)!.id, severity: 'warning', message: `${rare} appears ${rareCount}× — did you mean ${common}?` });
    }
  }

  const order = new Map(document.blocks.map((block, index) => [block.id, index]));
  return issues.sort((a, b) => (order.get(a.blockId) ?? 0) - (order.get(b.blockId) ?? 0));
}

export interface ReadLine {
  blockId: string;
  text: string;
  /** Character name for dialogue; undefined for the narrator. */
  speaker?: string;
}

export interface ReadOptions {
  headings: boolean;
  action: boolean;
  cues: boolean;
  parentheticals: boolean;
  fromBlockId?: string;
}

/** The lines a table read speaks, in order, each assigned to a character or the narrator. */
export function tableReadLines(document: DocumentModel, options: ReadOptions): ReadLine[] {
  const lines: ReadLine[] = [];
  let speaker: string | undefined;
  const start = options.fromBlockId ? Math.max(0, document.blocks.findIndex(block => block.id === options.fromBlockId)) : 0;
  for (const block of document.blocks.slice(start)) {
    const text = block.text.trim();
    if (block.kind === 'character') {
      speaker = characterName(text) || undefined;
      if (options.cues && text) lines.push({ blockId: block.id, text: speaker ?? text });
      continue;
    }
    if (!text || block.kind === 'note') continue;
    if (block.kind === 'dialogue') lines.push({ blockId: block.id, text, speaker });
    else if (block.kind === 'parenthetical') { if (options.parentheticals) lines.push({ blockId: block.id, text: text.replace(/^\(|\)$/g, '') }); }
    else {
      speaker = undefined;
      if (block.kind === 'scene' ? options.headings : options.action) {
        lines.push({ blockId: block.id, text: block.kind === 'scene' ? text.replace(PREFIX, match => /EXT/i.test(match) ? 'Exterior. ' : 'Interior. ') : text });
      }
    }
  }
  return lines;
}

/** Spreads characters across the available voices, leading roles first, so the busiest voices differ. */
export function castVoices(characters: string[], voices: string[], narrator?: string): Record<string, string> {
  const pool = voices.filter(voice => voice !== narrator);
  const usable = pool.length ? pool : voices;
  return Object.fromEntries(characters.map((name, index) => [name, usable[index % Math.max(1, usable.length)] ?? '']));
}
