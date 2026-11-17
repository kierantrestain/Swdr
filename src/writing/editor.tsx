import {
  useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState
} from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { ChevronDown, CircleCheck, Expand, FileText, List, MessageSquareText, Printer, Redo2, Undo2, X } from 'lucide-react';
import { BLOCK_KINDS, newBlock, sceneList } from '../model';
import type { BlockKind, DocumentModel, SourceRef, WorkspaceViewProps } from '../model';
import type { LaidOutLine, PageGeometry, WritingPage } from './layout';
import { geometryFor, isUppercaseElement, paginateDocument, revisionInk } from './layout';
import { cycleElement, elementNames, nextElement, replaceBlock, splitBlock, withElement } from './keyboard';
import { WritingContext } from './writing-context';
import { useScriptPrint } from './print';

interface Caret {
  blockId: string;
  start: number;
  end: number;
}

interface HistoryEntry {
  document: DocumentModel;
  caret: Caret | null;
}

interface PageProjection {
  page: WritingPage;
  rows: { first: LaidOutLine; lines: number }[];
  fragments: LaidOutLine[];
}

export interface WritingProps extends WorkspaceViewProps {
  target?: SourceRef;
  onFocusChange?: (focus: boolean) => void;
  toolbarEnd?: ReactNode;
  saveLabel?: string;
  onOpenOutline?: () => void;
}

const PAPER_GAP = 24;
const PAPER_PAD = 24;
const MAX_HISTORY = 120;
const place = (value: number, max: number) => `${value / max * 100}%`;

function projectPages(pages: WritingPage[]) {
  const byBlock = new Map<string, number>();
  const projection = pages.map((page, index): PageProjection => {
    const groups = new Map<string, { first: LaidOutLine; lines: number }>();
    const fragments: LaidOutLine[] = [];
    for (const line of page.lines) {
      const start = byBlock.get(line.blockId);
      if (!line.blockId || line.decoration || (start !== undefined && start !== index)) {
        fragments.push(line);
        continue;
      }
      const group = groups.get(line.blockId);
      if (group) group.lines++;
      else {
        byBlock.set(line.blockId, index);
        groups.set(line.blockId, { first: line, lines: 1 });
      }
    }
    return { page, rows: [...groups.values()], fragments };
  });
  return { byBlock, projection };
}

function readCaret(element: HTMLTextAreaElement): Caret {
  return { blockId: element.dataset.blockId ?? '', start: element.selectionStart, end: element.selectionEnd };
}

function findField(container: HTMLDivElement | null, blockId: string) {
  return container?.querySelector<HTMLTextAreaElement>(`textarea[data-block-id="${CSS.escape(blockId)}"]`);
}

