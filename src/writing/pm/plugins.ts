import { Fragment, Slice } from 'prosemirror-model';
import type { Node as PMNode, ResolvedPos } from 'prosemirror-model';
import { EditorState, Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import type { Command, Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { EditorView } from 'prosemirror-view';
import { newId } from '../../model';
import type { BlockKind } from '../../model';
import { decodeFountain } from '../../interchange/screenplay';
import type { WritingPage } from '../layout';
import { detectOnEnter, detectWhileTyping, ELEMENTS } from './elements';
import { characterName } from './smarttype';
import { schema } from './schema';

// ---------------------------------------------------------------- element helpers

export function currentElement($pos: ResolvedPos): { node: PMNode; pos: number } | null {
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.type === schema.nodes.element) return { node, pos: $pos.before(depth) };
  }
  return null;
}

function previousElementKind(state: EditorState, pos: number): BlockKind | undefined {
  let kind: BlockKind | undefined;
  state.doc.nodesBetween(0, pos, (node, at) => {
    if (node.type === schema.nodes.element && at < pos) kind = node.attrs.kind;
  });
  return kind;
}

function attrsFor(kind: BlockKind): Record<string, unknown> {
  return { id: newId(), kind, sceneId: kind === 'scene' ? newId() : null, sceneNumber: null, alternate: null, revision: null };
}

export function setKind(kind: BlockKind): Command {
  return (state, dispatch) => {
    const found = currentElement(state.selection.$from);
    if (!found) return false;
    if (dispatch) {
      const attrs = { ...found.node.attrs, kind, sceneId: kind === 'scene' ? found.node.attrs.sceneId || newId() : found.node.attrs.sceneId };
      dispatch(state.tr.setNodeMarkup(found.pos, undefined, attrs).scrollIntoView());
    }
    return true;
  };
}

function knownCharacters(state: EditorState): Set<string> {
  const names = new Set<string>();
  state.doc.descendants(node => {
    if (node.type === schema.nodes.element && node.attrs.kind === 'character' && node.textContent.trim()) names.add(characterName(node.textContent));
  });
  return names;
}

/** Enter: split keeps the original block's identity with the text before the caret. */
export const enterCommand: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  const found = currentElement($from);
  if (!found) return false;
  if (!dispatch) return true;
  let tr = state.tr;
  if (!empty) tr = tr.deleteSelection();
  const $at = tr.selection.$from;
  const element = currentElement($at);
  if (!element) return false;
  const kind = element.node.attrs.kind as BlockKind;
  const text = element.node.textContent;
  let offset = $at.parentOffset;
  // Enter just before a parenthetical's closing bracket finishes the parenthetical.
  if (kind === 'parenthetical' && text.slice(offset) === ')') {
    offset = text.length;
    tr.setSelection(TextSelection.create(tr.doc, element.pos + 1 + offset));
  }
  if (!text.trim()) {
    tr.setNodeMarkup(element.pos, undefined, { ...element.node.attrs, kind: ELEMENTS[kind].enterEmpty, sceneId: ELEMENTS[kind].enterEmpty === 'scene' ? element.node.attrs.sceneId || newId() : element.node.attrs.sceneId });
    dispatch(tr.scrollIntoView());
    return true;
  }
  if (offset === 0) {
    tr.insert(element.pos, schema.nodes.element.create(attrsFor(kind === 'scene' ? 'action' : kind)));
    dispatch(tr.scrollIntoView());
    return true;
  }
  if (offset === text.length) {
    const detected = detectOnEnter(kind, text, knownCharacters(state));
    const effective = detected ?? kind;
    if (detected) tr.setNodeMarkup(element.pos, undefined, { ...element.node.attrs, kind: detected, sceneId: detected === 'scene' ? newId() : element.node.attrs.sceneId });
    tr.split(tr.selection.from, 1, [{ type: schema.nodes.element, attrs: attrsFor(ELEMENTS[effective].enter) }]);
  } else {
    tr.split($at.pos, 1, [{ type: schema.nodes.element, attrs: attrsFor(kind) }]);
  }
  dispatch(tr.scrollIntoView());
  return true;
};

export function tabCommand(back: boolean): Command {
  return (state, dispatch) => {
    const found = currentElement(state.selection.$from);
    if (!found) return false;
    const kind = found.node.attrs.kind as BlockKind;
    const spec = ELEMENTS[kind];
    const atEnd = state.selection.empty && state.selection.$from.parentOffset === found.node.content.size;
    if (!back && atEnd && found.node.textContent.trim()) {
      if (dispatch) dispatch(state.tr.split(state.selection.from, 1, [{ type: schema.nodes.element, attrs: attrsFor(spec.tab) }]).scrollIntoView());
      return true;
    }
    return setKind(back ? spec.shiftTab : spec.tab)(state, dispatch);
  };
}

