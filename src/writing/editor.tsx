import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import {
  BookOpen, Check, ChevronDown, CircleCheck, MessageSquarePlus, NotebookPen, Columns2, Expand, List, MessageSquareText, Printer, Redo2, Replace, Search, Undo2, X
} from 'lucide-react';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { closeHistory, history, redo, redoDepth, undo, undoDepth } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { EditorState, Plugin, Selection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Button } from '@astryxdesign/core/Button';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Kbd } from '@astryxdesign/core/Kbd';
import { sceneList } from '../model';
import { newId } from '../model';
import type { Block, BlockKind, DocumentModel, ScriptComment, SourceRef, WorkspaceViewProps } from '../model';
import { geometryFor, paginateDocument } from './layout';
import { pairDialogue } from './keyboard';
import { StoryDrawer } from './StoryDrawer';
import { isStoryProject, storyWorkspaceTitle } from '../story/story-profile';
import { WritingContext } from './writing-context';
import { useScriptPrint } from './print';
import { blocksToDoc, docToBlocks } from './pm/convert';
import { ELEMENTS, ELEMENT_ORDER, shortcutLabel } from './pm/elements';
import {
  bracketPlugin, clipboardProps, cycleAlternate, commentAnchors, commentDecorations, commentsKey, commentsPlugin, currentElement, enterCommand, integrityPlugin, measurePages, pageDecorations, pagesKey,
  pagesPlugin, presentationPlugin, searchKey, searchPlugin, searchTransaction, setKind, tabCommand
} from './pm/plugins';
import { indexScript, suggest } from './pm/smarttype';
import { schema } from './pm/schema';

export interface WritingProps extends WorkspaceViewProps {
  target?: SourceRef;
  onFocusChange?: (focus: boolean) => void;
  toolbarEnd?: ReactNode;
  saveLabel?: string;
  /** Kept for callers; the project sidebar now carries Outline. */
  onOpenOutline?: () => void;
  /** Opens Series Intelligence (optionally straight into a character's dossier) for series projects. */
  onOpenSeries?: (characterId?: string) => void;
}

/** Below this manuscript width the page renders as a fluid column without sheet gaps. */
const COMPACT_WIDTH = 880;
const PT = 96 / 72;
const ZOOM_KEY = 'swdr.zoom.v1';
const ZOOM_LEVELS = [75, 90, 100, 110, 125, 150];

function readZoom(): number {
  try {
    const value = Number(localStorage.getItem(ZOOM_KEY));
    return ZOOM_LEVELS.includes(value) ? value : 100;
  } catch {
    return 100;
  }
}

interface Popover {
  mode: 'suggest' | 'elements';
  items: { label: string; insert: string; hint?: string }[];
  index: number;
  from: number;
  x: number;
  y: number;
}

