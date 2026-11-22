import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpFromLine, FileText, FolderPlus, Layers, ListOrdered, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BLOCK_KINDS, newId, PROJECT_KINDS, sceneList } from '../model';
import type { Asset, Block, BlockKind, DocumentModel, Project, ProjectKind } from '../model';
import { paginateDocument } from '../writing/layout';
import { timedRows, timingLabel } from '../writing/av-timing';
import { inferSeriesTitle, orderedFolders, parseEpisodeFromFilename } from '../workspace/organize';
import type { BatchImportEntry } from '../workspace/organize';
import { MAX_FILE_BYTES } from './container';
import { fileFormats, pathExtension, readImport } from './intake';
import type { IntakeResult } from './intake';
import { acceptAvRevision, acceptRevision, reviewAvRevision, reviewRevision } from './reconcile';
import { elementLabel } from './screenplay';
import { avFields, tableToAv } from './tabular';
import type { AVField, AVTable } from './tabular';
import { PageHeader } from '../shell/PageHeader';

export interface SeriesBatchPayload {
  destination: 'new' | 'existing';
  targetProjectId?: string;
  projectTitle: string;
  projectKind: ProjectKind;
  folderId?: string;
  newFolderName?: string;
  folderPerSeason?: boolean;
  entries: BatchImportEntry[];
}

export interface SingleImportOptions {
  remaining: number;
  folderId?: string;
  newFolderName?: string;
  episode?: { season: number; number: number };
}

interface Props {
  project?: Project;
  projects?: Project[];
  document?: DocumentModel;
  initialTab?: string;
  onImportDocument: (document: DocumentModel, source: Asset, previous?: DocumentModel, relatedAssets?: Asset[], batch?: SingleImportOptions) => void | Promise<void>;
  onImportBatch?: (payload: SeriesBatchPayload) => void | Promise<void>;
  onRestoreProject: (project: Project, batch?: { remaining: number }) => void | Promise<void>;
  onStatus: (message: string) => void;
  onCancel?: () => void;
}

type Review = Exclude<IntakeResult, { type: 'archive' }>;
type ImportMode = 'screenplay' | 'av';
type IntakeFlow = 'single' | 'series';

interface BatchRow {
  id: string;
  fileName: string;
  status: 'ready' | 'error';
  error?: string;
  document?: DocumentModel;
  source?: Asset;
  relatedAssets?: Asset[];
  sceneCount: number;
  pageCount: number;
  warningCount: number;
  title: string;
  season: number;
  number: number;
  detected: boolean;
}

const KIND_LABELS: Record<ProjectKind, string> = {
  film: 'Film',
  series: 'Television series',
  stage: 'Stage play',
  documentary: 'Documentary series',
  commercial: 'Commercial / AV',
  creator: 'Social & YouTube'
};

function describeFile(file: File): string {
  const format = fileFormats[pathExtension(file.name) as keyof typeof fileFormats];
  return format?.[0] || 'Source file';
}

function countLabel(count: number, unit: string): string {
  return count + ' ' + unit + (count === 1 ? '' : 's');
}

function episodeTag(season: number, number: number): string {
  return `S${Math.max(1, Math.round(season))}E${String(Math.max(1, Math.round(number))).padStart(2, '0')}`;
}