// ---------------------------------------------------------------- identity + auto-format

/** Keeps every element's id unique (copies get fresh ids) and applies live auto-format. */
export const integrityPlugin = new Plugin({
  appendTransaction(transactions, _old, state) {
    if (!transactions.some(tr => tr.docChanged)) return null;
    const tr = state.tr;
    const seen = new Set<string>();
    state.doc.descendants((node, pos) => {
      if (node.type !== schema.nodes.element) return;
      let { id, sceneId } = node.attrs;
      if (!id || seen.has(id)) id = newId();
      if (node.attrs.kind === 'scene' && !sceneId) sceneId = newId();
      seen.add(id);
      if (id !== node.attrs.id || sceneId !== node.attrs.sceneId) tr.setNodeMarkup(pos, undefined, { ...node.attrs, id, sceneId });
      return false;
    });
    const typed = transactions.some(item => item.docChanged && !item.getMeta('history$') && !item.getMeta('swdr-external'));
    const found = typed && state.selection.empty ? currentElement(state.selection.$from) : null;
    if (found) {
      const detected = detectWhileTyping(found.node.attrs.kind, found.node.textContent, previousElementKind(state, found.pos));
      if (detected) {
        const attrs = tr.doc.nodeAt(found.pos)?.attrs ?? found.node.attrs;
        tr.setNodeMarkup(found.pos, undefined, { ...attrs, kind: detected, sceneId: detected === 'scene' ? attrs.sceneId || newId() : attrs.sceneId });
        if (detected === 'parenthetical' && found.node.textContent === '(') tr.insertText(')', state.selection.from).setSelection(TextSelection.create(tr.doc, state.selection.from));
      }
    }
    return tr.docChanged ? tr : null;
  }
});

/** Typing ')' over an auto-inserted closing bracket steps past it instead of doubling it. */
export const bracketPlugin = new Plugin({
  props: {
    handleTextInput(view, from, to, text) {
      if (text !== ')' || from !== to) return false;
      const { $from } = view.state.selection;
      if ($from.parent.type !== schema.nodes.element || $from.parent.textContent.slice($from.parentOffset, $from.parentOffset + 1) !== ')') return false;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from + 1)));
      return true;
    }
  }
});

// ---------------------------------------------------------------- clipboard

function stripIds(fragment: Fragment): Fragment {
  const nodes: PMNode[] = [];
  fragment.forEach(node => {
    if (node.type === schema.nodes.element) nodes.push(node.type.create({ ...node.attrs, id: '', sceneId: null, sceneNumber: null }, node.content));
    else if (node.isText) nodes.push(node);
    else nodes.push(node.copy(stripIds(node.content)));
  });
  return Fragment.from(nodes);
}

export const clipboardProps = {
  transformPasted(slice: Slice): Slice {
    return new Slice(stripIds(slice.content), slice.openStart, slice.openEnd);
  },
  /** Pasting whole elements into an empty line keeps the first pasted element's type. */
  handlePaste(view: EditorView, _event: ClipboardEvent, slice: Slice): boolean {
    const { $from, empty } = view.state.selection;
    const first = slice.content.firstChild;
    if (!empty || $from.parent.type !== schema.nodes.element || $from.parent.content.size || !first || first.type !== schema.nodes.element || slice.content.childCount < 2) return false;
    const start = $from.before();
    const tr = view.state.tr.replaceSelection(slice);
    const node = tr.doc.nodeAt(start);
    if (node?.type === schema.nodes.element) tr.setNodeMarkup(start, undefined, { ...node.attrs, kind: first.attrs.kind, sceneId: first.attrs.kind === 'scene' ? null : node.attrs.sceneId });
    view.dispatch(tr.setMeta('uiEvent', 'paste').scrollIntoView());
    return true;
  },
  clipboardTextParser(text: string): Slice {
    const normalised = text.replace(/\r\n?/g, '\n');
    if (!normalised.includes('\n')) return new Slice(Fragment.from(schema.nodes.element.create({ kind: 'action' }, normalised ? schema.text(normalised) : null)), 1, 1);
    let blocks;
    try {
      blocks = decodeFountain(normalised, 'Pasted text', true).document.blocks;
    } catch {
      blocks = normalised.split(/\n{2,}/).map(part => ({ kind: 'action' as BlockKind, text: part.replace(/\n/g, ' ') }));
    }
    const nodes = blocks.filter(block => block.text.trim()).map(block => schema.nodes.element.create({ kind: block.kind }, schema.text(block.text)));
    if (!nodes.length) return Slice.empty;
    return new Slice(Fragment.from(nodes), 1, 1);
  },
  clipboardTextSerializer(slice: Slice): string {
    const lines: string[] = [];
    const speech = ['character', 'parenthetical', 'dialogue'];
    let last = '';
    slice.content.descendants(node => {
      if (node.type !== schema.nodes.element) return true;
      const kind = node.attrs.kind as string;
      const text = ['scene', 'character', 'transition', 'shot', 'act'].includes(kind) ? node.textContent.toUpperCase() : node.textContent;
      const joined = speech.includes(kind) && kind !== 'character' && speech.includes(last);
      if (lines.length && !joined) lines.push('');
      lines.push(kind === 'transition' && !/TO:$/.test(text) ? `> ${text}` : text);
      last = kind;
      return false;
    });
    return lines.join('\n');
  }
};

