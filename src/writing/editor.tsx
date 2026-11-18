import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import {
  ChevronDown, CircleCheck, Columns2, Expand, FileText, List, MessageSquareText, Printer, Redo2, Replace, Search, Undo2, X
} from 'lucide-react';
import { baseKeymap } from 'prosemirror-commands';
import { closeHistory, history, redo, redoDepth, undo, undoDepth } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { EditorState, Plugin, Selection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { sceneList } from '../model';
import type { Block, BlockKind, DocumentModel, SourceRef, WorkspaceViewProps } from '../model';
import { geometryFor, paginateDocument } from './layout';
import { pairDialogue } from './keyboard';
import { WritingContext } from './writing-context';
import { useScriptPrint } from './print';
import { blocksToDoc, docToBlocks } from './pm/convert';
import { ELEMENTS, ELEMENT_ORDER, shortcutLabel } from './pm/elements';
import {
  bracketPlugin, clipboardProps, currentElement, enterCommand, integrityPlugin, measurePages, pageDecorations, pagesKey,
  pagesPlugin, presentationPlugin, searchKey, searchPlugin, searchTransaction, setKind, tabCommand
} from './pm/plugins';
import { indexScript, suggest } from './pm/smarttype';
import { schema } from './pm/schema';

export interface WritingProps extends WorkspaceViewProps {
  target?: SourceRef;
  onFocusChange?: (focus: boolean) => void;
  toolbarEnd?: ReactNode;
  saveLabel?: string;
  onOpenOutline?: () => void;
}

/** Below this manuscript width the page renders as a fluid column without sheet gaps. */
const COMPACT_WIDTH = 880;
const PT = 96 / 72;

interface Popover {
  mode: 'suggest' | 'elements';
  items: { label: string; insert: string; hint?: string }[];
  index: number;
  from: number;
  x: number;
  y: number;
}

export function WritingView(props: WritingProps) {
  const { document, onDocumentChange, onFocusChange, onOpenOutline, saveLabel, toolbarEnd, readOnly, target } = props;
  const deferred = useDeferredValue(document);
  const layout = useMemo(() => paginateDocument(deferred, { includeNotes: true }), [deferred]);
  const scenes = useMemo(() => sceneList(deferred), [deferred]);
  const print = useScriptPrint(document);

  const mount = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const emitted = useRef<Block[]>(document.blocks);
  const latest = useRef({ document, onDocumentChange, readOnly });
  const popoverRef = useRef<Popover | null>(null);
  const dismissed = useRef('');
  const pageStarts = useRef<number[]>([0]);
  const measureFrame = useRef(0);

  const [active, setActive] = useState<{ id: string; kind: BlockKind }>({ id: document.blocks[0]?.id ?? '', kind: document.blocks[0]?.kind ?? 'scene' });
  const [drawer, setDrawer] = useState<'scenes' | 'notes' | null>(null);
  const [focused, setFocused] = useState(false);
  const [finder, setFinder] = useState<{ open: boolean; replace: string }>({ open: false, replace: '' });
  const [search, setSearch] = useState({ query: '', count: 0, current: 0 });
  const [popover, setPopoverState] = useState<Popover | null>(null);
  const [depth, setDepth] = useState({ undo: 0, redo: 0 });
  const [compact, setCompact] = useState(false);
  const [page, setPage] = useState(1);
  const [caption, setCaption] = useState('');
  const compactRef = useRef(compact);
  compactRef.current = compact;

  useLayoutEffect(() => { latest.current = { document, onDocumentChange, readOnly }; });

  const setPopover = useCallback((next: Popover | null) => {
    popoverRef.current = next;
    setPopoverState(next);
  }, []);

  const scriptIndex = useMemo(() => indexScript(deferred.blocks, active.id), [deferred.blocks, active.id]);
  const indexRef = useRef(scriptIndex);
  indexRef.current = scriptIndex;

  const pageCount = layout.pages.filter(sheet => !sheet.titlePage).length;
  const geometry = geometryFor(document.paper);

  // ------------------------------------------------------------ measurement
  const measure = useCallback(() => {
    cancelAnimationFrame(measureFrame.current);
    measureFrame.current = requestAnimationFrame(() => {
      const editor = view.current;
      if (!editor || compactRef.current) return;
      const contentHeight = (geometry.height - geometry.top - geometry.bottom) * PT;
      pageStarts.current = measurePages(editor, contentHeight, geometry.top * PT);
    });
  }, [geometry.bottom, geometry.height, geometry.top]);

  // ------------------------------------------------------------ ui sync from editor state
  const refreshUi = useCallback((state: EditorState, editor: EditorView) => {
    const found = currentElement(state.selection.$from);
    if (found) setActive(previous => previous.id === found.node.attrs.id && previous.kind === found.node.attrs.kind ? previous : { id: found.node.attrs.id, kind: found.node.attrs.kind });
    setDepth(previous => {
      const next = { undo: undoDepth(state), redo: redoDepth(state) };
      return previous.undo === next.undo && previous.redo === next.redo ? previous : next;
    });
    const found2 = searchKey.getState(state);
    if (found2) setSearch(previous => previous.query === found2.query && previous.count === found2.matches.length && previous.current === found2.current
      ? previous : { query: found2.query, count: found2.matches.length, current: found2.current });

    // SmartType: offered when the caret sits at the end of a heading, cue or transition.
    if (popoverRef.current?.mode === 'elements') return;
    const { selection } = state;
    if (!found || !selection.empty || !editor.hasFocus() || latest.current.readOnly) { if (popoverRef.current) setPopover(null); return; }
    const text = found.node.textContent;
    const atEnd = selection.$from.parentOffset === found.node.content.size;
    const key = `${found.node.attrs.id}:${text}`;
    const offer = atEnd && dismissed.current !== key ? suggest(found.node.attrs.kind, text, indexRef.current) : null;
    if (!offer) { if (popoverRef.current) setPopover(null); return; }
    const coords = editor.coordsAtPos(selection.from);
    const frame = scroller.current?.getBoundingClientRect();
    if (!frame) return;
    const same = popoverRef.current && popoverRef.current.items.map(item => item.label).join('|') === offer.items.map(item => item.label).join('|');
    setPopover({
      mode: 'suggest', items: offer.items, from: offer.from, index: same ? popoverRef.current!.index : 0,
      x: coords.left - frame.left + (scroller.current?.scrollLeft ?? 0), y: coords.bottom - frame.top + (scroller.current?.scrollTop ?? 0) + 4
    });
  }, [setPopover]);

  // ------------------------------------------------------------ editor creation
  const plugins = useMemo(() => [
    new Plugin({ props: { handleKeyDown: (editor, event) => { syncSelection(editor); return handlePopoverKey(editor, event); } } }),
    keymap(elementKeys()),
    keymap({
      Enter: enterCommand,
      'Shift-Enter': enterCommand,
      Tab: tabCommand(false),
      'Shift-Tab': tabCommand(true),
      'Mod-z': undo,
      'Mod-y': redo,
      'Shift-Mod-z': redo
    }),
    keymap(baseKeymap),
    history({ newGroupDelay: 650 }),
    integrityPlugin,
    bracketPlugin,
    presentationPlugin({ placeholderFor: kind => ELEMENTS[kind].label, sceneNumbers: () => latest.current.document.showSceneNumbers !== false }),
    searchPlugin,
    pagesPlugin
  ], []);

  function elementKeys() {
    const keys: Record<string, (state: EditorState, dispatch?: EditorView['dispatch']) => boolean> = {};
    for (const kind of ELEMENT_ORDER) {
      const digit = ELEMENTS[kind].digit;
      keys[`Mod-${digit}`] = setKind(kind);
      keys[`Mod-Alt-${digit}`] = setKind(kind);
    }
    keys['Mod-e'] = (_state, dispatch) => { if (dispatch) openElementMenu(); return true; };
    return keys;
  }

  function accept(editor: EditorView, choice: Popover['items'][number]) {
    const current = popoverRef.current;
    const found = currentElement(editor.state.selection.$from);
    if (!current || !found) return;
    if (current.mode === 'elements') {
      setPopover(null);
      setKind(choice.insert as BlockKind)(editor.state, editor.dispatch);
      setCaption(ELEMENTS[choice.insert as BlockKind].label);
      editor.focus();
      return;
    }
    const start = found.pos + 1 + current.from;
    const end = found.pos + 1 + found.node.content.size;
    const tr = editor.state.tr.insertText(choice.insert, start, end);
    tr.setSelection(TextSelection.create(tr.doc, start + choice.insert.length));
    setPopover(null);
    editor.dispatch(tr.scrollIntoView());
  }

  function handlePopoverKey(editor: EditorView, event: KeyboardEvent): boolean {
    const current = popoverRef.current;
    if (!current) return false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setPopover({ ...current, index: (current.index + step + current.items.length) % current.items.length });
      return true;
    }
    if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
      accept(editor, current.items[current.index]);
      return true;
    }
    if (event.key === 'Escape') {
      const found = currentElement(editor.state.selection.$from);
      if (found) dismissed.current = `${found.node.attrs.id}:${found.node.textContent}`;
      setPopover(null);
      return true;
    }
    if (current.mode === 'elements' && /^[1-9]$/.test(event.key)) {
      const kind = ELEMENT_ORDER.find(item => String(ELEMENTS[item].digit) === event.key);
      if (kind) accept(editor, { label: '', insert: kind });
      return true;
    }
    return false;
  }

  function openElementMenu() {
    const editor = view.current;
    if (!editor || latest.current.readOnly) return;
    const frame = scroller.current?.getBoundingClientRect();
    const coords = editor.coordsAtPos(editor.state.selection.from);
    const kind = currentElement(editor.state.selection.$from)?.node.attrs.kind as BlockKind | undefined;
    if (!frame) return;
    setPopover({
      mode: 'elements', from: 0,
      items: ELEMENT_ORDER.map(item => ({ label: ELEMENTS[item].label, insert: item, hint: shortcutLabel(item) })),
      index: Math.max(0, ELEMENT_ORDER.indexOf(kind ?? 'action')),
      x: coords.left - frame.left + (scroller.current?.scrollLeft ?? 0), y: coords.bottom - frame.top + (scroller.current?.scrollTop ?? 0) + 4
    });
  }

  useEffect(() => {
    if (!mount.current) return;
    const state = EditorState.create({ doc: blocksToDoc(latest.current.document.blocks), plugins });
    const editor: EditorView = new EditorView(mount.current, {
      state,
      editable: () => !latest.current.readOnly,
      attributes: {
        class: 'swdr-pm', role: 'textbox', 'aria-multiline': 'true',
        'aria-label': latest.current.document.kind === 'stageplay' ? 'Stageplay manuscript' : 'Screenplay manuscript',
        spellcheck: 'true'
      },
      ...clipboardProps,
      dispatchTransaction(tr) {
        // Paste, cut and drop are always their own undo step.
        if (['paste', 'cut', 'drop'].includes(tr.getMeta('uiEvent'))) closeHistory(tr);
        const next = editor.state.apply(tr);
        editor.updateState(next);
        if (tr.docChanged && !tr.getMeta('swdr-external')) {
          const { document: current, onDocumentChange: emit } = latest.current;
          const blocks = docToBlocks(next.doc, emitted.current, current.revisionLabel);
          emitted.current = blocks;
          emit(working => ({ ...working, blocks }));
        }
        refreshUi(next, editor);
        if (tr.docChanged || tr.getMeta(pagesKey)) measure();
      },
      handleDOMEvents: {
        // Clicking blank paper (a page gap or the empty foot of the last page) puts the
        // caret at the nearest writable position instead of inside a non-editable widget.
        mousedown: (_view, event) => {
          const widget = (event.target as HTMLElement | null)?.closest?.('.swdr-page-break');
          if (!widget || latest.current.readOnly) return false;
          event.preventDefault();
          const end = widget.classList.contains('swdr-page-end');
          const pos = end ? editor.state.doc.content.size : editor.posAtDOM(widget, 0);
          editor.dispatch(editor.state.tr.setSelection(Selection.near(editor.state.doc.resolve(pos), end ? -1 : 1)));
          editor.focus();
          return true;
        },
        focus: () => { refreshUi(editor.state, editor); return false; },
        blur: () => { window.setTimeout(() => { if (!editor.hasFocus() && popoverRef.current?.mode === 'suggest') setPopover(null); }, 120); return false; }
      }
    });
    view.current = editor;
    emitted.current = latest.current.document.blocks;
    refreshUi(editor.state, editor);
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, [plugins, refreshUi, measure, setPopover]);

  // External document changes (restore, import, context panel, collaborators) reload the editor.
  useLayoutEffect(() => {
    const editor = view.current;
    if (!editor || document.blocks === emitted.current) return;
    emitted.current = document.blocks;
    const anchor = editor.state.selection.from;
    const doc = blocksToDoc(document.blocks);
    let state = EditorState.create({ doc, plugins });
    const selection = Selection.near(state.doc.resolve(Math.min(anchor, state.doc.content.size - 1)));
    state = state.apply(state.tr.setSelection(selection).setMeta('swdr-external', true));
    editor.updateState(state);
    editor.dispatch(editor.state.tr.setMeta(pagesKey, pageDecorations(editor.state.doc, layout.pages)).setMeta('swdr-external', true).setMeta('addToHistory', false));
    refreshUi(editor.state, editor);
  }, [document.blocks, plugins, refreshUi, layout.pages]);

  // Page breaks follow the (deferred) layout; widgets map through intermediate edits.
  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    editor.dispatch(editor.state.tr.setMeta(pagesKey, pageDecorations(editor.state.doc, layout.pages)).setMeta('swdr-external', true).setMeta('addToHistory', false));
  }, [layout.pages, compact]);

  // Re-render decorations that read document settings (scene numbering).
  useEffect(() => {
    const editor = view.current;
    if (editor) editor.dispatch(editor.state.tr.setMeta('swdr-external', true).setMeta('addToHistory', false));
  }, [document.showSceneNumbers]);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setCompact(element.clientWidth < COMPACT_WIDTH));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => { measure(); }, [compact, measure]);

  // ------------------------------------------------------------ navigation
  const jump = useCallback((blockId: string, edit = true) => {
    const editor = view.current;
    if (!editor) return false;
    let target = -1;
    editor.state.doc.descendants((node, pos) => {
      if (target >= 0) return false;
      if (node.type === schema.nodes.element && node.attrs.id === blockId) { target = pos; return false; }
      return true;
    });
    if (target < 0) return false;
    const dom = editor.nodeDOM(target) as HTMLElement | null;
    if (edit) {
      editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, target + 1)));
      editor.focus();
    }
    if (dom && scroller.current) {
      const frame = scroller.current.getBoundingClientRect();
      scroller.current.scrollTop += dom.getBoundingClientRect().top - frame.top - frame.height * 0.3;
      dom.classList.add('swdr-el-flash');
      window.setTimeout(() => dom.classList.remove('swdr-el-flash'), 1600);
    }
    return true;
  }, []);

  const lastTarget = useRef<SourceRef | undefined>(undefined);
  useEffect(() => {
    if (!target || target === lastTarget.current || target.documentId !== document.id || target.revisionId !== document.revisionId) return;
    const blockId = target.blockId ?? scenes.find(scene => scene.id === target.sceneId)?.blockId;
    if (!blockId) return;
    lastTarget.current = target;
    requestAnimationFrame(() => jump(blockId, !readOnly));
  }, [target, document.id, document.revisionId, scenes, jump, readOnly]);

  function onScroll() {
    const editor = view.current;
    const frame = scroller.current;
    if (!editor || !frame) return;
    const offset = frame.getBoundingClientRect().top - editor.dom.getBoundingClientRect().top + frame.clientHeight * 0.35;
    let index = 0;
    pageStarts.current.forEach((start, position) => { if (start <= offset) index = position; });
    setPage(previous => previous === index + 1 ? previous : index + 1);
    if (popoverRef.current) setPopover(null);
  }

  // ------------------------------------------------------------ commands from chrome
  function changeKind(kind: BlockKind) {
    const editor = view.current;
    if (!editor) return;
    setKind(kind)(editor.state, editor.dispatch);
    setCaption(ELEMENTS[kind].label);
    editor.focus();
  }

  function runHistory(direction: 'undo' | 'redo') {
    const editor = view.current;
    if (!editor) return;
    (direction === 'undo' ? undo : redo)(editor.state, editor.dispatch);
    editor.focus();
  }

  function commit(update: (current: DocumentModel) => DocumentModel) {
    if (!readOnly) onDocumentChange(update);
  }

  function toggleDual() {
    const block = document.blocks.find(item => item.id === active.id);
    if (!block || block.kind !== 'character') return;
    const next = pairDialogue(document, block.id);
    if (!next) { props.onStatus('Dual dialogue needs a second speech right after this one.'); return; }
    commit(() => next);
  }

  function setFocus(mode: boolean) {
    setFocused(mode);
    onFocusChange?.(mode);
    requestAnimationFrame(() => { view.current?.focus(); measure(); });
  }

  // ------------------------------------------------------------ find & replace
  function updateSearch(query: string) {
    const editor = view.current;
    if (!editor) return;
    editor.dispatch(searchTransaction(editor.state, { query, current: 0 }));
  }

  function step(direction: 1 | -1) {
    const editor = view.current;
    const state = editor && searchKey.getState(editor.state);
    if (!editor || !state?.matches.length) return;
    const current = (state.current + direction + state.matches.length) % state.matches.length;
    const match = state.matches[current];
    const tr = searchTransaction(editor.state, { current });
    tr.setSelection(TextSelection.create(tr.doc, match.from, match.to)).scrollIntoView();
    editor.dispatch(tr);
  }

  function replace(all: boolean) {
    const editor = view.current;
    const state = editor && searchKey.getState(editor.state);
    if (!editor || readOnly || !state?.matches.length) return;
    const targets = all ? state.matches : [state.matches[state.current]];
    const tr = editor.state.tr;
    for (const match of [...targets].reverse()) {
      if (finder.replace) tr.insertText(finder.replace, match.from, match.to);
      else tr.delete(match.from, match.to);
    }
    editor.dispatch(tr);
    setCaption(all ? `Replaced ${targets.length}` : 'Replaced 1');
  }

  function shellKeys(event: ReactKeyboardEvent<HTMLElement>) {
    const modifier = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (modifier && key === 'f' && !event.shiftKey) {
      event.preventDefault();
      setFinder(previous => ({ ...previous, open: true }));
      requestAnimationFrame(() => globalThis.document.querySelector<HTMLInputElement>('#swdr-find-input')?.select());
      return;
    }
    if (modifier && event.shiftKey && key === 'f') {
      event.preventDefault();
      setFocus(!focused);
      return;
    }
    if (event.key === 'Escape' && !popoverRef.current) {
      if (finder.open) { setFinder(previous => ({ ...previous, open: false })); updateSearch(''); view.current?.focus(); return; }
      if (focused) { setFocus(false); return; }
      if (drawer) { setDrawer(null); view.current?.focus(); }
    }
    if (event.key === 'F6') {
      event.preventDefault();
      if (view.current?.hasFocus()) toolbar.current?.querySelector<HTMLElement>('button, select')?.focus();
      else view.current?.focus();
    }
  }

  const activeBlock = document.blocks.find(block => block.id === active.id) ?? document.blocks[0];
  const styles = { '--swdr-paper-width': `${geometry.width * PT}px` } as CSSProperties;
  const heading = document.kind === 'stageplay' ? 'Stageplay editor' : 'Manuscript editor';

  return (
    <section className={`swdr-writing ${focused ? 'swdr-writing-focus' : ''}`} style={styles} onKeyDown={shellKeys} aria-label={heading}>
      {!focused && <div className="swdr-write-toolbar" ref={toolbar}>
        <span className="swdr-w-current" aria-current="page"><FileText size={15} aria-hidden="true" /> Write</span>
        {onOpenOutline && <button type="button" className="swdr-w-quiet" onClick={onOpenOutline}>Outline</button>}
        <label className="swdr-w-element"><span className="swdr-sr">Screenplay element</span>
          <select aria-label="Screenplay element" value={active.kind} disabled={readOnly} onChange={event => changeKind(event.target.value as BlockKind)}>
            {ELEMENT_ORDER.map(kind => <option key={kind} value={kind}>{ELEMENTS[kind].label}</option>)}
          </select><ChevronDown size={13} aria-hidden="true" />
        </label>
        <button type="button" className="swdr-w-quiet swdr-w-history" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={readOnly || !depth.undo} onClick={() => runHistory('undo')}><Undo2 size={16} aria-hidden="true" /></button>
        <button type="button" className="swdr-w-quiet swdr-w-history" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={readOnly || !depth.redo} onClick={() => runHistory('redo')}><Redo2 size={16} aria-hidden="true" /></button>
        {active.kind === 'character' && !readOnly && <button type="button" className="swdr-w-quiet" onClick={toggleDual} title="Pair this speech with the next one" aria-pressed={Boolean(activeBlock?.dual)}><Columns2 size={15} aria-hidden="true" /><span>Dual</span></button>}
        <span className="swdr-write-save"><CircleCheck size={14} aria-hidden="true" /> {saveLabel || 'Local draft'}</span>
        <button type="button" className={`swdr-w-quiet ${finder.open ? 'swdr-w-current' : ''}`} aria-label="Find and replace" title="Find and replace (Ctrl+F)" aria-expanded={finder.open}
          onClick={() => { setFinder(previous => ({ ...previous, open: !previous.open })); requestAnimationFrame(() => globalThis.document.querySelector<HTMLInputElement>('#swdr-find-input')?.focus()); }}><Search size={15} aria-hidden="true" /></button>
        <button type="button" className={`swdr-w-quiet ${drawer === 'scenes' ? 'swdr-w-current' : ''}`} onClick={() => setDrawer(previous => previous === 'scenes' ? null : 'scenes')} aria-label="Scenes" aria-expanded={drawer === 'scenes'}><List size={16} aria-hidden="true" /><span>Scenes</span></button>
        <button type="button" className={`swdr-w-quiet ${drawer === 'notes' ? 'swdr-w-current' : ''}`} onClick={() => setDrawer(previous => previous === 'notes' ? null : 'notes')} aria-label="Notes" aria-expanded={drawer === 'notes'}><MessageSquareText size={15} aria-hidden="true" /><span>Notes</span></button>
        <button type="button" className="swdr-w-button" aria-keyshortcuts="Control+Shift+F Meta+Shift+F" onClick={() => setFocus(true)}><Expand size={14} aria-hidden="true" /><span>Focus</span></button>
        {toolbarEnd || <button type="button" className="swdr-w-button" onClick={print.requestPrint}><Printer size={14} aria-hidden="true" /> Print</button>}
      </div>}

      {finder.open && <div className="swdr-finder" role="search" aria-label="Find and replace">
        <label className="swdr-sr" htmlFor="swdr-find-input">Find</label>
        <input id="swdr-find-input" placeholder="Find in script" value={search.query} onChange={event => updateSearch(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); step(event.shiftKey ? -1 : 1); } }} />
        <span className="swdr-finder-count" aria-live="polite">{search.query ? (search.count ? `${search.current + 1} of ${search.count}` : 'No matches') : ''}</span>
        <button type="button" className="swdr-w-quiet" aria-label="Previous match" onClick={() => step(-1)} disabled={!search.count}>‹</button>
        <button type="button" className="swdr-w-quiet" aria-label="Next match" onClick={() => step(1)} disabled={!search.count}>›</button>
        {!readOnly && <>
          <label className="swdr-sr" htmlFor="swdr-replace-input">Replace with</label>
          <input id="swdr-replace-input" placeholder="Replace with" value={finder.replace} onChange={event => setFinder(previous => ({ ...previous, replace: event.target.value }))} />
          <button type="button" className="swdr-w-quiet" onClick={() => replace(false)} disabled={!search.count}><Replace size={14} aria-hidden="true" /> Replace</button>
          <button type="button" className="swdr-w-quiet" onClick={() => replace(true)} disabled={!search.count}>All</button>
        </>}
        <button type="button" className="swdr-w-quiet" aria-label="Close find" onClick={() => { setFinder(previous => ({ ...previous, open: false })); updateSearch(''); view.current?.focus(); }}><X size={15} aria-hidden="true" /></button>
      </div>}

      <div ref={scroller} className={`swdr-manuscript-scroll ${compact ? 'swdr-compact' : ''}`} onScroll={onScroll} aria-label="Manuscript pages">
        <div className={`swdr-sheet swdr-sheet-${document.paper}`}>
          <div ref={mount} className="swdr-pm-mount" />
        </div>
        {popover && <ul className={`swdr-popover swdr-popover-${popover.mode}`} role="listbox" aria-label={popover.mode === 'elements' ? 'Element type' : 'Suggestions'}
          style={{ left: popover.x, top: popover.y }} onMouseDown={event => event.preventDefault()}>
          {popover.mode === 'elements' && <li className="swdr-popover-head" role="presentation">Element</li>}
          {popover.items.map((item, index) => <li key={item.label} role="option" aria-selected={index === popover.index}
            className={index === popover.index ? 'swdr-popover-on' : ''}
            onMouseEnter={() => setPopover({ ...popover, index })}
            onClick={() => view.current && accept(view.current, item)}>
            <span>{item.label}</span>{item.hint && <kbd>{item.hint}</kbd>}
          </li>)}
          {popover.mode === 'suggest' && <li className="swdr-popover-foot" role="presentation">↵ or Tab to accept · Esc to dismiss</li>}
        </ul>}
      </div>

      {!focused && drawer === 'scenes' && <aside className="swdr-w-drawer swdr-w-scenes" aria-label="Scenes">
        <div className="swdr-w-drawer-head"><h2>Scenes <small>{scenes.length}</small></h2><button className="swdr-w-quiet" aria-label="Close scenes" onClick={() => setDrawer(null)}><X size={17} /></button></div>
        {scenes.length ? <ol>{scenes.map(scene => <li key={scene.id}>
          <button type="button" className={activeSceneOf(document.blocks, active.id) === scene.blockId ? 'swdr-scene-on' : ''} onClick={() => {
            jump(scene.blockId);
            setCaption(`Scene ${scene.number}`);
            if (window.matchMedia('(max-width: 850px)').matches) setDrawer(null);
          }}><small>{scene.number}</small><span>{scene.heading.toUpperCase() || 'Untitled scene'}</span></button>
        </li>)}</ol> : <p>Add a scene heading to start the scene list.</p>}
      </aside>}
      {!focused && drawer === 'notes' && activeBlock && <WritingContext {...props} active={activeBlock} onClose={() => setDrawer(null)} onDocumentChange={commit} onResetHistory={() => undefined} onPrint={print.requestPrint} />}

      <footer className="swdr-write-footer">
        <span className="swdr-w-page-control">Page {Math.min(page, pageCount) || 1} of {pageCount || 1}<span aria-hidden="true"> · </span><span className="swdr-w-element-name">{ELEMENTS[active.kind]?.label}</span></span>
        <span className="swdr-sr" role="status">{caption}</span>
        <span>{focused ? <><span>{saveLabel || 'Local draft'}</span><button type="button" className="swdr-w-quiet" onClick={() => setFocus(false)}>Esc to exit focus</button></>
          : <>{readOnly ? 'Read only' : document.revisionLabel || 'Draft'} <span aria-hidden="true">·</span> {document.paper === 'a4' ? 'A4' : 'Letter'}<span aria-hidden="true"> · </span><button type="button" className="swdr-w-link-quiet" onClick={openElementMenu} disabled={readOnly}>Elements {shortcutLabel('scene').replace(/1$/, '1–9')}</button></>}</span>
      </footer>
      {print.output}
    </section>
  );
}