export function WritingView(props: WritingProps) {
  const { document, onDocumentChange, onFocusChange, onOpenOutline, saveLabel, toolbarEnd, readOnly, target } = props;
  const deferred = useDeferredValue(document);
  const layout = useMemo(() => paginateDocument(deferred, { includeNotes: true }), [deferred]);
  const { byBlock, projection } = useMemo(() => projectPages(layout.pages), [layout]);
  const blocks = useMemo(() => new Map(document.blocks.map(block => [block.id, block])), [document.blocks]);
  const scenes = useMemo(() => sceneList(deferred), [deferred]);
  const [activeId, setActiveId] = useState('');
  const [drawer, setDrawer] = useState<'scenes' | 'notes' | null>(null);
  const [focused, setFocused] = useState(false);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 560px)').matches);
  const [compactPage, setCompactPage] = useState(0);
  const [visible, setVisible] = useState({ first: 0, last: 2, current: 0 });
  const [step, setStep] = useState(1080);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [caption, setCaption] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const paperWidth = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const caret = useRef<Caret | null>(null);
  const pending = useRef<Caret | null>(null);
  const revealPending = useRef(false);
  const currentDocument = useRef(document);
  const history = useRef<{ prior: HistoryEntry[]; next: HistoryEntry[]; input: { id: string; at: number } | null }>({
    prior: [], next: [], input: null
  });
  const scrolled = useRef(false);
  const active = blocks.get(activeId) ?? document.blocks[0];
  const heading = document.kind === 'stageplay' ? 'Stageplay editor' : 'Manuscript editor';
  const activePage = byBlock.get(active?.id ?? '');
  const print = useScriptPrint(document);
  const pageCount = layout.pages.filter(page => !page.titlePage).length;
  const pageIndex = Math.min(compact ? compactPage : visible.current, layout.pages.length - 1);
  const page = layout.pages[pageIndex];

  useEffect(() => {
    const breakpoint = window.matchMedia('(max-width: 560px)');
    function change(event: MediaQueryListEvent) { setCompact(event.matches); }
    breakpoint.addEventListener('change', change);
    return () => breakpoint.removeEventListener('change', change);
  }, []);

  useLayoutEffect(() => {
    currentDocument.current = document;
  }, [document]);

  useEffect(() => {
    if (!scroller.current || !paperWidth.current) return;
    const observer = new ResizeObserver(() => {
      const width = paperWidth.current?.clientWidth;
      if (width) setStep(width * layout.geometry.height / layout.geometry.width + PAPER_GAP);
    });
    observer.observe(paperWidth.current);
    return () => observer.disconnect();
  }, [layout.geometry.height, layout.geometry.width]);

  const locate = useCallback(() => {
    const viewport = scroller.current;
    if (!viewport || compact) return;
    const index = Math.max(0, Math.floor((viewport.scrollTop - PAPER_PAD + 120) / step));
    const first = Math.max(0, Math.floor((viewport.scrollTop - PAPER_PAD) / step) - 1);
    const last = Math.ceil((viewport.scrollTop + viewport.clientHeight) / step) + 1;
    setVisible(position => position.first === first && position.last === last && position.current === index ? position : { first, last, current: index });
    scrolled.current = false;
  }, [compact, step]);

  useLayoutEffect(locate, [locate]);

  function notifyScroll() {
    if (compact || scrolled.current) return;
    scrolled.current = true;
    requestAnimationFrame(locate);
  }

  const restoreCaret = useCallback((point: Caret) => {
    const field = findField(scroller.current, point.blockId);
    if (!field) return false;
    field.focus({ preventScroll: true });
    field.setSelectionRange(Math.min(point.start, field.value.length), Math.min(point.end, field.value.length));
    caret.current = readCaret(field);
    return true;
  }, []);

  useLayoutEffect(() => {
    if (!pending.current) return;
    if (!restoreCaret(pending.current)) {
      const nextPage = byBlock.get(pending.current.blockId);
      if (compact && revealPending.current && nextPage !== undefined && nextPage !== pageIndex) setCompactPage(nextPage);
      return;
    }
    if (revealPending.current) findField(scroller.current, pending.current.blockId)?.scrollIntoView({ block: 'nearest' });
    revealPending.current = false;
    pending.current = null;
  }, [projection, activeId, focused, drawer, restoreCaret, visible, byBlock, compact, pageIndex]);

  function refocus(point = caret.current) {
    if (!point) return;
    pending.current = restoreCaret(point) ? null : point;
  }

  const jump = useCallback((blockId: string, edit = false, offset = 0) => {
    if (!scroller.current) return;
    const pageIndex = byBlock.get(blockId);
    if (pageIndex === undefined) return;
    if (compact) {
      setCompactPage(pageIndex);
      scroller.current.scrollTop = 0;
    } else {
      const row = projection[pageIndex].rows.find(entry => entry.first.blockId === blockId);
      const centre = row ? Math.max(0, row.first.y / layout.geometry.height * (step - PAPER_GAP) - 135) : 0;
      scroller.current.scrollTop = Math.max(0, PAPER_PAD + pageIndex * step + centre);
      locate();
    }
    if (edit) {
      setActiveId(blockId);
      const point = { blockId, start: offset, end: offset };
      pending.current = restoreCaret(point) ? null : point;
    }
  }, [byBlock, compact, layout.geometry.height, locate, projection, restoreCaret, step]);

  const lastTarget = useRef<SourceRef | undefined>(undefined);
  useEffect(() => {
    if (!target || target === lastTarget.current || target.documentId !== document.id || target.revisionId !== document.revisionId) return;
    const blockId = target.blockId ?? scenes.find(scene => scene.id === target.sceneId)?.blockId;
    if (!blockId || !byBlock.has(blockId)) return;
    lastTarget.current = target;
    jump(blockId, !readOnly);
  }, [target, document.id, document.revisionId, scenes, byBlock, jump, readOnly]);

  function setFocus(mode: boolean) {
    setFocused(mode);
    onFocusChange?.(mode);
    refocus();
  }

  function toggleDrawer(value: 'scenes' | 'notes') {
    setDrawer(previous => previous === value ? null : value);
    refocus();
  }

  function commit(update: (current: DocumentModel) => DocumentModel, inputId?: string) {
    if (readOnly) return;
    const previous = currentDocument.current;
    const next = update(previous);
    if (next === previous) return;
    const at = performance.now();
    const previousInput = history.current.input;
    if (!inputId || previousInput?.id !== inputId || at - previousInput.at > 650) {
      history.current.prior.push({ document: previous, caret: caret.current });
      if (history.current.prior.length > MAX_HISTORY) history.current.prior.shift();
      setHistoryVersion(value => value + 1);
    }
    history.current.input = inputId ? { id: inputId, at } : null;
    history.current.next = [];
    currentDocument.current = next;
    onDocumentChange(working => working === previous ? next : update(working));
  }

  function useHistory(direction: 'undo' | 'redo') {
    if (readOnly) return;
    const back = direction === 'undo' ? history.current.prior : history.current.next;
    const forward = direction === 'undo' ? history.current.next : history.current.prior;
    const item = back.pop();
    if (!item || item.document.revisionId !== currentDocument.current.revisionId) {
      if (item) resetHistory();
      return;
    }
    forward.push({ document: currentDocument.current, caret: caret.current });
    history.current.input = null;
    currentDocument.current = item.document;
    setHistoryVersion(value => value + 1);
    onDocumentChange(item.document);
    if (item.caret) {
      setActiveId(item.caret.blockId);
      if (byBlock.has(item.caret.blockId)) jump(item.caret.blockId);
      refocus(item.caret);
    }
  }

  function resetHistory() {
    history.current = { prior: [], next: [], input: null };
    setHistoryVersion(value => value + 1);
  }

  function changeKind(kind: BlockKind, point = caret.current) {
    const blockId = point?.blockId ?? active?.id;
    if (!blockId) return;
    commit(current => replaceBlock(current, blockId, block => withElement(block, kind)));
    setCaption(elementNames[kind]);
    refocus(point ?? { blockId, start: 0, end: 0 });
  }

  function editText(id: string, text: string) {
    commit(current => replaceBlock(current, id, block => {
      const value = isUppercaseElement(block.kind) ? text.toUpperCase() : text;
      return block.text === value ? block : { ...block, text: value, revision: current.revisionLabel ?? block.revision };
    }), id);
  }

  function focusElement(point: Caret) {
    caret.current = point;
    pending.current = point;
    revealPending.current = true;
    setActiveId(point.blockId);
  }

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    const modifier = event.metaKey || event.ctrlKey;
    if (event.key === 'Escape' && (focused || drawer)) {
      event.preventDefault();
      if (focused) setFocus(false);
      else toggleDrawer(drawer!);
      return;
    }
    if (modifier && event.shiftKey && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      setFocus(!focused);
      return;
    }
    if (event.key === 'F6') {
      event.preventDefault();
      if (!focused && event.target instanceof HTMLTextAreaElement) toolbar.current?.querySelector<HTMLElement>('button, select')?.focus();
      else refocus(caret.current ?? (active && { blockId: active.id, start: 0, end: 0 }));
      return;
    }
    if (!(event.target instanceof HTMLTextAreaElement) || readOnly || event.nativeEvent.isComposing) return;
    const field = event.target;
    const { blockId } = field.dataset;
    const block = blockId ? blocks.get(blockId) : undefined;
    if (!block) return;
    const point = readCaret(field);
    const index = currentDocument.current.blocks.findIndex(item => item.id === block.id);
    if (index < 0) return;
    if (modifier && ['z', 'y'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      useHistory(event.shiftKey || event.key.toLowerCase() === 'y' ? 'redo' : 'undo');
      return;
    }
    if (event.key === 'Tab' && !modifier && !event.altKey) {
      event.preventDefault();
      changeKind(cycleElement(block.kind, event.shiftKey ? -1 : 1), point);
      return;
    }
    if (event.key === 'Enter' && !modifier && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      if (!block.text.trim() && ['dialogue', 'parenthetical'].includes(block.kind)) {
        changeKind(nextElement(block.kind === 'parenthetical' ? 'parenthetical' : 'dialogue'), point);
        return;
      }
      const { right } = splitBlock(block, point.start, point.end);
      commit(current => {
        const at = current.blocks.findIndex(item => item.id === block.id);
        if (at < 0) return current;
        const original = current.blocks[at];
        return {
          ...current,
          blocks: [
            ...current.blocks.slice(0, at),
            { ...original, text: original.text.slice(0, point.start) },
            right, ...current.blocks.slice(at + 1)
          ]
        };
      });
      focusElement({ blockId: right.id, start: 0, end: 0 });
      return;
    }
    const previous = currentDocument.current.blocks[index - 1];
    const next = currentDocument.current.blocks[index + 1];
    const collapsed = point.start === point.end;
    if (event.key === 'Backspace' && collapsed && point.start === 0 && previous && !modifier && (block.kind === previous.kind || !block.text) && block.kind !== 'scene') {
      event.preventDefault();
      commit(current => {
        const at = current.blocks.findIndex(item => item.id === block.id);
        if (at < 1 || current.blocks[at - 1].id !== previous.id) return current;
        const items = current.blocks.slice();
        const before = items[at - 1];
        items.splice(at - 1, 2, { ...before, text: before.text + items[at].text });
        return { ...current, blocks: items };
      });
      focusElement({ blockId: previous.id, start: previous.text.length, end: previous.text.length });
      return;
    }
    const up = event.key === 'ArrowUp' && collapsed && point.start === 0;
    const down = event.key === 'ArrowDown' && collapsed && point.end === field.value.length;
    const neighbour = up ? previous : down ? next : undefined;
    if (!event.shiftKey && !modifier && neighbour) {
      event.preventDefault();
      const offset = up ? neighbour.text.length : 0;
      if (byBlock.get(neighbour.id) !== byBlock.get(block.id)) jump(neighbour.id, true, offset);
      else {
        setActiveId(neighbour.id);
        refocus({ blockId: neighbour.id, start: offset, end: offset });
      }
    }
  }

  const styles = {
    '--swdr-paper-width': `${layout.geometry.width * 4 / 3}px`,
    '--swdr-paper-ratio': layout.geometry.width / layout.geometry.height,
    '--swdr-script-font': `${layout.geometry.fontSize / layout.geometry.width * 100}cqw`
  } as CSSProperties;

  return (
    <section className={`swdr-writing ${focused ? 'swdr-writing-focus' : ''} ${compact ? 'swdr-writing-compact' : ''}`} style={styles} onKeyDown={handleKeys} aria-label={heading} data-history={historyVersion}>
      {!focused && <div className="swdr-write-toolbar" ref={toolbar}>
        <span className="swdr-w-current" aria-current="page"><FileText size={15} aria-hidden="true" /> Write</span>
        {onOpenOutline && <button type="button" className="swdr-w-quiet" onClick={onOpenOutline}>Outline</button>}
        <label className="swdr-w-element"><span className="swdr-sr">Screenplay element</span>
          <select aria-label="Screenplay element" value={active?.kind ?? 'action'} disabled={readOnly} onChange={event => changeKind(event.target.value as BlockKind)}>
            {BLOCK_KINDS.map(kind => <option key={kind} value={kind}>{elementNames[kind]}</option>)}
          </select><ChevronDown size={13} aria-hidden="true" />
        </label>
        <button type="button" className="swdr-w-quiet swdr-w-history" aria-label="Undo" title="Undo" disabled={readOnly || !history.current.prior.length} onClick={() => useHistory('undo')}><Undo2 size={16} aria-hidden="true" /></button>
        <button type="button" className="swdr-w-quiet swdr-w-history" aria-label="Redo" title="Redo" disabled={readOnly || !history.current.next.length} onClick={() => useHistory('redo')}><Redo2 size={16} aria-hidden="true" /></button>
        <span className="swdr-write-save"><CircleCheck size={14} aria-hidden="true" /> {saveLabel || 'Local draft'}</span>
        <button type="button" className={`swdr-w-quiet ${drawer === 'scenes' ? 'swdr-w-current' : ''}`} onClick={() => toggleDrawer('scenes')} aria-label="Scenes" aria-expanded={drawer === 'scenes'}><List size={16} aria-hidden="true" /><span>Scenes</span></button>
        <button type="button" className={`swdr-w-quiet ${drawer === 'notes' ? 'swdr-w-current' : ''}`} onClick={() => toggleDrawer('notes')} aria-label="Notes" aria-expanded={drawer === 'notes'}><MessageSquareText size={15} aria-hidden="true" /><span>Notes</span></button>
        <button type="button" className="swdr-w-button" aria-keyshortcuts="Control+Shift+F Meta+Shift+F" onClick={() => setFocus(true)}><Expand size={14} aria-hidden="true" /><span>Focus</span></button>
        {toolbarEnd || <button type="button" className="swdr-w-button" onClick={print.requestPrint}><Printer size={14} aria-hidden="true" /> Print</button>}
      </div>}
      <div ref={scroller} className="swdr-manuscript-scroll" onScroll={notifyScroll} aria-label="Manuscript pages">
        <div ref={paperWidth} className="swdr-papers">
          {projection.map(({ page: sheet, rows, fragments }, index) => {
            if (compact && index !== pageIndex) return null;
            const rendered = compact || (index >= visible.first && index <= visible.last) || index === activePage;
            if (!rendered) return <div className="swdr-manuscript-paper swdr-paper-placeholder" key={sheet.label || 'title'} aria-hidden="true" />;
            return <article className="swdr-manuscript-paper" key={sheet.label || 'title'} aria-label={sheet.titlePage ? 'Title page' : `Page ${sheet.label}`} data-page-label={sheet.label}>
              {fragments.filter(line => !compact || !line.decoration || line.decoration === 'continuation').map((line, lineIndex) => <span key={lineIndex} className={`swdr-paper-line ${line.decoration ? 'swdr-paper-decoration' : ''}`} style={lineStyle(line, layout.geometry)} aria-hidden={line.decoration === 'scene-number' || undefined}>{line.text}</span>)}
              {rows.map(row => {
                const block = blocks.get(row.first.blockId);
                if (!block) return null;
                const label = elementNames[block.kind];
                return <textarea key={block.id} data-block-id={block.id} data-element={block.kind}
                  className="swdr-script-block" aria-label={label} placeholder={!block.text && (block.id === active?.id || document.blocks.length === 1) ? label : undefined}
                  value={block.text} readOnly={readOnly} rows={row.lines} spellCheck={!isUppercaseElement(block.kind)}
                  style={{
                    ...lineStyle(row.first, layout.geometry), color: revisionInk(block.revision) || undefined,
                    height: place(row.lines * layout.geometry.lineHeight, layout.geometry.height)
                  }}
                  onChange={event => { caret.current = readCaret(event.currentTarget); editText(block.id, event.currentTarget.value); }}
                  onFocus={event => { caret.current = readCaret(event.currentTarget); setActiveId(block.id); }}
                  onSelect={event => { caret.current = readCaret(event.currentTarget); }}
                />;
              })}
            </article>;
          })}
          {!readOnly && !document.blocks.length && <button type="button" className="swdr-w-button swdr-empty-page" onClick={() => {
            const block = newBlock('scene');
            commit(current => ({ ...current, blocks: [block] }));
            focusElement({ blockId: block.id, start: 0, end: 0 });
          }}>Start screenplay</button>}
        </div>
      </div>
      {!focused && drawer === 'scenes' && <aside className="swdr-w-drawer swdr-w-scenes" aria-label="Scenes">
        <div className="swdr-w-drawer-head"><h2>Scenes</h2><button className="swdr-w-quiet" aria-label="Close scenes" onClick={() => toggleDrawer('scenes')}><X size={17} /></button></div>
        {scenes.length ? <ol>{scenes.map(scene => <li key={scene.id}>
          <button type="button" onClick={() => {
            jump(scene.blockId);
            setCaption(`Scene ${scene.number}`);
            if (window.matchMedia('(max-width: 850px)').matches) setDrawer(null);
            if (!compact) refocus();
          }}><small>{scene.number}</small><span>{scene.heading.toUpperCase() || 'Untitled scene'}</span></button>
        </li>)}</ol> : <p>Add a scene heading to start the scene list.</p>}
      </aside>}
      {!focused && drawer === 'notes' && <WritingContext {...props} active={active} onClose={() => toggleDrawer('notes')} onDocumentChange={commit} onResetHistory={resetHistory} onPrint={print.requestPrint} />}
      <footer className="swdr-write-footer">
        <span className="swdr-w-page-control">
          {compact && <button className="swdr-w-quiet" aria-label="Previous manuscript page" disabled={pageIndex <= 0} onClick={() => {
            setCompactPage(pageIndex - 1);
            if (scroller.current) scroller.current.scrollTop = 0;
          }}>‹</button>}
          {page?.titlePage ? 'Title page' : `Page ${page?.label || '1'} of ${pageCount}`}
          {compact && <button className="swdr-w-quiet" aria-label="Next manuscript page" disabled={pageIndex >= layout.pages.length - 1} onClick={() => {
            setCompactPage(pageIndex + 1);
            if (scroller.current) scroller.current.scrollTop = 0;
          }}>›</button>}
        </span>
        <span className="swdr-sr" role="status">{caption}</span>
        <span>{focused ? <><span>{saveLabel || 'Local draft'}</span><button type="button" className="swdr-w-quiet" onClick={() => setFocus(false)}>Esc to exit focus</button></>
          : <>{readOnly ? 'Read only' : document.revisionLabel || 'Draft'} <span aria-hidden="true">·</span> {document.paper === 'a4' ? 'A4' : 'Letter'}</>}</span>
      </footer>
      {print.output}
    </section>
  );
}

function lineStyle(line: LaidOutLine, geometry: PageGeometry): CSSProperties {
  return {
    left: place(line.x, geometry.width), top: place(line.y - geometry.fontSize, geometry.height),
    width: place(line.width, geometry.width), textAlign: line.align,
    color: revisionInk(line.revision) || undefined
  };
}

export function manuscriptPaperDescription(paper: DocumentModel['paper']): string {
  const geometry = geometryFor(paper);
  return `${(geometry.width / 72).toFixed(2)} × ${(geometry.height / 72).toFixed(2)} in`;
}