// ---------------------------------------------------------------- presentation decorations

export interface PresentationOptions {
  placeholderFor: (kind: BlockKind) => string;
  sceneNumbers: () => boolean;
}

export function presentationPlugin(options: PresentationOptions): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const decorations: Decoration[] = [];
        const numbering = options.sceneNumbers();
        let scene = 0;
        const caret = state.selection.empty ? currentElement(state.selection.$from) : null;
        state.doc.descendants((node, pos) => {
          if (node.type !== schema.nodes.element) return true;
          const attrs: Record<string, string> = {};
          if (node.attrs.kind === 'scene') {
            scene++;
            if (numbering) attrs['data-scene-number'] = node.attrs.sceneNumber || String(scene);
          }
          if (node.attrs.revision) {
            attrs['data-revision'] = String(node.attrs.revision).toLowerCase();
          }
          if (!node.content.size && (caret?.pos === pos || state.doc.childCount === 1)) {
            attrs['data-placeholder'] = options.placeholderFor(node.attrs.kind);
            attrs.class = 'swdr-el-empty';
          }
          if (Object.keys(attrs).length) decorations.push(Decoration.node(pos, pos + node.nodeSize, attrs));
          return false;
        });
        return DecorationSet.create(state.doc, decorations);
      }
    }
  });
}

// ---------------------------------------------------------------- find and replace

export interface SearchState {
  query: string;
  caseSensitive: boolean;
  matches: { from: number; to: number }[];
  current: number;
}

export const searchKey = new PluginKey<SearchState>('swdr-search');

function findMatches(doc: PMNode, query: string, caseSensitive: boolean) {
  const matches: { from: number; to: number }[] = [];
  if (!query) return matches;
  const needle = caseSensitive ? query : query.toLowerCase();
  doc.descendants((node, pos) => {
    if (node.type !== schema.nodes.element) return true;
    const text = caseSensitive ? node.textContent : node.textContent.toLowerCase();
    let at = text.indexOf(needle);
    while (at >= 0) {
      matches.push({ from: pos + 1 + at, to: pos + 1 + at + needle.length });
      at = text.indexOf(needle, at + Math.max(1, needle.length));
    }
    return false;
  });
  return matches;
}

export const searchPlugin = new Plugin<SearchState>({
  key: searchKey,
  state: {
    init: () => ({ query: '', caseSensitive: false, matches: [], current: 0 }),
    apply(tr, value) {
      const meta = tr.getMeta(searchKey) as Partial<SearchState> | undefined;
      if (!meta && !tr.docChanged) return value;
      const next = { ...value, ...meta };
      next.matches = findMatches(tr.doc, next.query, next.caseSensitive);
      next.current = Math.min(next.current, Math.max(0, next.matches.length - 1));
      return next;
    }
  },
  props: {
    decorations(state) {
      const search = searchKey.getState(state);
      if (!search?.matches.length) return null;
      return DecorationSet.create(state.doc, search.matches.map((match, index) =>
        Decoration.inline(match.from, match.to, { class: index === search.current ? 'swdr-find swdr-find-current' : 'swdr-find' })));
    }
  }
});

export function searchTransaction(state: EditorState, update: Partial<SearchState>): Transaction {
  return state.tr.setMeta(searchKey, update);
}

// ---------------------------------------------------------------- page breaks

export const pagesKey = new PluginKey<DecorationSet>('swdr-pages');

export const pagesPlugin = new Plugin<DecorationSet>({
  key: pagesKey,
  state: {
    init: () => DecorationSet.empty,
    apply(tr, value) {
      const meta = tr.getMeta(pagesKey) as DecorationSet | undefined;
      return meta ?? value.map(tr.mapping, tr.doc);
    }
  },
  props: { decorations: state => pagesKey.getState(state) }
});