/**
 * The browser reports selection changes asynchronously. If a key arrives while the
 * editor still holds a wider selection than the DOM shows (e.g. select-all, then
 * Ctrl+End, then Enter in quick succession), adopt the DOM caret first so the key can
 * never act on a stale range.
 */
function syncSelection(editor: EditorView) {
  const dom = (editor.root as Document).getSelection?.();
  if (!dom || !dom.isCollapsed || editor.state.selection.empty || !dom.focusNode || !editor.dom.contains(dom.focusNode)) return;
  try {
    const pos = editor.posAtDOM(dom.focusNode, dom.focusOffset);
    editor.dispatch(editor.state.tr.setSelection(Selection.near(editor.state.doc.resolve(pos))));
  } catch {
    // A focus node inside a widget has no document position; keep the editor's selection.
  }
}

function activeSceneOf(blocks: Block[], blockId: string): string | undefined {
  let scene: string | undefined;
  for (const block of blocks) {
    if (block.kind === 'scene') scene = block.id;
    if (block.id === blockId) return scene;
  }
  return scene;
}

export function manuscriptPaperDescription(paper: DocumentModel['paper']): string {
  const geometry = geometryFor(paper);
  return `${(geometry.width / 72).toFixed(2)} × ${(geometry.height / 72).toFixed(2)} in`;
}
