import { ArrowLeft, ArrowUpFromLine, FileText, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BLOCK_KINDS, newId, sceneList } from '../model';
import type { Asset, Block, BlockKind, DocumentModel, Project } from '../model';
import { paginateDocument } from '../writing/layout';
import { timedRows, timingLabel } from '../writing/av-timing';
import { MAX_FILE_BYTES } from './container';
import { fileFormats, pathExtension, readImport } from './intake';
import type { IntakeResult } from './intake';
import { acceptAvRevision, acceptRevision, reviewAvRevision, reviewRevision } from './reconcile';
import { elementLabel } from './screenplay';
import { avFields, tableToAv } from './tabular';
import type { AVField, AVTable } from './tabular';

interface Props {
  project?: Project;
  document?: DocumentModel;
  onImportDocument: (document: DocumentModel, source: Asset, previous?: DocumentModel, relatedAssets?: Asset[], batch?: { remaining: number }) => void | Promise<void>;
  onRestoreProject: (project: Project, batch?: { remaining: number }) => void | Promise<void>;
  onStatus: (message: string) => void;
  onCancel?: () => void;
}

type Review = Exclude<IntakeResult, { type: 'archive' }>;
type ImportMode = 'screenplay' | 'av';

function describeFile(file: File): string {
  const format = fileFormats[pathExtension(file.name) as keyof typeof fileFormats];
  return format?.[0] || 'Source file';
}

async function readBytes(file: File, signal: AbortSignal): Promise<Uint8Array> {
  if (file.size > MAX_FILE_BYTES) throw new Error('This file exceeds the 24 MB import limit.');
  const reader = file.stream().getReader();
  const bytes = new Uint8Array(file.size);
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  let offset = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      bytes.set(value, offset);
      offset += value.length;
    }
    signal.throwIfAborted();
    return bytes;
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

function patchBlock(block: Block, text: string, kind: BlockKind): Block {
  const next = { ...block, kind, text };
  if (kind === 'scene') next.sceneId ??= newId();
  else {
    delete next.sceneId;
    delete next.sceneNumber;
  }
  if (!['character', 'parenthetical', 'dialogue'].includes(kind)) delete next.dual;
  if (kind !== 'dialogue') delete next.alternate;
  return next;
}