function breakWidget(label: string, more: boolean, contd: string, end = false): () => HTMLElement {
  return () => {
    const root = document.createElement('span');
    root.className = `swdr-page-break${end ? ' swdr-page-end' : ''}`;
    root.contentEditable = 'false';
    root.setAttribute('aria-hidden', 'true');
    if (more) {
      const line = document.createElement('span');
      line.className = 'swdr-page-more';
      line.textContent = '(MORE)';
      root.append(line);
    }
    const filler = document.createElement('span');
    filler.className = 'swdr-page-fill';
    root.append(filler);
    const gap = document.createElement('span');
    gap.className = 'swdr-page-gap';
    if (!end) gap.dataset.next = label;
    root.append(gap);
    if (!end) {
      const start = document.createElement('span');
      start.className = 'swdr-page-start';
      const number = document.createElement('span');
      number.className = 'swdr-page-number';
      number.textContent = `${label}.`;
      start.append(number);
      root.append(start);
      if (contd) {
        const line = document.createElement('span');
        line.className = 'swdr-page-contd';
        line.textContent = contd;
        root.append(line);
      }
    }
    return root;
  };
}

/** Places a break widget where each page starts, using the layout engine's line split. */
export function pageDecorations(doc: PMNode, pages: WritingPage[]): DecorationSet {
  const positions = new Map<string, { pos: number; node: PMNode; inDual: number | null }>();
  doc.descendants((node, pos, parent) => {
    if (node.type === schema.nodes.element) {
      let dual: number | null = null;
      if (parent?.type === schema.nodes.column) doc.forEach((child, offset) => {
        if (child.type === schema.nodes.dual && offset < pos && pos < offset + child.nodeSize) dual = offset;
      });
      positions.set(node.attrs.id, { pos, node, inDual: dual });
      return false;
    }
    return true;
  });
  const decorations: Decoration[] = [];
  const content = pages.filter(page => !page.titlePage);
  const consumed = new Map<string, number>();
  const seenBlocks = new Set<string>();
  content.forEach((page, index) => {
    const lines = page.lines.filter(line => line.blockId && line.decoration !== 'scene-number' && line.decoration !== 'page-number');
    if (index > 0) {
      const previous = content[index - 1].lines;
      const more = previous.some(line => line.decoration === 'continuation' && line.kind === 'parenthetical');
      // The top-of-page cue only; a split at this page's foot also carries a continuation line.
      const contd = lines.find(line => line.decoration === 'continuation' && line.kind === 'character')?.text ?? '';
      const first = lines.find(line => !line.decoration);
      const target = first && positions.get(first.blockId);
      if (first && target) {
        let pos = target.inDual ?? target.pos;
        let side = -1;
        if (seenBlocks.has(first.blockId) && target.inDual === null) {
          const text = target.node.textContent.toUpperCase();
          const from = consumed.get(first.blockId) ?? 0;
          const at = text.indexOf(first.text.toUpperCase(), from);
          if (at > 0) {
            pos = target.pos + 1 + at;
            side = 1;
          }
        } else if (target.inDual === null) {
          decorations.push(Decoration.node(target.pos, target.pos + target.node.nodeSize, { class: 'swdr-page-top' }));
        }
        decorations.push(Decoration.widget(pos, breakWidget(page.label, more, contd), {
          side, key: `page-${page.label}-${more ? 'm' : ''}-${contd}`, ignoreSelection: true
        }));
      }
    }
    for (const line of lines) {
      if (line.decoration) continue;
      seenBlocks.add(line.blockId);
      const target = positions.get(line.blockId);
      if (!target) continue;
      const text = target.node.textContent.toUpperCase();
      const from = consumed.get(line.blockId) ?? 0;
      const at = text.indexOf(line.text.toUpperCase(), from);
      if (at >= 0) consumed.set(line.blockId, at + line.text.length);
    }
  });
  decorations.push(Decoration.widget(doc.content.size, breakWidget('', false, '', true), { side: 1, key: 'page-end', ignoreSelection: true }));
  return DecorationSet.create(doc, decorations);
}

/**
 * Sizes each page's filler from the live DOM so pages are exactly one sheet tall even
 * if the browser wraps a line differently from the layout engine (self-correcting).
 */
export function measurePages(view: EditorView, contentHeight: number, topPadding: number): number[] {
  const root = view.dom as HTMLElement;
  const origin = root.getBoundingClientRect().top;
  let pageStart = topPadding;
  const starts = [0];
  for (const widget of Array.from(root.querySelectorAll<HTMLElement>('.swdr-page-break'))) {
    const filler = widget.querySelector<HTMLElement>('.swdr-page-fill');
    const more = widget.querySelector<HTMLElement>('.swdr-page-more');
    if (!filler) continue;
    const top = widget.getBoundingClientRect().top - origin + (more?.offsetHeight ?? 0);
    const height = Math.max(0, contentHeight - (top - pageStart));
    if (Math.abs(filler.offsetHeight - height) > 0.5) filler.style.height = `${height}px`;
    const start = widget.querySelector<HTMLElement>('.swdr-page-start');
    if (start) {
      pageStart = start.getBoundingClientRect().bottom - origin;
      starts.push(start.getBoundingClientRect().top - origin);
    }
  }
  return starts;
}
