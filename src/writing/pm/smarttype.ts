import type { Block, BlockKind } from '../../model';

/*
 * SmartType: chained, document-aware suggestions (Final Draft Cloud's provider chain
 * SceneIntros → Locations → TimesOfDay and Characters → Extensions, observed in its
 * shipped bundle; default lists match WriterDuet's and OpenDraft's). Pure functions so
 * the behaviour is unit-tested independently of the editor.
 */

export const SCENE_INTROS = ['INT.', 'EXT.', 'INT./EXT.', 'EXT./INT.', 'I/E.', 'EST.'];
export const TIMES = ['DAY', 'NIGHT', 'CONTINUOUS', 'LATER', 'MOMENTS LATER', 'MORNING', 'AFTERNOON', 'EVENING', 'DAWN', 'DUSK', 'SAME TIME'];
export const EXTENSIONS = ['V.O.', 'O.S.', 'O.C.', 'CONT’D', 'PRE-LAP', 'ON PHONE', 'SUBTITLE'];
export const TRANSITIONS = ['CUT TO:', 'DISSOLVE TO:', 'SMASH CUT TO:', 'MATCH CUT TO:', 'JUMP CUT TO:', 'TIME CUT:', 'FADE IN:', 'FADE OUT.', 'FADE TO BLACK.', 'CUT TO BLACK.', 'BACK TO:', 'INTERCUT WITH:'];

const INTRO = /^(INT\.\/EXT\.|EXT\.\/INT\.|INT\.|EXT\.|I\/E\.|EST\.)\s*/i;

export interface ScriptIndex {
  locations: string[];
  times: string[];
  characters: string[];
  transitions: string[];
}

export interface Suggestion {
  /** Text offset in the paragraph from which the accepted value replaces the rest. */
  from: number;
  items: { label: string; insert: string }[];
}

function ranked(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(entry => entry[0]);
}

export function characterName(text: string): string {
  return text.replace(/\s*\([^)]*\)?\s*$/, '').replace(/\s*\^$/, '').trim().toUpperCase();
}

export function indexScript(blocks: Block[], excludeId?: string): ScriptIndex {
  const locations: string[] = [];
  const times: string[] = [];
  const characters: string[] = [];
  const transitions: string[] = [];
  for (const block of blocks) {
    if (block.id === excludeId) continue;
    const text = block.text.toUpperCase().trim();
    if (block.kind === 'scene') {
      const body = text.replace(INTRO, '');
      const dash = body.lastIndexOf(' - ');
      locations.push((dash >= 0 ? body.slice(0, dash) : body).trim());
      if (dash >= 0) times.push(body.slice(dash + 3).trim());
    } else if (block.kind === 'character') characters.push(characterName(text));
    else if (block.kind === 'transition') transitions.push(text);
  }
  return {
    locations: ranked(locations),
    times: [...new Set([...TIMES, ...ranked(times)])],
    characters: ranked(characters),
    transitions: [...new Set([...ranked(transitions), ...TRANSITIONS])]
  };
}

function matches(values: string[], typed: string, limit = 8): string[] {
  const query = typed.toUpperCase();
  return values.filter(value => value.startsWith(query) && value !== query).slice(0, limit);
}

/** Suggestions for a paragraph whose caret is at the end of `text`. */
export function suggest(kind: BlockKind, text: string, index: ScriptIndex): Suggestion | null {
  if (kind === 'scene') {
    const intro = INTRO.exec(text);
    if (!intro) {
      const items = matches(SCENE_INTROS, text.trim());
      return items.length ? { from: 0, items: items.map(value => ({ label: value, insert: value + ' ' })) } : null;
    }
    const rest = text.slice(intro[0].length);
    const dash = rest.lastIndexOf(' - ');
    if (dash < 0) {
      if (!rest.trim() && !index.locations.length) return null;
      const items = matches(index.locations, rest);
      return items.length ? { from: intro[0].length, items: items.map(value => ({ label: value, insert: value + ' - ' })) } : null;
    }
    const time = rest.slice(dash + 3);
    const items = matches(index.times, time);
    return items.length ? { from: intro[0].length + dash + 3, items: items.map(value => ({ label: value, insert: value })) } : null;
  }
  if (kind === 'character') {
    const open = text.lastIndexOf('(');
    if (open >= 0 && !text.slice(open).includes(')')) {
      const items = matches(EXTENSIONS, text.slice(open + 1));
      return items.length ? { from: open, items: items.map(value => ({ label: `(${value})`, insert: `(${value})` })) } : null;
    }
    const items = matches(index.characters, text);
    return items.length ? { from: 0, items: items.map(value => ({ label: value, insert: value })) } : null;
  }
  if (kind === 'transition' && text.trim()) {
    const items = matches(index.transitions, text);
    return items.length ? { from: 0, items: items.map(value => ({ label: value, insert: value })) } : null;
  }
  return null;
}
