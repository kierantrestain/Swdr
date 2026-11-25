import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import {
  ArrowDown, ArrowLeft, ArrowUp, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, Clapperboard, Copy, Download, FileVideo,
  Kanban, Lightbulb, MonitorPlay, Pause, Play, Plus, Scissors, Smartphone, Trash2, TriangleAlert, X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { newDocument } from '../model';
import type { WorkspaceViewProps } from '../model';
import {
  BEAT_HINTS, BEAT_LABELS, HOOKS, PLATFORMS, STATUSES, TITLE_FORMULAS, beatSeconds, checks, chapters, clock, creatorModule, cutShort, monthGrid,
  newBeat, newPiece, publishText, runtime, srt, timeline, toAvRows, withCreator, wordCount
} from './model';
import type { Beat, BeatKind, Piece, Platform, Status } from './model';
import { PhonePreview, YouTubePreview } from './Preview';
import { AiPartner } from '../ai/AiPartner';
import type { Playback } from './Preview';
import './creator.css';
import { PageHeader } from '../shell/PageHeader';

const STATUS_LABELS: Record<Status, string> = { idea: 'Idea', scripting: 'Scripting', filming: 'Filming', editing: 'Editing', scheduled: 'Scheduled', published: 'Published' };
const SHORT_PLATFORMS = (Object.keys(PLATFORMS) as Platform[]).filter(key => PLATFORMS[key].form === 'short');
type View = 'board' | 'calendar';
type PieceTab = 'script' | 'packaging' | 'publish' | 'checks';
type Props = Pick<WorkspaceViewProps, 'project' | 'onProjectChange' | 'onStatus' | 'readOnly'>;

function download(filename: string, body: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function PlatformMark({ platform }: { platform: Platform }) {
  return <span className={`creator-platform creator-platform-${platform}`}>{PLATFORMS[platform].form === 'long' ? <MonitorPlay size={13} aria-hidden="true" /> : <Smartphone size={13} aria-hidden="true" />}{PLATFORMS[platform].label}</span>;
}

export function CreatorStudio({ project, onProjectChange, onStatus, readOnly }: Props) {
  const module = creatorModule(project);
  const [openId, setOpenId] = useState('');
  const [view, setView] = useState<View>('board');
  const piece = module.pieces.find(item => item.id === openId);

  const save = (change: (pieces: Piece[]) => Piece[], message?: string) => {
    if (readOnly) return;
    onProjectChange(current => withCreator(current, { pieces: change(creatorModule(current).pieces) }));
    if (message) onStatus(message);
  };
  const create = (platform: Platform) => {
    const next = newPiece(platform, PLATFORMS[platform].form === 'long' ? 'New YouTube video' : 'New short');
    save(pieces => [next, ...pieces], `${PLATFORMS[platform].label} video added.`);
    setOpenId(next.id);
  };

  if (piece) return <PieceEditor key={piece.id} project={project} piece={piece} readOnly={readOnly} onStatus={onStatus} onBack={() => setOpenId('')}
    save={save} open={setOpenId} addDocument={(title, rows) => {
      const document = newDocument(title, 'av');
      document.avRows = rows;
      onProjectChange(current => ({ ...current, documents: [...current.documents, document], updatedAt: new Date().toISOString() }));
      onStatus(`“${title}” added as a two-column AV script.`);
    }} />;

  const shorts = module.pieces.filter(item => PLATFORMS[item.platform].form === 'short').length;
  return <section className="creator" aria-label="Creator studio" id="main-content">
    <PageHeader className="creator-head" title="Creator studio"
      subtitle={module.pieces.length ? `${module.pieces.length - shorts} long-form · ${shorts} short-form · ${module.pieces.filter(item => item.status === 'published').length} published` : 'Plan, script, package and publish short-form and YouTube videos.'}
      actions={<div className="creator-actions">
        <div className="creator-segmented" role="group" aria-label="View">
          <button type="button" aria-pressed={view === 'board'} onClick={() => setView('board')}><Kanban size={15} aria-hidden="true" /> Board</button>
          <button type="button" aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}><CalendarDays size={15} aria-hidden="true" /> Calendar</button>
        </div>
        {!readOnly && <>
          <Button label="New short" variant="secondary" icon={<Smartphone size={15} aria-hidden="true" />} onClick={() => create('shorts')} />
          <Button label="New YouTube video" variant="primary" icon={<MonitorPlay size={15} aria-hidden="true" />} onClick={() => create('youtube')} />
        </>}
      </div>} />
    {!module.pieces.length ? <div className="creator-empty">
      <Clapperboard size={32} aria-hidden="true" />
      <h2>Plan your first video</h2>
      <p>Shorts follow Hook → Cut → Convert. YouTube videos run cold open, intro, chapters and end screen. Preview each one on a phone or in the YouTube feed while you write, then copy a ready-made description, chapters and captions.</p>
    </div> : view === 'board' ? <Board pieces={module.pieces} open={setOpenId} readOnly={readOnly}
      move={(id, status) => save(pieces => pieces.map(item => item.id === id ? { ...item, status } : item), `Moved to ${STATUS_LABELS[status]}.`)} />
      : <Calendar pieces={module.pieces} open={setOpenId} />}
  </section>;
}

function Board({ pieces, open, move, readOnly }: { pieces: Piece[]; open: (id: string) => void; move: (id: string, status: Status) => void; readOnly?: boolean }) {
  const [over, setOver] = useState<Status>();
  const drop = (status: Status) => (event: DragEvent) => {
    event.preventDefault();
    setOver(undefined);
    const id = event.dataTransfer.getData('text/plain');
    if (id && !readOnly) move(id, status);
  };
  return <div className="creator-board" aria-label="Content board">
    {STATUSES.map(status => {
      const list = pieces.filter(item => item.status === status);
      return <section key={status} className={`creator-column${over === status ? ' is-over' : ''}`} aria-label={STATUS_LABELS[status]}
        onDragOver={event => { event.preventDefault(); setOver(status); }} onDragLeave={() => setOver(undefined)} onDrop={drop(status)}>
        <header><span className={`creator-dot creator-dot-${status}`} aria-hidden="true" />{STATUS_LABELS[status]}<small>{list.length}</small></header>
        {list.map(item => <button key={item.id} type="button" className="creator-card" draggable={!readOnly}
          onDragStart={event => event.dataTransfer.setData('text/plain', item.id)} onClick={() => open(item.id)}>
          {PLATFORMS[item.platform].form === 'long'
            ? <span className="creator-card-thumb"><b>{item.thumbnailText || item.title}</b>{runtime(item) > 0 && <i>{clock(runtime(item))}</i>}</span> : null}
          <strong>{item.title || 'Untitled'}</strong>
          <span className="creator-card-meta"><PlatformMark platform={item.platform} />{PLATFORMS[item.platform].form === 'short' && runtime(item) > 0 && <span>{clock(runtime(item))}</span>}</span>
          {item.publishDate && <small><CalendarDays size={12} aria-hidden="true" /> {new Date(`${item.publishDate}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</small>}
        </button>)}
      </section>;
    })}
  </div>;
}

function Calendar({ pieces, open }: { pieces: Piece[]; open: (id: string) => void }) {
  const first = pieces.map(item => item.publishDate).filter(Boolean).sort()[0];
  const [cursor, setCursor] = useState(() => { const date = first ? new Date(`${first}T12:00:00Z`) : new Date(); return { year: date.getUTCFullYear(), month: date.getUTCMonth() }; });
  const weeks = monthGrid(cursor.year, cursor.month);
  const today = new Date().toISOString().slice(0, 10);
  const step = (by: number) => setCursor(({ year, month }) => { const date = new Date(Date.UTC(year, month + by, 1)); return { year: date.getUTCFullYear(), month: date.getUTCMonth() }; });
  const unscheduled = pieces.filter(item => !item.publishDate);
  return <div className="creator-calendar-wrap">
    <section className="creator-calendar" aria-label="Publishing calendar">
      <header>
        <button type="button" aria-label="Previous month" onClick={() => step(-1)}><ChevronLeft size={16} /></button>
        <h2>{new Date(Date.UTC(cursor.year, cursor.month, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h2>
        <button type="button" aria-label="Next month" onClick={() => step(1)}><ChevronRight size={16} /></button>
      </header>
      <div className="creator-calendar-grid">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <span key={day} className="creator-calendar-day">{day}</span>)}
        {weeks.flat().map(date => <div key={date} className={`creator-calendar-cell${Number(date.slice(5, 7)) - 1 !== cursor.month ? ' is-outside' : ''}${date === today ? ' is-today' : ''}`}>
          <small>{Number(date.slice(8))}</small>
          {pieces.filter(item => item.publishDate === date).map(item => <button key={item.id} type="button" className={`creator-event creator-event-${PLATFORMS[item.platform].form}`} onClick={() => open(item.id)}>
            {PLATFORMS[item.platform].form === 'long' ? <MonitorPlay size={12} aria-hidden="true" /> : <Smartphone size={12} aria-hidden="true" />}{item.title || 'Untitled'}</button>)}
        </div>)}
      </div>
    </section>
    {unscheduled.length > 0 && <aside className="creator-unscheduled" aria-label="No publish date">
      <h3>No publish date</h3>
      {unscheduled.map(item => <button key={item.id} type="button" onClick={() => open(item.id)}><strong>{item.title || 'Untitled'}</strong><PlatformMark platform={item.platform} /></button>)}
    </aside>}
  </div>;
}

/** A shared playhead for the preview and the script, advancing in real time while playing. */
function usePlayback(total: number): Playback {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      setTime(value => {
        const next = value + (now - last) / 1000;
        if (next >= total) { setPlaying(false); return total; }
        return next;
      });
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, total]);
  return { time, playing, setTime: value => setTime(Math.max(0, Math.min(total, value))), toggle: () => { if (time >= total) setTime(0); setPlaying(value => !value); } };
}

function PieceEditor({ project, piece, save, open, onBack, onStatus, addDocument, readOnly }: {
  project: Props['project']; piece: Piece; save: (change: (pieces: Piece[]) => Piece[], message?: string) => void; open: (id: string) => void; onBack: () => void;
  onStatus: (message: string) => void; addDocument: (title: string, rows: ReturnType<typeof toAvRows>) => void; readOnly?: boolean;
}) {
  const [tab, setTab] = useState<PieceTab>('script');
  const [prompter, setPrompter] = useState(false);
  const [previewTitle, setPreviewTitle] = useState<string>();
  const total = runtime(piece);
  const playback = usePlayback(total);
  const spec = PLATFORMS[piece.platform];
  const issues = checks(piece);
  const patch = (fields: Partial<Piece>) => save(pieces => pieces.map(item => item.id === piece.id ? { ...item, ...fields } : item));
  const patchBeat = (id: string, fields: Partial<Beat>) => patch({ beats: piece.beats.map(item => item.id === id ? { ...item, ...fields } : item) });

  return <section className="creator" aria-label="Creator studio" id="main-content">
    <header className="creator-head creator-head-editor">
      <div>
        <button type="button" className="creator-back" onClick={onBack}><ArrowLeft size={15} aria-hidden="true" /> All videos</button>
        <h1 className="sr-only">Creator studio</h1>
        <input className="creator-title-input" aria-label="Title" value={piece.title} readOnly={readOnly} placeholder="Untitled video" onChange={event => patch({ title: event.target.value })} />
        <div className="creator-subhead"><PlatformMark platform={piece.platform} /><span>{spec.aspect}</span><span>{clock(total)}</span>
          {spec.titleLimit && <span className={piece.title.length > spec.titleLimit ? 'is-over' : undefined}>{piece.title.length}/{spec.titleLimit} characters</span>}</div>
      </div>
      <div className="creator-actions">
        <AiPartner project={project} onStatus={onStatus} readOnly={readOnly} mode="creator" label="AI hooks & titles"
          extraContext={`Current video (${PLATFORMS[piece.platform].label}, ${clock(total)}): ${piece.title}\n${timeline(piece).map(item => `[${clock(item.start)}] ${item.label}: ${item.spoken}${item.onScreen ? ` | ON SCREEN: ${item.onScreen}` : ''}`).join('\n')}`} />
        <Button label="Teleprompter" variant="secondary" size="sm" icon={<Play size={14} aria-hidden="true" />} onClick={() => setPrompter(true)} />
        {!readOnly && <Button label="Send to AV script" variant="secondary" size="sm" icon={<FileVideo size={14} aria-hidden="true" />} onClick={() => addDocument(piece.title || 'Untitled video', toAvRows(piece))} />}
        {!readOnly && <Button label="Delete" variant="ghost" size="sm" icon={<Trash2 size={14} aria-hidden="true" />} onClick={() => {
          if (!window.confirm(`Delete “${piece.title || 'Untitled'}”?`)) return;
          save(pieces => pieces.filter(item => item.id !== piece.id), 'Video deleted.');
          onBack();
        }} />}
      </div>
    </header>

    <div className="creator-fields">
      <label>Platform
        <select value={piece.platform} disabled={readOnly} onChange={event => { const platform = event.target.value as Platform; patch({ platform, wpm: PLATFORMS[platform].form === 'long' ? 150 : 165, crossPost: (piece.crossPost ?? []).filter(item => item !== platform) }); }}>
          <optgroup label="Short-form">{SHORT_PLATFORMS.map(key => <option key={key} value={key}>{PLATFORMS[key].label}</option>)}</optgroup>
          <optgroup label="Long-form"><option value="youtube">{PLATFORMS.youtube.label}</option></optgroup>
        </select></label>
      <label>Status<select value={piece.status} disabled={readOnly} onChange={event => patch({ status: event.target.value as Status })}>
        {STATUSES.map(status => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label>
      <label>Publish date<input type="date" value={piece.publishDate ?? ''} readOnly={readOnly} onChange={event => patch({ publishDate: event.target.value || undefined })} /></label>
      <label>Pace (words per minute)<input type="number" min={90} max={240} value={piece.wpm} readOnly={readOnly} onChange={event => patch({ wpm: Math.min(240, Math.max(90, Number(event.target.value) || 150)) })} /></label>
    </div>

    <Meter piece={piece} playback={playback} />

    <div className="creator-workspace">
      <div className="creator-main">
        <TabList value={tab} onChange={value => setTab(value as PieceTab)} hasDivider role="tablist">
          <Tab value="script" label="Script" />
          <Tab value="packaging" label="Packaging" />
          <Tab value="publish" label="Publish" />
          <Tab value="checks" label={`Checks (${issues.filter(item => item.level !== 'tip').length})`} />
        </TabList>
        {tab === 'script' && <BeatList piece={piece} patch={patch} patchBeat={patchBeat} readOnly={readOnly} playback={playback} onCut={id => {
          const short = cutShort(piece, id);
          save(pieces => [short, ...pieces], 'Short cut from this chapter — it is on the board under Idea.');
          open(short.id);
        }} />}
        {tab === 'packaging' && <Packaging piece={piece} patch={patch} readOnly={readOnly} onPreview={setPreviewTitle} />}
        {tab === 'publish' && <PublishPanel piece={piece} patch={patch} readOnly={readOnly} onStatus={onStatus} />}
        {tab === 'checks' && <ChecksPanel piece={piece} />}
      </div>
      <aside className="creator-side">
        {spec.form === 'long' ? <YouTubePreview piece={piece} playback={playback} title={previewTitle} /> : <PhonePreview piece={piece} playback={playback} />}
      </aside>
    </div>
    {prompter && <Teleprompter piece={piece} onClose={() => setPrompter(false)} />}
  </section>;
}

function Meter({ piece, playback }: { piece: Piece; playback: Playback }) {
  const spec = PLATFORMS[piece.platform];
  const timed = timeline(piece);
  const total = runtime(piece);
  const scale = Math.max(total, spec.target[1], 1);
  const words = piece.beats.reduce((sum, item) => sum + wordCount(item.spoken), 0);
  const hook = timed[0]?.kind === 'hook' ? timed[0].end : undefined;
  const tone = total > spec.maxSeconds ? 'over' : total >= spec.target[0] && total <= spec.target[1] ? 'good' : 'off';
  const visual = timed.reduce((sum, item) => sum + (item.broll.trim() || item.onScreen.trim() ? item.end - item.start : 0), 0);
  return <section className="creator-meter" aria-label="Runtime">
    <dl>
      <div><dt>Runtime</dt><dd className={`is-${tone}`}>{clock(total)}</dd><small>target {clock(spec.target[0])}–{clock(spec.target[1])}</small></div>
      <div><dt>Hook lands</dt><dd className={hook !== undefined && hook > spec.hookSeconds ? 'is-over' : hook !== undefined ? 'is-good' : undefined}>{hook === undefined ? '—' : `${hook}s`}</dd><small>aim for {spec.hookSeconds}s or less</small></div>
      <div><dt>Visual coverage</dt><dd className={total && visual / total < 0.6 ? 'is-off' : 'is-good'}>{total ? Math.round(visual / total * 100) : 0}%</dd><small>of runtime with B-roll or text</small></div>
      <div><dt>Words</dt><dd>{words}</dd><small>at {piece.wpm} words per minute</small></div>
    </dl>
    <div className="creator-bar" aria-hidden="true">
      {timed.map(item => <button type="button" tabIndex={-1} key={item.id} className={`creator-seg creator-seg-${item.kind}`} style={{ width: `${(item.end - item.start) / scale * 100}%` }}
        title={`${item.label} · ${clock(item.start)}–${clock(item.end)}`} onClick={() => playback.setTime(item.start)} />)}
      <i className="creator-target" style={{ left: `${spec.target[0] / scale * 100}%`, width: `${(spec.target[1] - spec.target[0]) / scale * 100}%` }} />
      <i className="creator-playhead" style={{ left: `${Math.min(playback.time, scale) / scale * 100}%` }} />
    </div>
  </section>;
}

const ADDABLE: Record<'short' | 'long', BeatKind[]> = { short: ['hook', 'cut', 'convert'], long: ['chapter', 'sponsor', 'recap', 'outro', 'hook', 'intro'] };

function BeatList({ piece, patch, patchBeat, readOnly, onCut, playback }: {
  piece: Piece; patch: (fields: Partial<Piece>) => void; patchBeat: (id: string, fields: Partial<Beat>) => void; readOnly?: boolean; onCut: (id: string) => void; playback: Playback;
}) {
  const [hooks, setHooks] = useState(false);
  const timed = timeline(piece);
  const form = PLATFORMS[piece.platform].form;
  const active = timed.find(item => playback.time >= item.start && playback.time < item.end)?.id;
  const move = (index: number, by: number) => {
    const beats = piece.beats.slice();
    const [item] = beats.splice(index, 1);
    beats.splice(index + by, 0, item);
    patch({ beats });
  };
  return <section className="creator-beats" aria-label="Beats">
    <ol>{timed.map((item, index) => <li key={item.id} className={`creator-beat creator-beat-${item.kind}${active === item.id && (playback.playing || playback.time > 0) ? ' is-playing' : ''}`}>
      <header>
        <span className="creator-kind">{BEAT_LABELS[item.kind]}</span>
        <input className="creator-beat-label" aria-label="Beat name" value={item.label} readOnly={readOnly} onChange={event => patchBeat(item.id, { label: event.target.value })} />
        <button type="button" className="creator-time" onClick={() => playback.setTime(item.start)} title="Preview from here">{clock(item.start)}–{clock(item.end)}</button>
        {!readOnly && <span className="creator-beat-tools">
          {item.kind === 'hook' && <button type="button" aria-pressed={hooks} onClick={() => setHooks(value => !value)}><Lightbulb size={14} /> Hook ideas</button>}
          {form === 'long' && item.kind === 'chapter' && <button type="button" onClick={() => onCut(item.id)} aria-label={`Cut a short from ${item.label}`}><Scissors size={14} /> Cut a short</button>}
          <button type="button" aria-label={`Move ${item.label} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></button>
          <button type="button" aria-label={`Move ${item.label} down`} disabled={index === timed.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></button>
          <button type="button" aria-label={`Remove ${item.label}`} onClick={() => patch({ beats: piece.beats.filter(other => other.id !== item.id) })}><X size={14} /></button>
        </span>}
      </header>
      {item.kind === 'hook' && hooks && !readOnly && <ul className="creator-library" aria-label="Hook ideas">{HOOKS.map(hook => <li key={hook.name}>
        <button type="button" onClick={() => { patchBeat(item.id, { spoken: hook.text }); setHooks(false); }}><strong>{hook.name}</strong><span>{hook.text}</span></button></li>)}</ul>}
      <p className="creator-hint">{BEAT_HINTS[item.kind]}</p>
      <label>Spoken<textarea rows={item.kind === 'chapter' || item.kind === 'cut' ? 4 : 2} value={item.spoken} readOnly={readOnly} placeholder="What you say" onChange={event => patchBeat(item.id, { spoken: event.target.value })} /></label>
      <div className="creator-beat-row">
        <label>On screen<input value={item.onScreen} readOnly={readOnly} placeholder="Text overlay or title card" onChange={event => patchBeat(item.id, { onScreen: event.target.value })} /></label>
        <label>B-roll and shots<input value={item.broll} readOnly={readOnly} placeholder="Cutaways, graphics, angle" onChange={event => patchBeat(item.id, { broll: event.target.value })} /></label>
        <label className="creator-seconds">Seconds<input type="number" min={0} value={item.seconds ?? ''} readOnly={readOnly} placeholder={String(beatSeconds({ ...item, seconds: undefined }, piece.wpm))}
          onChange={event => patchBeat(item.id, { seconds: event.target.value === '' ? undefined : Math.max(0, Number(event.target.value)) })} /></label>
      </div>
    </li>)}</ol>
    {!readOnly && <div className="creator-add" role="group" aria-label="Add a beat">
      {ADDABLE[form].map(kind => <button key={kind} type="button" onClick={() => patch({ beats: [...piece.beats, { ...newBeat(kind), label: kind === 'chapter' ? `Chapter ${piece.beats.filter(item => item.kind === 'chapter').length + 1}` : BEAT_LABELS[kind] }] })}>
        <Plus size={14} aria-hidden="true" /> {BEAT_LABELS[kind]}</button>)}
    </div>}
  </section>;
}

function Packaging({ piece, patch, readOnly, onPreview }: { piece: Piece; patch: (fields: Partial<Piece>) => void; readOnly?: boolean; onPreview: (title?: string) => void }) {
  const spec = PLATFORMS[piece.platform];
  const variants = piece.titleVariants?.length ? piece.titleVariants : [piece.title];
  const setVariants = (list: string[], chosen?: string) => patch({ titleVariants: list, ...(chosen !== undefined ? { title: chosen } : {}) });
  useEffect(() => () => onPreview(undefined), [onPreview]);
  return <section className="creator-packaging" aria-label="Packaging">
    <p className="creator-muted">Package before you film: the title and {spec.form === 'long' ? 'thumbnail' : 'first frame'} decide whether anyone clicks. Hover a title to see it in the preview.</p>
    <h3>Title options</h3>
    <ol className="creator-variants">{variants.map((variant, index) => <li key={index} className={variant === piece.title ? 'is-chosen' : undefined}
      onMouseEnter={() => onPreview(variant)} onMouseLeave={() => onPreview(undefined)}>
      <span className="creator-variant-letter">{String.fromCharCode(65 + index)}</span>
      <input aria-label={`Title option ${String.fromCharCode(65 + index)}`} value={variant} readOnly={readOnly} onFocus={() => onPreview(variant)} onBlur={() => onPreview(undefined)}
        onChange={event => { const list = variants.slice(); list[index] = event.target.value; setVariants(list, variant === piece.title ? event.target.value : undefined); }} />
      <small className={spec.titleLimit && variant.length > spec.titleLimit ? 'is-over' : variant.length > 60 ? 'is-warn' : undefined}>{variant.length}</small>
      {variant === piece.title ? <Badge variant="success" label="In use" /> : !readOnly && <button type="button" onClick={() => patch({ title: variant })}>Use</button>}
      {!readOnly && variants.length > 1 && <button type="button" aria-label={`Remove title option ${String.fromCharCode(65 + index)}`} onClick={() => {
        const list = variants.filter((_, at) => at !== index);
        setVariants(list, variant === piece.title ? list[0] : undefined);
      }}><X size={14} /></button>}
    </li>)}</ol>
    {!readOnly && <button type="button" className="creator-dashed" onClick={() => setVariants([...variants, ''])}><Plus size={14} aria-hidden="true" /> Add a title option</button>}
    {!readOnly && <><h3>Title formulas</h3>
      <div className="creator-formulas">{TITLE_FORMULAS.map(formula => <button key={formula} type="button" onClick={() => setVariants([...variants.filter(Boolean), formula])}>{formula}</button>)}</div></>}
    {spec.form === 'long' && <label className="creator-field">Thumbnail text
      <input value={piece.thumbnailText} readOnly={readOnly} placeholder="Three to five words that add to the title, not repeat it" onChange={event => patch({ thumbnailText: event.target.value })} />
      <small className={wordCount(piece.thumbnailText) > 5 ? 'is-warn' : undefined}>{wordCount(piece.thumbnailText)} words</small></label>}
    <label className="creator-field">Channel or handle
      <input value={piece.handle ?? ''} readOnly={readOnly} placeholder={spec.form === 'long' ? 'Your Channel' : '@yourchannel'} onChange={event => patch({ handle: event.target.value || undefined })} /></label>
  </section>;
}

function PublishPanel({ piece, patch, readOnly, onStatus }: { piece: Piece; patch: (fields: Partial<Piece>) => void; readOnly?: boolean; onStatus: (message: string) => void }) {
  const spec = PLATFORMS[piece.platform];
  const text = publishText(piece);
  const list = useMemo(() => spec.form === 'long' ? chapters(piece) : [], [piece, spec.form]);
  const name = piece.title || 'video';
  const copy = async (value: string, what: string) => {
    try { await navigator.clipboard.writeText(value); onStatus(`${what} copied.`); } catch { onStatus('Copy is blocked in this browser; select the text instead.'); }
  };
  const pack = () => download(`${name} - publishing pack.txt`, [`TITLE\n${piece.title}`, piece.titleVariants?.length ? `TITLE OPTIONS\n${piece.titleVariants.filter(Boolean).join('\n')}` : '',
    spec.form === 'long' ? `THUMBNAIL TEXT\n${piece.thumbnailText}` : '', `${spec.form === 'long' ? 'DESCRIPTION' : 'CAPTION'}\n${text}`,
    `SCRIPT\n${timeline(piece).map(item => `[${clock(item.start)}] ${item.label.toUpperCase()}\n${item.spoken}${item.onScreen ? `\nON SCREEN: ${item.onScreen}` : ''}${item.broll ? `\nB-ROLL: ${item.broll}` : ''}`).join('\n\n')}`]
    .filter(Boolean).join('\n\n———\n\n'));
  return <section className="creator-publish" aria-label="Publishing pack">
    <label className="creator-field">{spec.form === 'long' ? 'Description' : 'Caption'}<textarea rows={5} value={piece.description} readOnly={readOnly}
      placeholder={spec.form === 'long' ? 'The first two lines show above "more" — lead with the payoff.' : 'One line that earns the rewatch.'} onChange={event => patch({ description: event.target.value })} /></label>
    <label className="creator-field">Hashtags<input value={piece.hashtags} readOnly={readOnly} placeholder="#filmmaking #screenwriting" onChange={event => patch({ hashtags: event.target.value })} /></label>
    {spec.form === 'short' && <fieldset className="creator-crosspost"><legend>Also post to</legend>
      {SHORT_PLATFORMS.filter(key => key !== piece.platform).map(key => <label key={key}><input type="checkbox" disabled={readOnly} checked={piece.crossPost?.includes(key) ?? false}
        onChange={event => patch({ crossPost: event.target.checked ? [...(piece.crossPost ?? []), key] : (piece.crossPost ?? []).filter(item => item !== key) })} /> {PLATFORMS[key].label}</label>)}
    </fieldset>}
    <div className="creator-ready">
      <header><h3>Ready to paste</h3>
        <span className="creator-actions">
          <Button label="Copy" size="sm" variant="secondary" icon={<Copy size={14} aria-hidden="true" />} onClick={() => void copy(text, spec.form === 'long' ? 'Description' : 'Caption')} />
          <Button label="Captions (.srt)" size="sm" variant="secondary" icon={<Download size={14} aria-hidden="true" />} onClick={() => download(`${name}.srt`, srt(piece), 'application/x-subrip')} />
          <Button label="Export pack" size="sm" variant="secondary" icon={<Download size={14} aria-hidden="true" />} onClick={pack} />
        </span>
      </header>
      <pre>{text || 'Your description, chapters and hashtags appear here.'}</pre>
      {spec.captionLimit && <small className={text.length > spec.captionLimit ? 'is-over' : undefined}>{text.length.toLocaleString()} / {spec.captionLimit.toLocaleString()} characters</small>}
      {list.length > 0 && <p className="creator-muted">{list.length} chapters are included, starting at 0:00 as YouTube requires.</p>}
    </div>
  </section>;
}

function ChecksPanel({ piece }: { piece: Piece }) {
  const list = checks(piece);
  if (!list.length) return <section className="creator-clear" aria-label="Checks"><CheckCircle2 size={28} aria-hidden="true" /><h3>Ready to film</h3>
    <p className="creator-muted">Hook, length, retention, title, chapters and call to action all pass for {PLATFORMS[piece.platform].label}.</p></section>;
  return <section aria-label="Checks"><ul className="creator-checks">{list.map((item, index) => <li key={index} className={`is-${item.level}`}>
    {item.level === 'error' ? <CircleAlert size={16} aria-hidden="true" /> : item.level === 'warning' ? <TriangleAlert size={16} aria-hidden="true" /> : <Lightbulb size={16} aria-hidden="true" />}
    <span>{item.message}</span><Badge variant={item.level === 'error' ? 'error' : item.level === 'warning' ? 'warning' : 'neutral'} label={item.level === 'error' ? 'Fix' : item.level === 'warning' ? 'Check' : 'Tip'} />
  </li>)}</ul></section>;
}

function Teleprompter({ piece, onClose }: { piece: Piece; onClose: () => void }) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [mirror, setMirror] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  useEffect(() => {
    if (!playing) return;
    let frame = 0, last = performance.now();
    const step = (now: number) => {
      const element = scroller.current;
      // About eight words to a line: scroll one line every 8 / wpm minutes.
      if (element) element.scrollTop += (now - last) / 1000 * (piece.wpm / 60 / 8) * 64 * speed;
      last = now;
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, piece.wpm]);
  return <dialog ref={dialog} className="creator-prompter" aria-label="Teleprompter" onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => { if (event.key === ' ') { event.preventDefault(); setPlaying(value => !value); } }}>
    <div className="creator-prompter-bar">
      <strong>{piece.title || 'Untitled'}</strong>
      <span className="creator-actions">
        <button type="button" onClick={() => setPlaying(value => !value)}>{playing ? <><Pause size={16} /> Pause</> : <><Play size={16} /> Play</>}</button>
        <label>Speed<input type="range" min={0.5} max={2} step={0.1} value={speed} onChange={event => setSpeed(Number(event.target.value))} /></label>
        <label><input type="checkbox" checked={mirror} onChange={event => setMirror(event.target.checked)} /> Mirror</label>
        <button type="button" onClick={onClose} aria-label="Close teleprompter"><X size={18} /></button>
      </span>
    </div>
    <div className={`creator-prompter-text${mirror ? ' is-mirrored' : ''}`} ref={scroller}>
      {piece.beats.map(item => <p key={item.id}><small>{item.label}</small>{item.spoken || '…'}</p>)}
      <p aria-hidden="true" className="creator-prompter-end">■</p>
    </div>
  </dialog>;
}