export function ImportView({ project, document, onImportDocument, onRestoreProject, onStatus, onCancel }: Props) {
  const chooser = useRef<HTMLInputElement>(null);
  const current = useRef<AbortController>();
  const [mode, setMode] = useState<ImportMode>(document?.kind === 'av' ? 'av' : 'screenplay');
  const [files, setFiles] = useState<File[]>([]);
  const [index, setIndex] = useState(0);
  const [pending, setPending] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<IntakeResult>();
  const [draft, setDraft] = useState<DocumentModel>();
  const [mapped, setMapped] = useState<AVTable>();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [timingOptional, setTimingOptional] = useState(false);
  const [firstRowData, setFirstRowData] = useState(false);
  const [destination, setDestination] = useState('');
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string>();
  const [checked, setChecked] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [sourceSlice, setSourceSlice] = useState(0);
  const file = files[index];
  const review: Review | undefined = result?.type === 'archive' ? undefined : result;
  const isAv = draft?.kind === 'av';
  const needsMapping = missing.some(field => field !== avFields.duration || !timingOptional);
  const revisionOptions = draft ? (project?.documents ?? [])
    .filter(item => (item.kind === 'av') === isAv).sort((a, b) => Number(b.id === document?.id) - Number(a.id === document?.id)) : [];
  const previous = revisionOptions.find(item => item.id === destination);
  const revision = useMemo(() => draft && previous && !isAv ? reviewRevision(previous, draft, overrides) : undefined, [draft, previous, isAv, overrides]);
  const avRevision = useMemo(() => draft && previous && isAv ? reviewAvRevision(previous, draft, overrides) : undefined, [draft, previous, isAv, overrides]);
  const layout = useMemo(() => draft && !isAv ? paginateDocument(draft).pages : [], [draft, isAv]);
  const checkedPage = Math.min(page, Math.max(0, layout.length - 1));
  const scenes = useMemo(() => draft ? sceneList(draft) : [], [draft]);
  const unresolved = review?.type === 'script' ? review.conversion.uncertain.filter(line => !checked.includes(line.blockId)) : [];
  const timed = useMemo(() => draft && isAv ? timedRows(draft.avRows) : undefined, [draft, isAv]);

  useEffect(() => () => current.current?.abort(), []);

  function resetReview() {
    setResult(undefined);
    setDraft(undefined);
    setMapped(undefined);
    setWarnings([]);
    setMissing([]);
    setTimingOptional(false);
    setFirstRowData(false);
    setDestination('');
    setOverrides({});
    setSelected(undefined);
    setChecked([]);
    setPage(0);
    setSourceSlice(0);
  }

  function openBatch(batch: File[]) {
    const queue = batch.slice(0, 40);
    if (!queue.length) return;
    setFiles(queue);
    setIndex(0);
    if (batch.length > queue.length) onStatus('The first 40 files were selected. Pick the remaining files in another batch.');
    void load(queue[0], mode);
  }

  async function load(next: File, as: ImportMode) {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    resetReview();
    setError('');
    setPending(true);
    try {
      const bytes = await readBytes(next, controller.signal);
      const parsed = await readImport(next.name, bytes, as, controller.signal);
      controller.signal.throwIfAborted();
      setResult(parsed);
      if (parsed.type === 'script') {
        setDraft(parsed.conversion.document);
        setWarnings(parsed.conversion.warnings);
      } else if (parsed.type === 'av') {
        const conversion = tableToAv(parsed.table, parsed.title);
        setMapped(parsed.table);
        setDraft(conversion.document);
        setWarnings(conversion.warnings);
        setMissing(conversion.missing);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'The selected file could not be read.');
    } finally {
      if (current.current === controller) {
        current.current = undefined;
        setPending(false);
      }
    }
  }

  function goNext() {
    const next = files[index + 1];
    if (next) {
      setIndex(index + 1);
      void load(next, mode);
    } else {
      setFiles([]);
      setIndex(0);
      setError('');
      resetReview();
    }
  }

  function resetBatch() {
    current.current?.abort();
    current.current = undefined;
    setPending(false);
    setFiles([]);
    setIndex(0);
    setError('');
    resetReview();
  }

  function recast(next: ImportMode) {
    setMode(next);
    if (file) void load(file, next);
  }

  function remap(field: AVField, column: string) {
    if (!mapped || review?.type !== 'av') return;
    const mapping = { ...mapped.mapping, [field]: column ? Number(column) : undefined };
    setMappedTable({ ...mapped, mapping }, review.title);
  }

  function setMappedTable(table: AVTable, title: string) {
    const conversion = tableToAv(table, title);
    setMapped(table);
    setDraft(conversion.document);
    setWarnings(conversion.warnings);
    setMissing(conversion.missing);
    setOverrides({});
  }

  function editBlock(blockId: string, kind: BlockKind, value: string) {
    setDraft(current => current ? {
      ...current, blocks: current.blocks.map(block => block.id === blockId ? patchBlock(block, value, kind) : block)
    } : undefined);
    setChecked(old => old.includes(blockId) ? old : [...old, blockId]);
  }

  function selectBlock(id: string) {
    setSelected(id);
    const next = layout.findIndex(slice => slice.lines.some(line => line.blockId === id && !line.decoration));
    if (next >= 0) setPage(next);
  }

  async function save() {
    if (!result || committing) return;
    setCommitting(true);
    setError('');
    try {
      if (result.type === 'archive') {
        await onRestoreProject(result.project, { remaining: files.length - index - 1 });
        if (files.length > index + 1) goNext();
        else resetBatch();
        return;
      }
      if (!draft || unresolved.length || needsMapping) return;
      const outgoing = previous && revision ? acceptRevision(previous, draft, revision)
        : previous && avRevision ? acceptAvRevision(previous, draft, avRevision) : draft;
      const remaining = files.length - index - 1;
      await onImportDocument(outgoing, result.source, previous, result.type === 'script' ? result.relatedAssets : undefined, { remaining });
      goNext();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The draft could not be saved.');
    } finally {
      setCommitting(false);
    }
  }

  const block = draft?.blocks.find(item => item.id === selected);
  const visibleBlockIds = new Set(layout[checkedPage]?.lines.filter(line => line.blockId && !line.decoration).map(line => line.blockId));
  const sourceLines = useMemo(() => review?.type === 'script' ? review.conversion.original.split('\n') : [], [review]);
  const sourceSliceCount = Math.ceil(sourceLines.length / 100);
  const blocked = unresolved.length > 0 || needsMapping || Boolean(revision?.matches.some(match => match.outcome === 'unmatched') || avRevision?.matches.some(match => match.outcome === 'unmatched'));
  const importedCharacters = new Set(unresolved.map(line => line.blockId));

  return <main className="swdr-page interchange-page" id="main-content">
    <div className="page-heading interchange-heading">
      <div>
        <h1>{result?.type === 'archive' ? 'Restore project archive' : draft ? 'Review script import' : 'Import script'}</h1>
        <p>{file ? file.name + (files.length > 1 ? ' · ' + (index + 1) + ' of ' + files.length : '') : 'Add a draft, AV table or SWDR archive.'}</p>
      </div>
      {result && <ol className="import-steps" aria-label="Import steps"><li>Source selected</li><li aria-current="step">Review</li><li>{result.type === 'archive' ? 'Restore' : 'Save draft'}</li></ol>}
    </div>

    <input ref={chooser} className="interchange-file-input" type="file" multiple aria-label="Choose script files" onChange={event => {
      openBatch(Array.from(event.currentTarget.files ?? []));
      event.currentTarget.value = '';
    }} />

    {!file && <section className="import-pick">
      <div className="import-pick-icon"><ArrowUpFromLine size={24}/></div>
      <h2>Choose source files</h2>
      <p>Screenplay, stageplay, two-column AV or a complete project archive.</p>
      <label>Read Word files as <select aria-label="Read Word files as" value={mode} onChange={event => recast(event.target.value as ImportMode)}>
        <option value="screenplay">Script paragraphs</option><option value="av">AV table</option>
      </select></label>
      <div className="actions"><button type="button" className="primary" onClick={() => chooser.current?.click()}>Choose files</button></div>
      <details><summary>File formats and conversion</summary>
        <p>Choose FDX, Fountain, TXT, DOCX, RTF, supported text-layer PDF, OpenDraft (.odraft), CSV, XLSX, YAML or SWDR. For a Google Docs or other cloud link, download an editable file first.</p>
        <p>For legacy Word, Pages or older Final Draft, export DOCX or FDX in the original application. For image-only PDF, use an OCR tool and review the recognised text before importing.</p>
      </details>
    </section>}

    {pending && <section className="import-pick" aria-live="polite">
      <FileText size={22}/><h2>Reading source</h2><p>{file?.name}</p>
      <button type="button" onClick={resetBatch}>Cancel import</button>
    </section>}

    {error && <section className="import-alert" role="alert">
      <div><strong>{result ? 'Action needed' : 'This file needs attention'}</strong><p>{error}</p></div>
      {file && !result && <div className="actions">
        {pathExtension(file.name) === 'docx' && <button type="button" onClick={() => recast(mode === 'av' ? 'screenplay' : 'av')}>Read as {mode === 'av' ? 'script' : 'AV table'}</button>}
        <button type="button" onClick={() => void load(file, mode)}><RotateCcw size={14}/> Retry</button>
        {index + 1 < files.length && <button type="button" onClick={goNext}>Skip file</button>}
      </div>}
    </section>}

    {result?.type === 'archive' && <section className="import-archive-summary">
      <h2>{result.project.title}</h2>
      <dl><div><dt>Documents</dt><dd>{result.project.documents.length}</dd></div>
        <div><dt>Named versions</dt><dd>{result.project.snapshots.length}</dd></div>
        <div><dt>Assets</dt><dd>{result.project.assets.length}</dd></div></dl>
    </section>}

    {review && draft && file && <>
      <div className="import-panels">
        <section className="import-panel">
          <header><div><h2>Original document</h2><p>{describeFile(file)}{review.type === 'script' && review.conversion.sourcePages ? ' · ' + review.conversion.sourcePages + ' pages' : ''}</p></div>
            {sourceSliceCount > 1 && <select aria-label="Original text range" value={sourceSlice} onChange={event => setSourceSlice(Number(event.target.value))}>
              {Array.from({ length: sourceSliceCount }, (_, part) => <option key={part} value={part}>Lines {part * 100 + 1}–{Math.min(sourceLines.length, (part + 1) * 100)}</option>)}
            </select>}
          </header>
          {review.type === 'script' ? <pre className="source-text">{sourceLines.slice(sourceSlice * 100, (sourceSlice + 1) * 100).join('\n')}</pre> :
            <div className="import-preview-scroll"><table className="import-av-table"><thead><tr>{review.table.headers.map((heading, at) => <th key={at}>{heading}</th>)}</tr></thead>
              <tbody>{review.table.records.slice(0, 100).map((row, at) => <tr key={at}>{review.table.headers.map((_, column) => <td key={column}>{row[column] || '—'}</td>)}</tr>)}</tbody>
            </table>{review.table.records.length > 100 && <p>First 100 source rows shown.</p>}</div>}
          <footer>The original file will be kept with the project.</footer>
        </section>
        <section className="import-panel">
          <header><div><h2>{isAv ? 'AV preview' : 'Screenplay preview'}</h2><p>{isAv ? draft.avRows.length + ' rows · ' + timingLabel(timed?.durationSeconds ?? 0) : scenes.length + ' scenes · ' + layout.length + ' pages · ' + (draft.paper === 'a4' ? 'A4' : 'Letter')}</p></div>
            {!isAv && layout.length > 0 && <select aria-label="Converted page" value={checkedPage} onChange={event => setPage(Number(event.target.value))}>
              {layout.map((item, part) => <option key={part} value={part}>{item.titlePage ? 'Title page' : 'Page ' + item.label}</option>)}
            </select>}
          </header>
          {isAv && timed ? <AvPreview document={draft} setDraft={setDraft} /> :
            <div className="converted-text import-preview-scroll">{draft.blocks.filter(item => visibleBlockIds.has(item.id)).map(item =>
              <button key={item.id} type="button" data-kind={item.kind} className={importedCharacters.has(item.id) ? 'needs-review' : ''}
                onClick={() => selectBlock(item.id)} aria-pressed={selected === item.id} title={elementLabel[item.kind]}>
                {item.text || '(blank ' + elementLabel[item.kind].toLowerCase() + ')'}
              </button>)}
              {!visibleBlockIds.size && draft.titlePage && <div className="import-title-preview"><strong>{draft.titlePage.title}</strong><p>{draft.titlePage.byline}</p><p>{draft.titlePage.author}</p></div>}
            </div>}
          <footer>{previous ? 'New revision of ' + previous.title : 'Create an editable draft'}{!isAv && ' · select a line to correct it'}</footer>
        </section>
      </div>

      {mapped && <section className="import-mapping"><h2>Match AV columns</h2>
        <div className="import-field-grid">{(Object.keys(avFields) as AVField[]).map(field => <label key={field}>{avFields[field]}
          <select value={mapped.mapping[field] ?? ''} onChange={event => remap(field, event.target.value)}>
            <option value="">Choose a column</option>{mapped.headers.map((header, column) => <option key={column} value={column}>{header}</option>)}
          </select></label>)}</div>
        {review.type === 'av' && <label className="import-checkbox"><input type="checkbox" checked={firstRowData} onChange={event => {
          const include = event.currentTarget.checked;
          setFirstRowData(include);
          setMappedTable({ ...mapped, headers: include ? review.table.headers.map((_, index) => 'Column ' + (index + 1)) : review.table.headers,
            records: include ? [review.table.firstRow, ...review.table.records] : review.table.records }, review.title);
        }}/> Include first row as data</label>}
        {missing.length > 0 && <p role="status">Missing columns: {missing.join(', ')}.</p>}
        {missing.includes(avFields.duration) && <label className="import-checkbox">
          <input type="checkbox" checked={timingOptional} onChange={event => setTimingOptional(event.currentTarget.checked)}/>
          Use timings edited in the preview. Unset durations will start at zero.
        </label>}
      </section>}

      {unresolved.length > 0 && <section className="import-alert import-ambiguities">
        <div><strong>Confirm {unresolved.length} {unresolved.length === 1 ? 'possible character cue' : 'possible character cues'}</strong>
          <p>{unresolved[0].reason} “{unresolved[0].source.trim()}”</p></div>
        <div className="actions">
          <button type="button" onClick={() => selectBlock(unresolved[0].blockId)}>Review line</button>
          <button type="button" onClick={() => setChecked(ids => [...ids, ...unresolved.map(line => line.blockId)])}>Keep current types</button>
        </div>
      </section>}

      {block && <EditLine key={block.id} block={block} close={() => setSelected(undefined)} apply={(kind, value) => {
        editBlock(block.id, kind, value);
        setSelected(undefined);
      }} />}

      {warnings.length > 0 && <details className="import-warnings" open><summary>Conversion notes ({warnings.length})</summary>
        <ul>{warnings.map((note, i) => <li key={i}>{note}</li>)}</ul>
      </details>}

      {revisionOptions.length > 0 && <section className="import-mapping"><h2>Save to project</h2>
        <label>Draft destination <select value={destination} onChange={event => { setDestination(event.target.value); setOverrides({}); }}>
          <option value="">Create new document</option>
          {revisionOptions.map(item => <option key={item.id} value={item.id}>Reimport {item.title}</option>)}
        </select></label>
      </section>}

      {revision && previous && <section className="import-mapping">
        <h2>Reconcile scenes</h2>
        <p>Review identity before replacing the current draft. Linked scenes carry forward their scene ID. The prior draft goes into history.</p>
        <ul className="import-scene-matches">{revision.matches.map(match => <li key={match.incoming.id}>
          <div><strong>{match.incoming.number} · {match.incoming.heading}</strong>
            <p>{match.outcome === 'linked' ? [match.moved ? 'Moved' : '', match.edited ? 'Edited' : ''].filter(Boolean).join(' / ') || 'Linked' : match.outcome === 'unmatched' ? 'Unmatched · choose a link' : 'Added'}</p></div>
          <select aria-label={'Match scene ' + match.incoming.number} value={match.previous?.id ?? (match.outcome === 'added' ? 'new' : '')}
            onChange={event => {
              const chosen = event.target.value;
              setOverrides(state => ({ ...state, [match.incoming.id]: chosen === 'new' ? '' : chosen }));
            }}>
            {match.outcome === 'unmatched' && <option value="" disabled>Choose a scene</option>}
            <option value="new">Keep as new scene</option>
            {sceneList(previous).map(old => <option key={old.id} value={old.id}
              disabled={revision.matches.some(other => other.incoming.id !== match.incoming.id && other.previous?.id === old.id)}>{old.number} · {old.heading}</option>)}
          </select>
        </li>)}</ul>
        {revision.omitted.length > 0 && <p>Omitted scenes: {revision.omitted.map(scene => scene.number + ' ' + scene.heading).join(' · ')}</p>}
      </section>}

      {avRevision && previous && <section className="import-mapping">
        <h2>Reconcile AV cues</h2>
        <p>Link revised cues to retain their storyboard references and cue IDs.</p>
        <ul className="import-scene-matches">{avRevision.matches.map(match => <li key={match.incoming.id}>
          <div><strong>{match.index + 1} · {match.incoming.video || match.incoming.audio || 'Untitled cue'}</strong>
            <p>{match.outcome === 'linked' ? [match.moved ? 'Moved' : '', match.edited ? 'Edited' : ''].filter(Boolean).join(' / ') || 'Linked'
              : match.outcome === 'unmatched' ? 'Unmatched · choose a cue' : 'Added'}</p></div>
          <select aria-label={'Match cue ' + (match.index + 1)} value={match.previous?.id ?? (match.outcome === 'added' ? 'new' : '')}
            onChange={event => {
              const chosen = event.target.value;
              setOverrides(state => ({ ...state, [match.incoming.id]: chosen === 'new' ? '' : chosen }));
            }}>
            {match.outcome === 'unmatched' && <option value="" disabled>Choose a cue</option>}
            <option value="new">Keep as new cue</option>
            {previous.avRows.map((row, at) => <option key={row.id} value={row.id}
              disabled={avRevision.matches.some(other => other.index !== match.index && other.previous?.id === row.id)}>
              {at + 1} · {row.video || row.audio || 'Untitled cue'}
            </option>)}
          </select>
        </li>)}</ul>
        {avRevision.omitted.length > 0 && <p>{avRevision.omitted.length} previous {avRevision.omitted.length === 1 ? 'cue will be' : 'cues will be'} omitted from the new revision.</p>}
      </section>}
    </>}

    <footer className="import-footer">
      {file ? <button type="button" onClick={resetBatch} disabled={committing}><ArrowLeft size={15}/> Back to source</button> : <span/>}
      <div className="actions">
        {file && !pending && index + 1 < files.length && result && <button type="button" onClick={goNext} disabled={committing}>Skip file</button>}
        <button type="button" className="quiet" disabled={committing} onClick={() => { resetBatch(); onCancel?.(); }}>Cancel</button>
        {result && <button className="primary" type="button" disabled={blocked || committing} onClick={() => void save()}>
          {committing ? 'Saving…' : result.type === 'archive' ? 'Restore project' : 'Import draft'}
        </button>}
      </div>
    </footer>
  </main>;
}