export function WritingView(props: WritingProps) {
  const { document, onDocumentChange, onFocusChange, saveLabel, toolbarEnd, readOnly, target } = props;
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
  const [drawer, setDrawer] = useState<'scenes' | 'notes' | 'comments' | 'story' | null>(null);
  const [activeComment, setActiveComment] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [activeMarks, setActiveMarks] = useState('');
  const emittedComments = useRef<ScriptComment[] | undefined>(document.comments);
  const [focused, setFocused] = useState(false);
  const [finder, setFinder] = useState<{ open: boolean; replace: string }>({ open: false, replace: '' });
  const [search, setSearch] = useState({ query: '', count: 0, current: 0 });
  const [popover, setPopoverState] = useState<Popover | null>(null);
  const [elementMenuOpen, setElementMenuOpen] = useState(false);
  const [notesSection, setNotesSection] = useState<'title' | undefined>();
  const [depth, setDepth] = useState({ undo: 0, redo: 0 });
  const [compact, setCompact] = useState(false);
  const [page, setPage] = useState(1);
  const [caption, setCaption] = useState('');
  const [zoom, setZoomState] = useState(readZoom);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const words = useMemo(() => deferred.blocks.reduce((total, block) => total + blockWords(block), 0), [deferred.blocks]);
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
  const titleSheet = layout.pages.find(sheet => sheet.titlePage);
  const geometry = geometryFor(document.paper);

  // ------------------------------------------------------------ measurement
  const measure = useCallback(() => {
    cancelAnimationFrame(measureFrame.current);
    measureFrame.current = requestAnimationFrame(() => {
      const editor = view.current;
      if (!editor || compactRef.current) return;
      const contentHeight = (geometry.height - geometry.top - geometry.bottom) * PT;
      pageStarts.current = measurePages(editor, contentHeight, geometry.top * PT, zoomRef.current / 100);
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
    setHasSelection(previous => previous === !state.selection.empty ? previous : !state.selection.empty);
    const marks = state.storedMarks ?? state.selection.$from.marks();
    const styled = (['bold', 'italic', 'underline'] as const).filter(name => state.selection.empty
      ? marks.some(mark => mark.type.name === name) : state.doc.rangeHasMark(state.selection.from, state.selection.to, schema.marks[name])).join(' ');
    setActiveMarks(previous => previous === styled ? previous : styled);
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
    commentsPlugin,
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
    keys['Mod-Alt-ArrowDown'] = cycleAlternate(1);
    keys['Mod-Alt-ArrowUp'] = cycleAlternate(-1);
    keys['Mod-b'] = toggleMark(schema.marks.bold);
    keys['Mod-i'] = toggleMark(schema.marks.italic);
    keys['Mod-u'] = toggleMark(schema.marks.underline);
    keys['Mod-Alt-m'] = (state, dispatch) => { if (state.selection.empty) return false; if (dispatch) addComment(); return true; };
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
          const comments = reanchor(current.comments, commentAnchors(next));
          emittedComments.current = comments;
          emit(working => comments === working.comments ? { ...working, blocks } : { ...working, blocks, comments });
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
        // Copy and cut read the editor selection; adopt the browser's first (see syncSelection).
        copy: () => { syncSelection(editor); return false; },
        cut: () => { syncSelection(editor); return false; },
        click: (_view, event) => {
          const id = (event.target as HTMLElement | null)?.closest?.('[data-comment-id]')?.getAttribute('data-comment-id');
          if (id) { setActiveComment(id); setDrawer('comments'); }
          return false;
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
    editor.dispatch(editor.state.tr.setMeta(pagesKey, pageDecorations(editor.state.doc, layout.pages))
      .setMeta(commentsKey, commentDecorations(editor.state.doc, document.comments ?? [], activeComment)).setMeta('swdr-external', true).setMeta('addToHistory', false));
    refreshUi(editor.state, editor);
  }, [document.blocks, plugins, refreshUi, layout.pages]);

  // Comments added, edited, resolved or deleted outside the text (the Comments panel).
  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    emittedComments.current = document.comments;
    editor.dispatch(editor.state.tr.setMeta(commentsKey, commentDecorations(editor.state.doc, document.comments ?? [], activeComment))
      .setMeta('swdr-external', true).setMeta('addToHistory', false));
  }, [document.comments, activeComment]);

  // Page breaks follow the (deferred) layout; widgets map through intermediate edits.
  const breakSignature = useRef('');
  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    // Most keystrokes move no page break; then the mapped widgets are already right and
    // replacing them would make ProseMirror diff every widget in the script.
    const signature = pageSignature(layout.pages);
    if (signature === breakSignature.current) return;
    breakSignature.current = signature;
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
    const observer = new ResizeObserver(() => setCompact(element.clientWidth < Math.max(COMPACT_WIDTH * zoomRef.current / 100, 600)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => { measure(); }, [compact, measure, zoom]);

  function setZoom(value: number) {
    setZoomState(value);
    try { localStorage.setItem(ZOOM_KEY, String(value)); } catch { /* zoom is a per-device convenience */ }
    const element = scroller.current;
    if (element) setCompact(element.clientWidth < Math.max(COMPACT_WIDTH * value / 100, 600));
    requestAnimationFrame(() => view.current?.focus());
  }

  // ------------------------------------------------------------ comments
  function addComment() {
    const editor = view.current;
    if (!editor || latest.current.readOnly) return;
    const { from, to, empty } = editor.state.selection;
    const found = currentElement(editor.state.selection.$from);
    if (empty || !found) { props.onStatus('Select the words you want to comment on.'); return; }
    const start = found.pos + 1;
    const end = Math.min(to, start + found.node.content.size);
    const comment: ScriptComment = {
      id: newId(), blockId: found.node.attrs.id, from: from - start, to: end - start,
      quote: editor.state.doc.textBetween(from, end, ' '), text: '', createdAt: new Date().toISOString()
    };
    onDocumentChange(current => ({ ...current, comments: [...(current.comments ?? []), comment] }));
    setActiveComment(comment.id);
    setDrawer('comments');
    requestAnimationFrame(() => globalThis.document.querySelector<HTMLTextAreaElement>(`[data-comment-editor="${comment.id}"]`)?.focus());
  }

  function updateComment(id: string, change: Partial<ScriptComment> | null) {
    onDocumentChange(current => ({
      ...current,
      comments: change === null ? (current.comments ?? []).filter(item => item.id !== id)
        : (current.comments ?? []).map(item => item.id === id ? { ...item, ...change } : item)
    }));
  }

  function showComment(comment: ScriptComment) {
    setActiveComment(comment.id);
    const editor = view.current;
    if (!editor) return;
    let start = -1;
    editor.state.doc.descendants((node, pos) => {
      if (start >= 0) return false;
      if (node.type === schema.nodes.element && node.attrs.id === comment.blockId) { start = pos + 1; return false; }
      return true;
    });
    if (start < 0) return;
    const size = editor.state.doc.resolve(start).parent.content.size;
    const selection = TextSelection.create(editor.state.doc, start + Math.min(comment.from, size), start + Math.min(comment.to, size));
    editor.dispatch(editor.state.tr.setSelection(selection));
    const dom = editor.domAtPos(start).node as HTMLElement;
    const element = dom.nodeType === 1 ? dom : dom.parentElement;
    if (element && scroller.current) {
      const frame = scroller.current.getBoundingClientRect();
      scroller.current.scrollTop += element.getBoundingClientRect().top - frame.top - frame.height * 0.3;
    }
  }

  // Ordering needs the block list only while the Comments panel is open; elsewhere the count is enough.
  const commentsOpen = drawer === 'comments';
  const orderedComments = useMemo(() => {
    const comments = document.comments ?? [];
    if (!commentsOpen || comments.length < 2) return comments;
    const order = new Map(document.blocks.map((block, index) => [block.id, index]));
    return comments.slice().sort((a, b) => (order.get(a.blockId) ?? 1e9) - (order.get(b.blockId) ?? 1e9) || a.from - b.from);
  }, [commentsOpen, document.blocks, document.comments]);
  const openComments = orderedComments.filter(comment => !comment.resolved);

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
    // Replacing can disable the focused button (no matches left); keep focus in the find bar.
    requestAnimationFrame(() => globalThis.document.querySelector<HTMLInputElement>('#swdr-find-input')?.focus());
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
  // Menu item trees are rebuilt only when what they show changes, not on every keystroke.
  const changeKindRef = useRef(changeKind);
  changeKindRef.current = changeKind;
  const setZoomRef = useRef(setZoom);
  setZoomRef.current = setZoom;
  const elementItems = useMemo(() => [{
    type: 'section' as const, title: 'Tab to switch', id: 'elements',
    items: ELEMENT_ORDER.map(kind => ({
      id: kind, label: ELEMENTS[kind].label,
      endContent: <span className="swdr-w-menu-key">{kind === active.kind && <Check size={14} aria-label="Current element" />}<Kbd keys={`mod+alt+${ELEMENTS[kind].digit}`} /></span>,
      onClick: () => { changeKindRef.current(kind); requestAnimationFrame(() => view.current?.focus()); }
    }))
  }], [active.kind]);
  const zoomItems = useMemo(() => ZOOM_LEVELS.map(level => ({
    id: String(level), label: `${level}%`, endContent: level === zoom ? <Check size={14} aria-label="Current zoom" /> : undefined, onClick: () => setZoomRef.current(level)
  })), [zoom]);
  const styles = { '--swdr-paper-width': `${geometry.width * PT}px` } as CSSProperties;
  const heading = document.kind === 'stageplay' ? 'Stageplay editor' : 'Manuscript editor';

  return (
    <section className={`swdr-writing ${focused ? 'swdr-writing-focus' : ''}`} style={styles} onKeyDown={shellKeys} aria-label={heading}>
      {!focused && <div className="swdr-write-toolbar" ref={toolbar} role="toolbar" aria-label="Writing tools">
        <h1 className="swdr-sr">{document.title}</h1>
        <DropdownMenu
          menuWidth={248}
          menuMaxHeight={480}
          isMenuOpen={elementMenuOpen}
          onOpenChange={setElementMenuOpen}
          renderTrigger={trigger => <button {...trigger} type="button" className="swdr-w-element-trigger" data-element={active.kind}
            aria-label={`Screenplay element: ${ELEMENTS[active.kind].label}`} disabled={readOnly}>
            <span>{ELEMENTS[active.kind].label}</span><ChevronDown size={14} aria-hidden="true" />
          </button>}
          items={elementItems}
        />
        <IconButton label="Undo" tooltip="Undo (Ctrl+Z)" icon={<Undo2 size={16} />} variant="ghost" size="sm" isDisabled={readOnly || !depth.undo} onClick={() => runHistory('undo')} />
        <IconButton label="Redo" tooltip="Redo (Ctrl+Shift+Z)" icon={<Redo2 size={16} />} variant="ghost" size="sm" isDisabled={readOnly || !depth.redo} onClick={() => runHistory('redo')} />
        <span className="swdr-w-divider" aria-hidden="true" />
        {([['bold', 'Bold', 'B', 'mod+b'], ['italic', 'Italic', 'I', 'mod+i'], ['underline', 'Underline', 'U', 'mod+u']] as const).map(([mark, label, glyph]) =>
          <button key={mark} type="button" className={`swdr-w-mark swdr-w-mark-${mark}`} aria-label={label} title={`${label} (${/Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+'}${glyph})`}
            aria-pressed={activeMarks.split(' ').includes(mark)} disabled={readOnly} onMouseDown={event => event.preventDefault()}
            onClick={() => { const editor = view.current; if (editor) { toggleMark(schema.marks[mark])(editor.state, editor.dispatch); editor.focus(); } }}>{glyph}</button>)}
        {active.kind === 'character' && !readOnly && <Button label="Dual" variant="ghost" size="sm" icon={<Columns2 size={15} />} tooltip="Pair this speech with the next one" onClick={toggleDual} />}
        <IconButton label="Add comment" tooltip="Comment on the selected words (Ctrl+Alt+M)" icon={<MessageSquarePlus size={16} />} variant="ghost" size="sm"
          isDisabled={readOnly || !hasSelection} onClick={addComment} />
        <DropdownMenu
          menuWidth={120}
          button={{ label: `${zoom}%`, variant: 'ghost', size: 'sm', tooltip: 'Zoom' }}
          items={zoomItems}
        />
        <span className="swdr-write-save"><CircleCheck size={14} aria-hidden="true" /> {saveLabel || 'Local draft'}</span>
        <IconButton label="Find and replace" tooltip="Find and replace (Ctrl+F)" icon={<Search size={16} />} variant="ghost" size="sm"
          onClick={() => { setFinder(previous => ({ ...previous, open: !previous.open })); requestAnimationFrame(() => globalThis.document.querySelector<HTMLInputElement>('#swdr-find-input')?.focus()); }} />
        <Button label="Scenes" variant={drawer === 'scenes' ? 'secondary' : 'ghost'} size="sm" icon={<List size={16} />} onClick={() => setDrawer(previous => previous === 'scenes' ? null : 'scenes')} />
        {isStoryProject(props.project) && (
          <IconButton label="Story bible" tooltip={`${storyWorkspaceTitle(props.project.kind)} (characters & open questions)`} variant={drawer === 'story' ? 'secondary' : 'ghost'} size="sm" icon={<BookOpen size={16} />}
            onClick={() => setDrawer(previous => previous === 'story' ? null : 'story')} />
        )}
        <IconButton label="Notes" tooltip="Draft notes, title page and revisions" variant={drawer === 'notes' ? 'secondary' : 'ghost'} size="sm" icon={<NotebookPen size={16} />} onClick={() => { setNotesSection(undefined); setDrawer(previous => previous === 'notes' ? null : 'notes'); }} />
        <span className="swdr-w-count-host">
          <IconButton label={openComments.length ? `Comments ${openComments.length}` : 'Comments'} tooltip="Comments" variant={drawer === 'comments' ? 'secondary' : 'ghost'} size="sm" icon={<MessageSquareText size={16} />}
            onClick={() => setDrawer(previous => previous === 'comments' ? null : 'comments')} />
          {openComments.length > 0 && <span className="swdr-w-count" aria-hidden="true">{openComments.length}</span>}
        </span>
        <Button label="Focus" variant="secondary" size="sm" icon={<Expand size={14} />} tooltip="Focus mode (Ctrl+Shift+F)" onClick={() => setFocus(true)} />
        {toolbarEnd || <Button label="Print" variant="secondary" size="sm" icon={<Printer size={14} />} onClick={print.requestPrint} />}
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
        {titleSheet && <button type="button" className={`swdr-sheet swdr-title-sheet swdr-sheet-${document.paper}`} style={compact ? undefined : { zoom: zoom / 100 }}
          aria-label="Title page. Edit title page details" onClick={() => { setNotesSection('title'); setDrawer('notes'); }}>
          {titleSheet.lines.map((line, index) => <span key={index} className="swdr-title-line" style={{
            left: `${line.x * PT}px`, top: `${(line.y - geometry.fontSize) * PT}px`, width: `${line.width * PT}px`, textAlign: line.align
          }}>{line.text}</span>)}
        </button>}
        <div className={`swdr-sheet swdr-sheet-${document.paper}`} style={compact ? undefined : { zoom: zoom / 100 }}>
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
      {!focused && drawer === 'comments' && <aside className="swdr-w-drawer swdr-w-context swdr-w-comments" aria-label="Comments">
        <div className="swdr-w-drawer-head"><h2>Comments <small>{openComments.length}</small></h2><button className="swdr-w-quiet" aria-label="Close comments" onClick={() => setDrawer(null)}><X size={17} /></button></div>
        {!orderedComments.length && <p>Select words in the script and choose <strong>Add comment</strong> (<Kbd keys="mod+alt+m" />) to leave a note on that passage.</p>}
        {orderedComments.length > openComments.length && <label className="swdr-w-check swdr-w-resolved-toggle"><input type="checkbox" checked={showResolved} onChange={event => setShowResolved(event.target.checked)} /> Show resolved ({orderedComments.length - openComments.length})</label>}
        <ol className="swdr-comment-list">{orderedComments.filter(comment => showResolved || !comment.resolved).map(comment => <li key={comment.id}
          className={`swdr-comment-card${comment.id === activeComment ? ' is-current' : ''}${comment.resolved ? ' is-resolved' : ''}`}>
          <button type="button" className="swdr-comment-quote" onClick={() => showComment(comment)} aria-label={`Show passage: ${comment.quote}`}>
            “{comment.quote.length > 120 ? comment.quote.slice(0, 117) + '…' : comment.quote}”
            {comment.detached && <small> · passage deleted</small>}
          </button>
          <label className="swdr-sr" htmlFor={`comment-${comment.id}`}>Comment</label>
          <textarea id={`comment-${comment.id}`} data-comment-editor={comment.id} rows={2} placeholder="Write a comment" value={comment.text} readOnly={readOnly}
            onFocus={() => setActiveComment(comment.id)} onChange={event => updateComment(comment.id, { text: event.target.value })} />
          <div className="swdr-comment-actions">
            <small>{comment.author ?? 'You'} · {new Date(comment.createdAt).toLocaleDateString()}</small>
            {!readOnly && <>
              <Button label={comment.resolved ? 'Reopen' : 'Resolve'} variant="ghost" size="sm" onClick={() => updateComment(comment.id, { resolved: !comment.resolved })} />
              <Button label="Delete" variant="ghost" size="sm" onClick={() => updateComment(comment.id, null)} />
            </>}
          </div>
        </li>)}</ol>
      </aside>}
      {!focused && drawer === 'story' && isStoryProject(props.project) && (
        <StoryDrawer
          project={props.project}
          document={document}
          activeBlockId={active.id}
          onOpenSource={props.onOpenSource}
          onOpenSeries={props.onOpenSeries}
          onClose={() => setDrawer(null)}
        />
      )}
      {!focused && drawer === 'notes' && activeBlock && <WritingContext {...props} key={notesSection ?? 'notes'} section={notesSection} active={activeBlock} onClose={() => { setDrawer(null); setNotesSection(undefined); }} onDocumentChange={commit} onResetHistory={() => undefined} onPrint={print.requestPrint} />}

      <footer className="swdr-write-footer">
        <span className="swdr-w-page-control"><span>Page {Math.min(page, pageCount) || 1} of {pageCount || 1}</span><span aria-hidden="true">·</span><span className="swdr-w-words">{words.toLocaleString()} words</span><span aria-hidden="true">·</span><span className="swdr-w-element-name">{ELEMENTS[active.kind]?.label}</span></span>
        <span className="swdr-sr" role="status">{caption}</span>
        <span>{focused ? <><span>{saveLabel || 'Local draft'}</span><button type="button" className="swdr-w-quiet" onClick={() => setFocus(false)}>Esc to exit focus</button></>
          : <>{readOnly ? 'Read only' : document.revisionLabel || 'Draft'} <span aria-hidden="true">·</span> {document.paper === 'a4' ? 'A4' : 'Letter'}<span className="swdr-w-hint"><span aria-hidden="true"> · </span><button type="button" className="swdr-w-link-quiet" onClick={openElementMenu} disabled={readOnly}>Element menu <Kbd keys="mod+e" /></button></span></>}</span>
      </footer>
      {print.output}
    </section>
  );
}

/**
 * The browser reports selection changes asynchronously. If a key, copy or cut arrives
 * before the editor has read the latest browser selection (select-all then Ctrl+End then
 * Enter, or Shift+Arrow then Ctrl+C in quick succession), adopt the browser's anchor and
 * head first so the action never applies to a stale range.
 */
function syncSelection(editor: EditorView) {
  const dom = (editor.root as Document).getSelection?.();
  if (!dom || !dom.anchorNode || !dom.focusNode || !editor.dom.contains(dom.anchorNode) || !editor.dom.contains(dom.focusNode)) return;
  try {
    const anchor = editor.posAtDOM(dom.anchorNode, dom.anchorOffset);
    const head = editor.posAtDOM(dom.focusNode, dom.focusOffset);
    const { selection } = editor.state;
    if (selection.anchor === anchor && selection.head === head) return;
    const $anchor = editor.state.doc.resolve(anchor);
    const $head = editor.state.doc.resolve(head);
    const next = $anchor.parent.inlineContent && $head.parent.inlineContent
      ? TextSelection.create(editor.state.doc, anchor, head)
      : Selection.near($head);
    editor.dispatch(editor.state.tr.setSelection(next));
  } catch {
    // A focus node inside a widget has no document position; keep the editor's selection.
  }
}

/** Moves comments to their mapped anchors; a comment whose passage was deleted is kept, marked detached. */
function reanchor(comments: ScriptComment[] | undefined, anchors: Map<string, { blockId: string; from: number; to: number }>): ScriptComment[] | undefined {
  if (!comments?.length) return comments;
  let changed = false;
  const next = comments.map(comment => {
    if (comment.resolved) return comment;
    const anchor = anchors.get(comment.id);
    if (!anchor) {
      if (comment.detached) return comment;
      changed = true;
      return { ...comment, detached: true };
    }
    if (anchor.blockId === comment.blockId && anchor.from === comment.from && anchor.to === comment.to && !comment.detached) return comment;
    changed = true;
    return { ...comment, ...anchor, detached: undefined };
  });
  return changed ? next : comments;
}

const wordCache = new WeakMap<Block, number>();
/** Words in a block, cached by block identity (unchanged blocks keep their object). */
function blockWords(block: Block): number {
  if (block.kind === 'note') return 0;
  let count = wordCache.get(block);
  if (count === undefined) {
    count = block.text.match(/[\p{L}\p{N}'’-]+/gu)?.length ?? 0;
    wordCache.set(block, count);
  }
  return count;
}

/** Where each page starts (block, line text, continuation); equal signatures mean equal breaks. */
function pageSignature(pages: ReturnType<typeof paginateDocument>['pages']): string {
  return pages.filter(page => !page.titlePage).map(page => {
    const first = page.lines.find(line => line.blockId && line.decoration !== 'scene-number' && line.decoration !== 'page-number');
    const more = page.lines.some(line => line.decoration === 'continuation' && line.kind === 'parenthetical');
    return `${page.label}|${first?.blockId}|${first?.decoration ?? ''}|${first?.text ?? ''}|${more ? 'm' : ''}`;
  }).join('\n');
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
