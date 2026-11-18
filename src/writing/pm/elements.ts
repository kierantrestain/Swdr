import type { BlockKind } from '../../model';

/*
 * Screenplay element registry.
 *
 * Provenance (docs/research/rea/bundle-findings.md, REA exports of shipped bundles):
 * - Enter/Tab targets and the Mod+digit order follow Final Draft Cloud's ProseMirror
 *   node specs (returnTo / tabTo / keyboardShortcut).
 * - Enter on an empty paragraph follows Celtx's blankEnter flow (empty Action → Scene
 *   heading ends a scene quickly; empty Character/Dialogue → Action).
 * - Shift+Tab steps back through the same chain, as WriterDuet's `shift` column does.
 * The tables agree with OpenDraft's MIT source and its observed runtime behaviour.
 */

export interface ElementSpec {
  label: string;
  enter: BlockKind;
  enterEmpty: BlockKind;
  tab: BlockKind;
  shiftTab: BlockKind;
  digit: number;
}

export const ELEMENTS: Record<BlockKind, ElementSpec> = {
  scene: { label: 'Scene heading', enter: 'action', enterEmpty: 'action', tab: 'action', shiftTab: 'transition', digit: 1 },
  action: { label: 'Action', enter: 'action', enterEmpty: 'scene', tab: 'character', shiftTab: 'scene', digit: 2 },
  character: { label: 'Character', enter: 'dialogue', enterEmpty: 'action', tab: 'transition', shiftTab: 'action', digit: 3 },
  parenthetical: { label: 'Parenthetical', enter: 'dialogue', enterEmpty: 'dialogue', tab: 'dialogue', shiftTab: 'dialogue', digit: 4 },
  dialogue: { label: 'Dialogue', enter: 'action', enterEmpty: 'action', tab: 'parenthetical', shiftTab: 'character', digit: 5 },
  transition: { label: 'Transition', enter: 'scene', enterEmpty: 'scene', tab: 'scene', shiftTab: 'character', digit: 6 },
  shot: { label: 'Shot', enter: 'action', enterEmpty: 'action', tab: 'action', shiftTab: 'action', digit: 7 },
  note: { label: 'Note', enter: 'action', enterEmpty: 'action', tab: 'action', shiftTab: 'action', digit: 8 },
  act: { label: 'Act', enter: 'scene', enterEmpty: 'scene', tab: 'scene', shiftTab: 'scene', digit: 9 }
};

export const ELEMENT_ORDER = (Object.keys(ELEMENTS) as BlockKind[]).sort((a, b) => ELEMENTS[a].digit - ELEMENTS[b].digit);

/** Label for the shortcut. Ctrl+digit is reserved by browsers for tab switching, so the
 *  page binds Ctrl+Alt+digit everywhere and also Ctrl/Cmd+digit for installed windows. */
export function shortcutLabel(kind: BlockKind, mac = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '')): string {
  return `${mac ? '⌘⌥' : 'Ctrl+Alt+'}${ELEMENTS[kind].digit}`;
}

const SCENE_START = /^(?:INT\.?\/EXT|EXT\.?\/INT|I\/E|INT|EXT|EST)[.\s]/i;

/** WriterDuet-style auto-format triggers, applied to the paragraph being typed. */
export function detectWhileTyping(kind: BlockKind, text: string, previous?: BlockKind): BlockKind | null {
  if (kind === 'action' && /^(?:INT\.?\/EXT|EXT\.?\/INT|I\/E|INT|EXT|EST)\.\s/i.test(text)) return 'scene';
  if (text === '(' && (previous === 'character' || previous === 'dialogue') && (kind === 'dialogue' || kind === 'action')) return 'parenthetical';
  return null;
}

/** Triggers resolved when the writer presses Enter at the end of a paragraph. */
export function detectOnEnter(kind: BlockKind, text: string, knownCharacters: Set<string>): BlockKind | null {
  const trimmed = text.trim();
  if (kind !== 'action' || !trimmed) return null;
  if (SCENE_START.test(trimmed)) return 'scene';
  if (/^[A-Z0-9 .'’-]+ TO:$/.test(trimmed) || /^(FADE OUT\.|FADE TO BLACK\.|CUT TO BLACK\.)$/.test(trimmed)) return 'transition';
  const name = trimmed.replace(/\s*\(.*\)\s*$/, '');
  if (name && name === name.toUpperCase() && knownCharacters.has(name)) return 'character';
  return null;
}

export function isSceneStart(text: string): boolean {
  return SCENE_START.test(text);
}