function isEpisodicKind(kind: ProjectKind): boolean {
  return kind === 'series' || kind === 'documentary';
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

function sortBatchRows(rows: BatchRow[]): BatchRow[] {
  const ready = rows
    .filter(row => row.status === 'ready')
    .sort((a, b) => a.season - b.season || a.number - b.number || a.fileName.localeCompare(b.fileName, undefined, { numeric: true }));
  const failed = rows.filter(row => row.status === 'error');
  return [...ready, ...failed];
}

export function ImportView({ project, projects = [], document, initialTab, onImportDocument, onImportBatch, onRestoreProject, onStatus, onCancel }: Props) {
  const chooser = useRef<HTMLInputElement>(null);
  const seriesChooser = useRef<HTMLInputElement>(null);
  const current = useRef<AbortController | undefined>(undefined);

  const [intakeFlow, setIntakeFlow] = useState<IntakeFlow>(initialTab === 'series' ? 'series' : 'single');
  const [mode, setMode] = useState<ImportMode>(document?.kind === 'av' ? 'av' : 'screenplay');

  // Single-file intake state
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
  const [singleFolderChoice, setSingleFolderChoice] = useState('');
  const [singleNewFolder, setSingleNewFolder] = useState('');
  const [singleAsEpisode, setSingleAsEpisode] = useState(false);
  const [singleSeason, setSingleSeason] = useState(1);
  const [singleEpisodeNum, setSingleEpisodeNum] = useState(1);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string>();
  const [checked, setChecked] = useState<string[]>([]);
  const [page, setPage] = useState(0);

  // Series / batch intake state
  const [batchRows, setBatchRows] = useState<BatchRow[]>([]);
  const [batchReading, setBatchReading] = useState<{ done: number; total: number; currentName: string } | null>(null);
  const [batchDestination, setBatchDestination] = useState<'new' | 'existing'>(project ? 'existing' : 'new');
  const [batchTargetProjectId, setBatchTargetProjectId] = useState<string>(project?.id ?? projects[0]?.id ?? '');
  const [batchProjectTitle, setBatchProjectTitle] = useState('');
  const [batchProjectKind, setBatchProjectKind] = useState<ProjectKind>('series');
  const [batchLinkEpisodes, setBatchLinkEpisodes] = useState<boolean>(project ? isEpisodicKind(project.kind) : true);
  const [batchFolderMode, setBatchFolderMode] = useState<string>(project ? (isEpisodicKind(project.kind) ? '__per_season__' : '') : '__per_season__');
  const [batchNewFolderName, setBatchNewFolderName] = useState('');
  const [bulkSeason, setBulkSeason] = useState(1);

  const availableProjects = useMemo(() => {
    const map = new Map<string, Project>();
    if (project && !project.archivedAt) map.set(project.id, project);
    for (const item of projects) {
      if (!item.archivedAt) map.set(item.id, item);
    }
    return [...map.values()];
  }, [project, projects]);

  const targetBatchProject = useMemo(
    () => batchDestination === 'existing' ? availableProjects.find(item => item.id === batchTargetProjectId) : undefined,
    [availableProjects, batchDestination, batchTargetProjectId]
  );
  const targetBatchFolders = useMemo(
    () => targetBatchProject ? orderedFolders(targetBatchProject) : [],
    [targetBatchProject]
  );

  const projectFolders = useMemo(() => project ? orderedFolders(project) : [], [project]);
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

  useEffect(() => {
    if (!files.length && !batchRows.length && !batchReading && initialTab) {
      setIntakeFlow(initialTab === 'series' ? 'series' : 'single');
    }
  }, [initialTab, files.length, batchRows.length, batchReading]);

  function resetReview() {
    setResult(undefined);
    setDraft(undefined);
    setMapped(undefined);
    setWarnings([]);
    setMissing([]);
    setTimingOptional(false);
    setFirstRowData(false);
    setDestination('');
    setSingleFolderChoice('');
    setSingleNewFolder('');
    setSingleAsEpisode(false);
    setOverrides({});
    setSelected(undefined);
    setChecked([]);
    setPage(0);
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
      if (project) {
        const defaultSeason = project.episodes.length ? Math.max(...project.episodes.map(ep => ep.season)) : 1;
        const nextEp = project.episodes.filter(ep => ep.season === defaultSeason).reduce((max, ep) => Math.max(max, ep.number), 0) + 1;
        const parsedName = parseEpisodeFromFilename(next.name, nextEp, defaultSeason);
        setSingleSeason(parsedName.season);
        setSingleEpisodeNum(parsedName.number);
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

  async function loadSeriesFiles(selectedFiles: File[], append = false) {
    const capped = selectedFiles.slice(0, 60);
    if (!capped.length) return;
    if (selectedFiles.length > capped.length) {
      onStatus('The first 60 files were selected. Add any remaining episodes in another batch.');
    }
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    setError('');
    setBatchReading({ done: 0, total: capped.length, currentName: capped[0].name });

    const baseProject = batchDestination === 'existing' ? targetBatchProject : undefined;
    const defaultSeason = baseProject?.episodes.length
      ? Math.max(...baseProject.episodes.map(ep => ep.season))
      : 1;
    const startingEp = append
      ? batchRows.filter(row => row.status === 'ready').length + 1
      : (baseProject?.episodes.filter(ep => ep.season === defaultSeason).reduce((max, ep) => Math.max(max, ep.number), 0) ?? 0) + 1;

    const added: BatchRow[] = [];
    try {
      for (let i = 0; i < capped.length; i += 1) {
        controller.signal.throwIfAborted();
        const item = capped[i];
        setBatchReading({ done: i, total: capped.length, currentName: item.name });
        const parsedName = parseEpisodeFromFilename(item.name, startingEp + i, defaultSeason);
        try {
          const bytes = await readBytes(item, controller.signal);
          const parsed = await readImport(item.name, bytes, mode, controller.signal);
          controller.signal.throwIfAborted();
          if (parsed.type === 'archive') {
            added.push({
              id: newId(),
              fileName: item.name,
              status: 'error',
              error: 'Project archives (.swdr) restore individually under Single script or archive.',
              sceneCount: 0,
              pageCount: 0,
              warningCount: 0,
              title: parsedName.title,
              season: parsedName.season,
              number: parsedName.number,
              detected: parsedName.detected
            });
          } else if (parsed.type === 'script') {
            const doc = parsed.conversion.document;
            const title = parsedName.detected ? parsedName.title : (doc.title || parsedName.title);
            const scenesCount = sceneList(doc).length;
            const pagesCount = paginateDocument(doc).pages.length;
            added.push({
              id: newId(),
              fileName: item.name,
              status: 'ready',
              document: doc,
              source: parsed.source,
              relatedAssets: parsed.relatedAssets,
              sceneCount: scenesCount,
              pageCount: pagesCount,
              warningCount: parsed.conversion.warnings.length,
              title,
              season: parsedName.season,
              number: parsedName.number,
              detected: parsedName.detected
            });
          } else {
            const conversion = tableToAv(parsed.table, parsedName.title || parsed.title);
            const doc = conversion.document;
            added.push({
              id: newId(),
              fileName: item.name,
              status: 'ready',
              document: doc,
              source: parsed.source,
              sceneCount: doc.avRows.length,
              pageCount: 0,
              warningCount: conversion.warnings.length,
              title: parsedName.detected ? parsedName.title : (doc.title || parsedName.title),
              season: parsedName.season,
              number: parsedName.number,
              detected: parsedName.detected
            });
          }
        } catch (cause) {
          if (controller.signal.aborted) throw cause;
          added.push({
            id: newId(),
            fileName: item.name,
            status: 'error',
            error: cause instanceof Error ? cause.message : 'This file could not be read.',
            sceneCount: 0,
            pageCount: 0,
            warningCount: 0,
            title: parsedName.title,
            season: parsedName.season,
            number: parsedName.number,
            detected: parsedName.detected
          });
        }
      }

      const combined = append ? [...batchRows, ...added] : sortBatchRows(added);
      setBatchRows(combined);

      if (!append) {
        if (project) {
          setBatchDestination('existing');
          setBatchTargetProjectId(project.id);
          setBatchLinkEpisodes(isEpisodicKind(project.kind));
          setBatchFolderMode(isEpisodicKind(project.kind) ? '__per_season__' : '');
        } else {
          const inferred = inferSeriesTitle(capped.map(item => item.name));
          setBatchDestination('new');
          setBatchProjectTitle(prev => prev.trim() ? prev : inferred);
          setBatchProjectKind('series');
          setBatchLinkEpisodes(true);
          setBatchFolderMode('__per_season__');
        }
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Could not read the selected scripts.');
      }
    } finally {
      if (current.current === controller) {
        current.current = undefined;
        setBatchReading(null);
      }
    }
  }

  function resetSeriesBatch() {
    current.current?.abort();
    current.current = undefined;
    setBatchReading(null);
    setBatchRows([]);
    setError('');
  }

  function moveBatchRow(rowId: string, direction: -1 | 1) {
    setBatchRows(rows => {
      const idx = rows.findIndex(item => item.id === rowId);
      const target = idx + direction;
      if (idx < 0 || target < 0 || target >= rows.length) return rows;
      const next = rows.slice();
      const a = next[idx];
      const b = next[target];
      if (batchLinkEpisodes && a.status === 'ready' && b.status === 'ready' && a.season === b.season) {
        next[idx] = { ...b, number: a.number };
        next[target] = { ...a, number: b.number };
      } else {
        next[idx] = b;
        next[target] = a;
      }
      return next;
    });
  }

  function updateBatchRow(rowId: string, patch: Partial<Pick<BatchRow, 'title' | 'season' | 'number'>>) {
    setBatchRows(rows => rows.map(row => row.id === rowId ? { ...row, ...patch } : row));
  }

  function removeBatchRow(rowId: string) {
    setBatchRows(rows => rows.filter(row => row.id !== rowId));
  }

  function numberBatchSequentially() {
    setBatchRows(rows => {
      const seasonCounters = new Map<number, number>();
      return rows.map(row => {
        if (row.status !== 'ready') return row;
        const nextNum = (seasonCounters.get(row.season) ?? 0) + 1;
        seasonCounters.set(row.season, nextNum);
        return { ...row, number: nextNum };
      });
    });
  }

  function applyBulkSeason(season: number) {
    const safe = Math.max(1, Math.round(season));
    setBatchRows(rows => rows.map(row => row.status === 'ready' ? { ...row, season: safe } : row));
  }

  async function saveBatch() {
    if (!onImportBatch || committing) return;
    const readyRows = batchRows.filter(row => row.status === 'ready' && row.document && row.source);
    if (!readyRows.length) return;
    if (batchDestination === 'new' && !batchProjectTitle.trim()) {
      setError('Enter a series or project title before importing.');
      return;
    }
    if (batchDestination === 'existing' && !batchTargetProjectId) {
      setError('Choose a destination project before importing.');
      return;
    }
    setCommitting(true);
    setError('');
    try {
      const entries: BatchImportEntry[] = readyRows.map(row => ({
        document: row.document!,
        source: row.source!,
        relatedAssets: row.relatedAssets,
        title: row.title.trim() || row.document!.title,
        asEpisode: batchLinkEpisodes,
        season: Math.max(1, Math.round(row.season)),
        number: Math.max(1, Math.round(row.number))
      }));
      await onImportBatch({
        destination: batchDestination,
        targetProjectId: batchDestination === 'existing' ? batchTargetProjectId : undefined,
        projectTitle: batchProjectTitle.trim() || 'Untitled Series',
        projectKind: batchProjectKind,
        folderPerSeason: batchFolderMode === '__per_season__' && batchLinkEpisodes,
        folderId: batchFolderMode && !batchFolderMode.startsWith('__') ? batchFolderMode : undefined,
        newFolderName: batchFolderMode === '__new__' ? (batchNewFolderName.trim() || undefined) : undefined,
        entries
      });
      resetSeriesBatch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The batch could not be imported.');
    } finally {
      setCommitting(false);
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
      const singleOpts: SingleImportOptions = {
        remaining,
        ...(!previous && project ? {
          folderId: singleFolderChoice && singleFolderChoice !== '__new__' ? singleFolderChoice : undefined,
          newFolderName: singleFolderChoice === '__new__' ? (singleNewFolder.trim() || undefined) : undefined,
          episode: singleAsEpisode ? { season: Math.max(1, Math.round(singleSeason)), number: Math.max(1, Math.round(singleEpisodeNum)) } : undefined
        } : {})
      };
      await onImportDocument(outgoing, result.source, previous, result.type === 'script' ? result.relatedAssets : undefined, singleOpts);
      goNext();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The draft could not be saved.');
    } finally {
      setCommitting(false);
    }
  }

  const block = draft?.blocks.find(item => item.id === selected);
  const visibleBlockIds = new Set(layout[checkedPage]?.lines.filter(line => line.blockId && !line.decoration).map(line => line.blockId));
  const blocked = unresolved.length > 0 || needsMapping || Boolean(revision?.matches.some(match => match.outcome === 'unmatched') || avRevision?.matches.some(match => match.outcome === 'unmatched'));
  const importedCharacters = new Set(unresolved.map(line => line.blockId));

  const readyBatchRows = batchRows.filter(row => row.status === 'ready');
  const failedBatchRows = batchRows.filter(row => row.status === 'error');
  const inBatchStage = intakeFlow === 'series' && (batchRows.length > 0 || Boolean(batchReading));
  const showModeSwitch = !file && !inBatchStage && Boolean(onImportBatch);

  const pageTitle = intakeFlow === 'series'
    ? (batchRows.length ? 'Organise series upload' : 'Upload series or batch')
    : (result?.type === 'archive' ? 'Restore project archive' : draft ? 'Review script import' : 'Import script');

  const pageSubtitle = intakeFlow === 'series'
    ? (batchRows.length
      ? `${countLabel(readyBatchRows.length, batchLinkEpisodes ? 'episode' : 'script')} ready to import${failedBatchRows.length ? ` · ${countLabel(failedBatchRows.length, 'file')} skipped` : ''}`
      : 'Upload multiple episode scripts at once. SWDR detects seasons & episode numbers, sorts them in order, and organises them into folders.')
    : (file ? file.name + (files.length > 1 ? ' · ' + (index + 1) + ' of ' + files.length : '') : 'Add a draft, AV table or SWDR archive.');

  return <div className="swdr-page interchange-page" id="main-content">
    <PageHeader className="interchange-heading" title={pageTitle} subtitle={pageSubtitle}
      actions={intakeFlow === 'single' && result ? <ol className="import-steps" aria-label="Import steps">
        <li>Source selected</li><li aria-current="step">Review</li><li>{result.type === 'archive' ? 'Restore' : 'Save draft'}</li>
      </ol> : intakeFlow === 'series' && batchRows.length > 0 ? <ol className="import-steps" aria-label="Series upload steps">
        <li>Files parsed</li><li aria-current="step">Organise &amp; order</li><li>Import series</li>
      </ol> : undefined} />

    <input ref={chooser} className="interchange-file-input" type="file" multiple aria-label="Choose script files" onChange={event => {
      openBatch(Array.from(event.currentTarget.files ?? []));
      event.currentTarget.value = '';
    }} />
    <input ref={seriesChooser} className="interchange-file-input" type="file" multiple aria-label="Choose series scripts" onChange={event => {
      const picked = Array.from(event.currentTarget.files ?? []);
      event.currentTarget.value = '';
      if (picked.length) void loadSeriesFiles(picked, batchRows.length > 0);
    }} />

    {showModeSwitch && <div className="import-mode-switch" role="tablist" aria-label="Import workflow">
      <button type="button" role="tab" aria-selected={intakeFlow === 'single'}
        className={intakeFlow === 'single' ? 'is-active' : ''}
        onClick={() => { setIntakeFlow('single'); setError(''); }}>
        <FileText size={15} aria-hidden="true" /> Single script or archive
      </button>
      <button type="button" role="tab" aria-selected={intakeFlow === 'series'}
        className={intakeFlow === 'series' ? 'is-active' : ''}
        onClick={() => { setIntakeFlow('series'); setError(''); }}>
        <Layers size={15} aria-hidden="true" /> Upload series / batch scripts
      </button>
    </div>}

    {intakeFlow === 'single' && !file && <section className="import-pick">
      <div className="import-pick-icon"><ArrowUpFromLine size={24}/></div>
      <h2>Choose source files</h2>
      <p>Screenplay, stageplay, two-column AV or a complete project archive.</p>
      <label>Read Word files as <select aria-label="Read Word files as" value={mode} onChange={event => recast(event.target.value as ImportMode)}>
        <option value="screenplay">Script paragraphs</option><option value="av">AV table</option>
      </select></label>
      <div className="actions"><button type="button" className="primary" onClick={() => chooser.current?.click()}>Choose files</button></div>
      <details><summary>File formats and conversion</summary>
        <p>Choose Final Draft (.fdx), Celtx (.celtx), Fade In (.fadein, .osf), Highland, WriterDuet backup (.wdz), OpenDraft (.odraft), Fountain, Word (.docx), RTF, TXT, text-layer PDF, CSV, XLSX, YAML or SWDR. Arc Studio and StudioBinder scripts import through their FDX or PDF export. For a Google Docs or other cloud link, download an editable file first.</p>
        <p>For legacy Word, Pages or older Final Draft, export DOCX or FDX in the original application. For image-only PDF, use an OCR tool and review the recognised text before importing.</p>
      </details>
    </section>}

    {intakeFlow === 'series' && !batchRows.length && !batchReading && <section className="import-pick import-pick-series">
      <div className="import-pick-icon"><Layers size={24}/></div>
      <h2>Choose episode scripts</h2>
      <p>Select all episodes of a season or an entire multi-season series at once. Filenames like <code>S01E01 - Pilot.fdx</code>, <code>1x02.fountain</code>, or <code>Season 2 Episode 3.pdf</code> are detected and sorted automatically.</p>
      <label>Read Word files as <select aria-label="Read Word files as" value={mode} onChange={event => setMode(event.target.value as ImportMode)}>
        <option value="screenplay">Script paragraphs</option><option value="av">AV table</option>
      </select></label>
      <div className="actions">
        <button type="button" className="primary" onClick={() => seriesChooser.current?.click()}>Choose episode scripts</button>
      </div>
      <details><summary>Supported formats &amp; automatic episode numbering</summary>
        <p>Works with Final Draft (.fdx), Fountain, Fade In (.fadein, .osf), Celtx (.celtx), WriterDuet (.wdz), OpenDraft (.odraft), Word (.docx), RTF, TXT, text-layer PDF, and AV tables (CSV/XLSX).</p>
        <p>You can edit every season number, episode number, script title, folder, and display order before importing.</p>
      </details>
    </section>}

    {intakeFlow === 'series' && batchReading && <section className="import-pick" aria-live="polite">
      <Layers size={22}/>
      <h2>Reading episode scripts ({batchReading.done + 1} of {batchReading.total})</h2>
      <p>{batchReading.currentName}</p>
      <button type="button" onClick={resetSeriesBatch}>Cancel upload</button>
    </section>}

    {intakeFlow === 'single' && pending && <section className="import-pick" aria-live="polite">
      <FileText size={22}/><h2>Reading source</h2><p>{file?.name}</p>
      <button type="button" onClick={resetBatch}>Cancel import</button>
    </section>}

    {error && <section className="import-alert" role="alert">
      <div><strong>{result || batchRows.length ? 'Action needed' : 'This file needs attention'}</strong><p>{error}</p></div>
      {intakeFlow === 'single' && file && !result && <div className="actions">
        {pathExtension(file.name) === 'docx' && <button type="button" onClick={() => recast(mode === 'av' ? 'screenplay' : 'av')}>Read as {mode === 'av' ? 'script' : 'AV table'}</button>}
        <button type="button" onClick={() => void load(file, mode)}><RotateCcw size={14}/> Retry</button>
        {index + 1 < files.length && <button type="button" onClick={goNext}>Skip file</button>}
      </div>}
    </section>}

    {intakeFlow === 'series' && batchRows.length > 0 && !batchReading && <>
      <section className="import-mapping batch-destination-card" aria-labelledby="batch-destination-heading">
        <h2 id="batch-destination-heading">Destination &amp; organisation</h2>
        <div className="import-field-grid">
          <label>Save scripts into
            <select aria-label="Save scripts into" value={batchDestination} onChange={event => {
              const nextDest = event.target.value as 'new' | 'existing';
              setBatchDestination(nextDest);
              if (nextDest === 'existing') {
                const chosen = availableProjects.find(item => item.id === batchTargetProjectId) ?? availableProjects[0];
                if (chosen) {
                  setBatchTargetProjectId(chosen.id);
                  setBatchLinkEpisodes(isEpisodicKind(chosen.kind));
                  setBatchFolderMode(isEpisodicKind(chosen.kind) ? '__per_season__' : '');
                }
              } else {
                setBatchLinkEpisodes(isEpisodicKind(batchProjectKind));
                setBatchFolderMode(isEpisodicKind(batchProjectKind) ? '__per_season__' : '');
              }
            }}>
              <option value="new">Create a new series / project</option>
              {availableProjects.length > 0 && <option value="existing">Add to an existing project</option>}
            </select>
          </label>

          {batchDestination === 'new' ? <>
            <label>Series or project title
              <input aria-label="Series or project title" type="text" value={batchProjectTitle}
                onChange={event => setBatchProjectTitle(event.target.value)} placeholder="e.g. The North Shore" />
            </label>
            <label>Project type
              <select aria-label="Project type" value={batchProjectKind} onChange={event => {
                const nextKind = event.target.value as ProjectKind;
                setBatchProjectKind(nextKind);
                const episodic = isEpisodicKind(nextKind);
                setBatchLinkEpisodes(episodic);
                setBatchFolderMode(episodic ? '__per_season__' : '');
              }}>
                {PROJECT_KINDS.map(kind => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}
              </select>
            </label>
          </> : <label>Existing project
            <select aria-label="Existing project" value={batchTargetProjectId} onChange={event => {
              const nextId = event.target.value;
              setBatchTargetProjectId(nextId);
              const chosen = availableProjects.find(item => item.id === nextId);
              if (chosen) {
                const episodic = isEpisodicKind(chosen.kind);
                setBatchLinkEpisodes(episodic);
                setBatchFolderMode(episodic ? '__per_season__' : '');
              }
            }}>
              {availableProjects.map(item => <option key={item.id} value={item.id}>{item.title} ({KIND_LABELS[item.kind]})</option>)}
            </select>
          </label>}

          <label>Folder organisation
            <select aria-label="Folder organisation" value={batchFolderMode} onChange={event => setBatchFolderMode(event.target.value)}>
              {batchLinkEpisodes && <option value="__per_season__">One folder per season</option>}
              <option value="__new__">Put all in a new folder…</option>
              {targetBatchFolders.map(folder => <option key={folder.id} value={folder.id}>Folder: {folder.name}</option>)}
              <option value="">No folder (unfiled)</option>
            </select>
          </label>

          {batchFolderMode === '__new__' && <label>New folder name
            <input aria-label="New folder name" type="text" value={batchNewFolderName}
              onChange={event => setBatchNewFolderName(event.target.value)} placeholder="e.g. Season 1, Drafts, Mini-series" />
          </label>}
        </div>

        <label className="import-checkbox">
          <input type="checkbox" checked={batchLinkEpisodes} onChange={event => {
            const checkedVal = event.currentTarget.checked;
            setBatchLinkEpisodes(checkedVal);
            if (!checkedVal && batchFolderMode === '__per_season__') setBatchFolderMode('');
          }} />
          Link uploaded scripts as numbered Season &amp; Episode entries (enables Episode Switcher &amp; Series Intelligence)
        </label>
      </section>

      <section className="import-mapping batch-queue-card" aria-labelledby="batch-queue-heading">
        <div className="batch-queue-header">
          <div>
            <h2 id="batch-queue-heading">Scripts in order ({readyBatchRows.length} ready{failedBatchRows.length ? `, ${failedBatchRows.length} failed` : ''})</h2>
            <p>Adjust season, episode number, title, or reorder with the arrows before importing.</p>
          </div>
          <div className="batch-queue-tools">
            <button type="button" onClick={() => seriesChooser.current?.click()}><Plus size={14} aria-hidden="true" /> Add more files</button>
            {batchLinkEpisodes && <>
              <button type="button" onClick={() => setBatchRows(rows => sortBatchRows(rows))}><ListOrdered size={14} aria-hidden="true" /> Sort by S×E</button>
              <button type="button" onClick={numberBatchSequentially}>Number 1..N</button>
              <span className="batch-season-setter">
                <label className="sr-only" htmlFor="bulk-season-input">Season for all</label>
                <input id="bulk-season-input" type="number" min={1} max={30} value={bulkSeason}
                  onChange={event => setBulkSeason(Math.max(1, event.target.valueAsNumber || 1))} aria-label="Set all to season" />
                <button type="button" onClick={() => applyBulkSeason(bulkSeason)}>Set all S{bulkSeason}</button>
              </span>
            </>}
          </div>
        </div>

        <div className="table-frame batch-queue-table-wrap">
          <table className="batch-queue-table">
            <thead>
              <tr>
                <th>Order</th>
                {batchLinkEpisodes && <th>Season</th>}
                {batchLinkEpisodes && <th>Ep #</th>}
                <th>Script title &amp; source file</th>
                <th>Summary</th>
                <th><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {batchRows.map((row, idx) => <tr key={row.id} className={row.status === 'error' ? 'is-error' : ''}>
                <td className="batch-order-cell">
                  <span className="batch-order-inner">
                    <button type="button" className="icon-btn" aria-label={`Move ${row.title} up`}
                      disabled={idx === 0} onClick={() => moveBatchRow(row.id, -1)}>
                      <ArrowUp size={14} aria-hidden="true" />
                    </button>
                    <button type="button" className="icon-btn" aria-label={`Move ${row.title} down`}
                      disabled={idx === batchRows.length - 1} onClick={() => moveBatchRow(row.id, 1)}>
                      <ArrowDown size={14} aria-hidden="true" />
                    </button>
                    <span className="batch-order-index">{batchLinkEpisodes && row.status === 'ready' ? episodeTag(row.season, row.number) : idx + 1}</span>
                  </span>
                </td>
                {batchLinkEpisodes && <td className="batch-num-cell">
                  {row.status === 'ready' ? <input type="number" min={1} max={30} value={row.season}
                    aria-label={`Season for ${row.fileName}`}
                    onChange={event => updateBatchRow(row.id, { season: Math.max(1, event.target.valueAsNumber || 1) })} /> : '—'}
                </td>}
                {batchLinkEpisodes && <td className="batch-num-cell">
                  {row.status === 'ready' ? <input type="number" min={1} max={200} value={row.number}
                    aria-label={`Episode number for ${row.fileName}`}
                    onChange={event => updateBatchRow(row.id, { number: Math.max(1, event.target.valueAsNumber || 1) })} /> : '—'}
                </td>}
                <td className="batch-title-cell">
                  {row.status === 'ready' ? <input type="text" value={row.title}
                    aria-label={`Title for ${row.fileName}`}
                    onChange={event => updateBatchRow(row.id, { title: event.target.value })} />
                    : <strong>{row.fileName}</strong>}
                  <div className="batch-file-meta">{row.status === 'ready' ? row.fileName : row.error}</div>
                </td>
                <td className="batch-summary-cell">
                  {row.status === 'ready'
                    ? (row.document?.kind === 'av'
                      ? countLabel(row.sceneCount, 'AV row')
                      : `${countLabel(row.sceneCount, 'scene')} · ${countLabel(row.pageCount, 'page')}`)
                    : 'Skipped'}
                </td>
                <td className="batch-remove-cell">
                  <button type="button" className="icon-btn" aria-label={`Remove ${row.fileName}`} onClick={() => removeBatchRow(row.id)}>
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </section>
    </>}

    {intakeFlow === 'single' && result?.type === 'archive' && <section className="import-archive-summary">
      <h2>{result.project.title}</h2>
      <dl><div><dt>Documents</dt><dd>{result.project.documents.length}</dd></div>
        <div><dt>Named versions</dt><dd>{result.project.snapshots.length}</dd></div>
        <div><dt>Assets</dt><dd>{result.project.assets.length}</dd></div></dl>
    </section>}

    {intakeFlow === 'single' && review && draft && file && <>
      <div className="import-panels">
        <section className="import-panel">
          <header><div><h2>Original document</h2><p>{describeFile(file)}{review.type === 'script' && review.conversion.sourcePages ? ' · ' + countLabel(review.conversion.sourcePages, 'page') : ''}</p></div>
          </header>
          {review.type === 'script' ? <pre className="source-text">{review.conversion.original}</pre> :
            <div className="import-preview-scroll"><table className="import-av-table"><thead><tr>{review.table.headers.map((heading, at) => <th key={at}>{heading}</th>)}</tr></thead>
              <tbody>{review.table.records.slice(0, 100).map((row, at) => <tr key={at}>{review.table.headers.map((_, column) => <td key={column}>{row[column] || '—'}</td>)}</tr>)}</tbody>
            </table>{review.table.records.length > 100 && <p>First 100 source rows shown.</p>}</div>}
          <footer>The original file will be kept with the project.</footer>
        </section>
        <section className="import-panel">
          <header><div><h2>{isAv ? 'AV preview' : 'Screenplay preview'}</h2><p>{isAv ? countLabel(draft.avRows.length, 'row') + ' · ' + timingLabel(timed?.durationSeconds ?? 0) : countLabel(scenes.length, 'scene') + ' · ' + countLabel(layout.length, 'page') + ' · ' + (draft.paper === 'a4' ? 'A4' : 'Letter')}</p></div>
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

      {!isAv && <details className="import-mapping import-layout-options"><summary>Manuscript layout</summary>
        <div className="import-field-grid">
          <label>Writing format<select aria-label="Writing format" value={draft.kind} onChange={event => {
            const kind = event.target.value as 'screenplay' | 'stageplay';
            setDraft(current => current && { ...current, kind });
          }}><option value="screenplay">Screenplay</option><option value="stageplay">Stageplay</option></select></label>
          <label>Paper<select aria-label="Paper" value={draft.paper} onChange={event => {
            const paper = event.target.value as DocumentModel['paper'];
            setDraft(current => current && { ...current, paper });
          }}><option value="letter">Letter</option><option value="a4">A4</option></select></label>
        </div>
      </details>}

      {(revisionOptions.length > 0 || project) && <section className="import-mapping"><h2>Save to project</h2>
        <div className="import-field-grid">
          {revisionOptions.length > 0 && <label>Draft destination <select aria-label="Draft destination" value={destination} onChange={event => { setDestination(event.target.value); setOverrides({}); }}>
            <option value="">Create new document</option>
            {revisionOptions.map(item => <option key={item.id} value={item.id}>Reimport {item.title}</option>)}
          </select></label>}
          {!previous && project && <label>Folder <select aria-label="Import folder" value={singleFolderChoice} onChange={event => setSingleFolderChoice(event.target.value)}>
            <option value="">No folder (unfiled)</option>
            {projectFolders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            <option value="__new__">Create new folder…</option>
          </select></label>}
          {!previous && project && singleFolderChoice === '__new__' && <label>New folder name
            <input type="text" aria-label="New folder name" value={singleNewFolder} onChange={event => setSingleNewFolder(event.target.value)} placeholder="e.g. Season 1" />
          </label>}
        </div>
        {!previous && project && isEpisodicKind(project.kind) && <>
          <label className="import-checkbox">
            <input type="checkbox" checked={singleAsEpisode} onChange={event => setSingleAsEpisode(event.currentTarget.checked)} />
            Link as an episode in {project.title}
          </label>
          {singleAsEpisode && <div className="import-field-grid">
            <label>Season <input type="number" min={1} max={30} value={singleSeason} onChange={event => setSingleSeason(Math.max(1, event.target.valueAsNumber || 1))} /></label>
            <label>Episode # <input type="number" min={1} max={200} value={singleEpisodeNum} onChange={event => setSingleEpisodeNum(Math.max(1, event.target.valueAsNumber || 1))} /></label>
          </div>}
        </>}
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
      {intakeFlow === 'single' && file
        ? <button type="button" onClick={resetBatch} disabled={committing}><ArrowLeft size={15}/> Back to source</button>
        : intakeFlow === 'series' && batchRows.length > 0
          ? <button type="button" onClick={resetSeriesBatch} disabled={committing}><ArrowLeft size={15}/> Back to source</button>
          : <span/>}
      <div className="actions">
        {intakeFlow === 'single' && file && !pending && index + 1 < files.length && result && <button type="button" onClick={goNext} disabled={committing}>Skip file</button>}
        <button type="button" className="quiet" disabled={committing} onClick={() => { resetBatch(); resetSeriesBatch(); onCancel?.(); }}>Cancel</button>
        {intakeFlow === 'single' && result && <button className="primary" type="button" disabled={blocked || committing} onClick={() => void save()}>
          {committing ? 'Saving…' : result.type === 'archive' ? 'Restore project' : 'Import draft'}
        </button>}
        {intakeFlow === 'series' && batchRows.length > 0 && !batchReading && <button className="primary" type="button"
          disabled={!readyBatchRows.length || committing || (batchDestination === 'new' && !batchProjectTitle.trim())}
          onClick={() => void saveBatch()}>
          <FolderPlus size={15} aria-hidden="true" /> {committing ? 'Importing…' : `Import ${countLabel(readyBatchRows.length, batchLinkEpisodes ? 'episode' : 'script')}`}
        </button>}
      </div>
    </footer>

    {!file && !inBatchStage && project && <section className="import-files" aria-labelledby="project-files-heading">
      <div className="section-heading"><h2 id="project-files-heading">Files in {project.title}</h2></div>
      {project.assets.length ? <div className="table-frame"><table className="import-files-table">
        <thead><tr><th>File</th><th>Type</th><th>Added</th><th><span className="sr-only">Download</span></th></tr></thead>
        <tbody>{project.assets.slice().sort((a, b) => b.addedAt.localeCompare(a.addedAt)).map(asset => <tr key={asset.id}>
          <td><span className="project-cell"><span className="document-icon" aria-hidden="true"><FileText size={16} /></span><strong>{asset.name}</strong></span></td>
          <td className="row-meta">{asset.mime || 'File'}</td>
          <td className="row-meta">{asset.addedAt.slice(0, 10)}</td>
          <td className="row-actions"><a href={asset.dataUrl} download={asset.name}>Download</a></td>
        </tr>)}</tbody>
      </table></div> : <p className="empty-block">Imported drafts, storyboard frames and source documents appear here.</p>}
    </section>}
  </div>;
}

function EditLine({ block, close, apply }: { block: Block; close: () => void; apply: (kind: BlockKind, value: string) => void }) {
  const [kind, setKind] = useState(block.kind);
  const [value, setValue] = useState(block.text);
  return <form className="import-mapping" onSubmit={event => { event.preventDefault(); apply(kind, value); }}>
    <h2>Correct element</h2>
    <div className="import-field-grid">
      <label>Element <select aria-label="Element" value={kind} onChange={event => setKind(event.target.value as BlockKind)}>
        {BLOCK_KINDS.map(element => <option key={element} value={element}>{elementLabel[element]}</option>)}
      </select></label>
      <label>Line text <textarea aria-label="Line text" rows={2} value={value} onChange={event => setValue(event.target.value)}/></label>
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