function EditLine({ block, close, apply }: { block: Block; close: () => void; apply: (kind: BlockKind, value: string) => void }) {
  const [kind, setKind] = useState(block.kind);
  const [value, setValue] = useState(block.text);
  return <form className="import-mapping" onSubmit={event => { event.preventDefault(); apply(kind, value); }}>
    <h2>Correct element</h2>
    <div className="import-field-grid">
      <label>Element <select value={kind} onChange={event => setKind(event.target.value as BlockKind)}>
        {BLOCK_KINDS.map(element => <option key={element} value={element}>{elementLabel[element]}</option>)}
      </select></label>
      <label>Line text <textarea rows={2} value={value} onChange={event => setValue(event.target.value)}/></label>
    </div>
    <div className="actions"><button type="button" onClick={close}>Close</button><button type="submit">Apply correction</button></div>
  </form>;
}

function AvPreview({ document, setDraft }: { document: DocumentModel; setDraft: React.Dispatch<React.SetStateAction<DocumentModel | undefined>> }) {
  const [start, setStart] = useState(0);
  const startIndex = Math.min(start, Math.max(0, document.avRows.length - 1));
  return <div className="import-preview-scroll">
    <table className="import-av-table">
      <thead><tr><th>Video</th><th>Audio</th><th>Duration (s)</th><th>Start cue (s)</th></tr></thead>
      <tbody>{document.avRows.slice(startIndex, startIndex + 30).map((row, offset) => <tr key={row.id}>
        {(['video', 'audio', 'durationSeconds', 'cueSeconds'] as const).map(field => <td key={field}><input
          aria-label={field + ' row ' + (startIndex + offset + 1)} type={field === 'durationSeconds' || field === 'cueSeconds' ? 'number' : 'text'} min="0" step="0.01"
          value={row[field] ?? ''} onChange={event => {
            const value = field === 'durationSeconds' ? Math.max(0, event.target.valueAsNumber || 0)
              : field === 'cueSeconds' ? event.target.value ? Math.max(0, event.target.valueAsNumber || 0) : undefined
                : event.target.value;
            setDraft(current => current ? { ...current, avRows: current.avRows.map(item => item.id === row.id ? { ...item, [field]: value } : item) } : undefined);
          }}/></td>)}
      </tr>)}</tbody>
    </table>
    {document.avRows.length > 30 && <div className="actions av-preview-pages">
      <button type="button" disabled={!startIndex} onClick={() => setStart(Math.max(0, startIndex - 30))}>Previous rows</button>
      <button type="button" disabled={startIndex + 30 >= document.avRows.length} onClick={() => setStart(startIndex + 30)}>Next rows</button>
    </div>}
  </div>;
}
