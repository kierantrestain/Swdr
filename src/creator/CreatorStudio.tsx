import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import {
  ArrowDown, ArrowUp, CheckCircle2, CircleAlert, Clapperboard, Copy, Download, FileVideo, Lightbulb, MonitorPlay, Pause, Play, Plus, Scissors,
  Smartphone, Trash2, TriangleAlert, X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { newDocument } from '../model';
import type { WorkspaceViewProps } from '../model';
import {
  BEAT_HINTS, BEAT_LABELS, PLATFORMS, STATUSES, beatSeconds, checks, chapters, clock, creatorModule, cutShort, newBeat, newPiece,
  publishText, runtime, timeline, toAvRows, withCreator, wordCount
} from './model';
import type { Beat, BeatKind, Piece, Platform, Status } from './model';
import './creator.css';

const STATUS_LABELS: Record<Status, string> = { idea: 'Idea', scripting: 'Scripting', filming: 'Filming', editing: 'Editing', scheduled: 'Scheduled', published: 'Published' };
type PieceTab = 'script' | 'publish' | 'checks';

export function CreatorStudio({ project, onProjectChange, onStatus, readOnly }: Pick<WorkspaceViewProps, 'project' | 'onProjectChange' | 'onStatus' | 'readOnly'>) {
  const module = creatorModule(project);
  const [selectedId, setSelectedId] = useState(module.pieces[0]?.id ?? '');
  const [tab, setTab] = useState<PieceTab>('script');
  const [prompter, setPrompter] = useState(false);
  const [filter, setFilter] = useState<'all' | 'short' | 'long'>('all');
  const piece = module.pieces.find(item => item.id === selectedId) ?? module.pieces[0];

  const save = (change: (pieces: Piece[]) => Piece[], message?: string) => {
    if (readOnly) return;
    onProjectChange(current => withCreator(current, { pieces: change(creatorModule(current).pieces) }));
    if (message) onStatus(message);
  };
  const patch = (fields: Partial<Piece>) => piece && save(pieces => pieces.map(item => item.id === piece.id ? { ...item, ...fields } : item));
  const patchBeat = (id: string, fields: Partial<Beat>) => piece && patch({ beats: piece.beats.map(item => item.id === id ? { ...item, ...fields } : item) });

  function create(platform: Platform) {
    const next = newPiece(platform, PLATFORMS[platform].form === 'long' ? 'New YouTube video' : 'New short');
    save(pieces => [next, ...pieces], `${PLATFORMS[platform].label} piece added.`);
    setSelectedId(next.id);
    setTab('script');
  }

  function sendToAv() {
    if (!piece) return;
    const document = newDocument(piece.title || 'Untitled video', 'av');
    document.avRows = toAvRows(piece);
    onProjectChange(current => ({ ...current, documents: [...current.documents, document], updatedAt: new Date().toISOString() }));
    onStatus(`“${document.title}” added as a two-column AV script.`);
  }

  const shown = module.pieces.filter(item => filter === 'all' || PLATFORMS[item.platform].form === filter);

  return <section className="creator" aria-label="Creator studio" id="main-content">
    <header className="creator-head">
      <div>
        <h1>Creator studio</h1>
        <p>Short-form for TikTok, Reels, Shorts and LinkedIn; long-form for YouTube. Hook – Cut – Convert, timed to the second.</p>
      </div>
      {!readOnly && <div className="creator-actions">
        <Button label="New short" variant="secondary" icon={<Smartphone size={15} aria-hidden="true" />} onClick={() => create('shorts')} />
        <Button label="New YouTube video" variant="primary" icon={<MonitorPlay size={15} aria-hidden="true" />} onClick={() => create('youtube')} />
      </div>}
    </header>

    <div className="creator-layout">
      <aside className="creator-slate" aria-label="Content slate">
        <div className="creator-filter" role="group" aria-label="Show">
          {(['all', 'short', 'long'] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {value === 'all' ? 'All' : value === 'short' ? 'Short-form' : 'Long-form'}</button>)}
        </div>
        {shown.length ? <ul>{shown.map(item => <li key={item.id}>
          <button type="button" className="creator-slate-item" aria-current={item.id === piece?.id ? 'true' : undefined} onClick={() => setSelectedId(item.id)}>
            <span className="creator-slate-icon" aria-hidden="true">{PLATFORMS[item.platform].form === 'long' ? <MonitorPlay size={16} /> : <Smartphone size={16} />}</span>
            <span className="creator-slate-text"><strong>{item.title || 'Untitled'}</strong>
              <small>{PLATFORMS[item.platform].label} · {clock(runtime(item))}{item.publishDate ? ` · ${item.publishDate}` : ''}</small></span>
            <span className={`creator-status creator-status-${item.status}`}>{STATUS_LABELS[item.status]}</span>
          </button>
        </li>)}</ul> : <p className="creator-muted">{module.pieces.length ? 'Nothing in this view.' : 'No videos yet. Start a short or a YouTube video.'}</p>}
      </aside>

      {piece ? <article className="creator-editor" aria-label={piece.title || 'Untitled video'}>
        <PieceHeader piece={piece} patch={patch} readOnly={readOnly} />
        <Meter piece={piece} />
        <div className="creator-toolbar">
          <TabList value={tab} onChange={value => setTab(value as PieceTab)} hasDivider role="tablist">
            <Tab value="script" label="Script" />
            <Tab value="publish" label="Publish" />
            <Tab value="checks" label={`Checks (${checks(piece).filter(item => item.level !== 'tip').length})`} />
          </TabList>
          <div className="creator-actions">
            <Button label="Teleprompter" variant="secondary" size="sm" icon={<Play size={14} aria-hidden="true" />} onClick={() => setPrompter(true)} />
            {!readOnly && <Button label="Send to AV script" variant="secondary" size="sm" icon={<FileVideo size={14} aria-hidden="true" />} onClick={sendToAv} />}
            {!readOnly && <Button label="Delete" variant="ghost" size="sm" icon={<Trash2 size={14} aria-hidden="true" />} onClick={() => {
              if (!window.confirm(`Delete “${piece.title || 'Untitled'}”?`)) return;
              save(pieces => pieces.filter(item => item.id !== piece.id), 'Video deleted.');
              setSelectedId('');
            }} />}
          </div>
        </div>
        {tab === 'script' && <BeatList piece={piece} patch={patch} patchBeat={patchBeat} readOnly={readOnly} onCut={id => {
          const short = cutShort(piece, id);
          save(pieces => [short, ...pieces], 'Short cut from this chapter.');
          setSelectedId(short.id);
        }} />}
        {tab === 'publish' && <PublishPanel piece={piece} patch={patch} readOnly={readOnly} onStatus={onStatus} />}
        {tab === 'checks' && <ChecksPanel piece={piece} />}
      </article> : <div className="creator-empty">
        <Clapperboard size={32} aria-hidden="true" />
        <h2>Plan your first video</h2>
        <p>Each video is built from beats. A short runs Hook → Cut → Convert; a YouTube video runs cold open, intro, chapters, recap and end screen. Timing, chapters and the description write themselves as you go.</p>
        {!readOnly && <div className="creator-actions">
          <Button label="New short" variant="secondary" icon={<Smartphone size={15} aria-hidden="true" />} onClick={() => create('shorts')} />
          <Button label="New YouTube video" variant="primary" icon={<MonitorPlay size={15} aria-hidden="true" />} onClick={() => create('youtube')} />
        </div>}
      </div>}
    </div>
    {prompter && piece && <Teleprompter piece={piece} onClose={() => setPrompter(false)} />}
  </section>;
}

function PieceHeader({ piece, patch, readOnly }: { piece: Piece; patch: (fields: Partial<Piece>) => void; readOnly?: boolean }) {
  const spec = PLATFORMS[piece.platform];
  return <div className="creator-fields">
    <label className="creator-title">Title
      <input value={piece.title} readOnly={readOnly} onChange={event => patch({ title: event.target.value })} placeholder="What the viewer gets, in their words" />
      {spec.titleLimit && <small className={piece.title.length > spec.titleLimit ? 'is-over' : undefined}>{piece.title.length}/{spec.titleLimit}</small>}
    </label>
    <label>Platform
      <select value={piece.platform} disabled={readOnly} onChange={event => {
        const platform = event.target.value as Platform;
        patch({ platform, wpm: PLATFORMS[platform].form === 'long' ? 150 : 165 });
      }}>
        <optgroup label="Short-form">{(Object.keys(PLATFORMS) as Platform[]).filter(key => PLATFORMS[key].form === 'short').map(key => <option key={key} value={key}>{PLATFORMS[key].label}</option>)}</optgroup>
        <optgroup label="Long-form"><option value="youtube">{PLATFORMS.youtube.label}</option></optgroup>
      </select>
    </label>
    <label>Status
      <select value={piece.status} disabled={readOnly} onChange={event => patch({ status: event.target.value as Status })}>
        {STATUSES.map(status => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
      </select>
    </label>
    <label>Publish date<input type="date" value={piece.publishDate ?? ''} readOnly={readOnly} onChange={event => patch({ publishDate: event.target.value || undefined })} /></label>
    <label>Pace (wpm)<input type="number" min={90} max={240} value={piece.wpm} readOnly={readOnly} onChange={event => patch({ wpm: Math.min(240, Math.max(90, Number(event.target.value) || 150)) })} /></label>
  </div>;
}

function Meter({ piece }: { piece: Piece }) {
  const spec = PLATFORMS[piece.platform];
  const timed = timeline(piece);
  const total = runtime(piece);
  const scale = Math.max(total, spec.target[1], 1);
  const words = piece.beats.reduce((sum, item) => sum + wordCount(item.spoken), 0);
  const hook = timed[0]?.kind === 'hook' ? timed[0].end : undefined;
  const tone = total > spec.maxSeconds ? 'over' : total >= spec.target[0] && total <= spec.target[1] ? 'good' : 'off';
  return <section className="creator-meter" aria-label="Runtime">
    <dl>
      <div><dt>Runtime</dt><dd className={`is-${tone}`}>{clock(total)}</dd></div>
      <div><dt>Target</dt><dd>{clock(spec.target[0])}–{clock(spec.target[1])}</dd></div>
      <div><dt>Hook lands</dt><dd className={hook !== undefined && hook > spec.hookSeconds ? 'is-over' : undefined}>{hook === undefined ? '—' : `${hook}s`}</dd></div>
      <div><dt>Format</dt><dd>{spec.aspect}</dd></div>
      <div><dt>Words</dt><dd>{words}</dd></div>
    </dl>
    <div className="creator-bar" aria-hidden="true">
      {timed.map(item => <span key={item.id} className={`creator-seg creator-seg-${item.kind}`} style={{ width: `${(item.end - item.start) / scale * 100}%` }} title={`${item.label} · ${clock(item.start)}–${clock(item.end)}`} />)}
      <i className="creator-target" style={{ left: `${spec.target[0] / scale * 100}%`, width: `${(spec.target[1] - spec.target[0]) / scale * 100}%` }} />
    </div>
  </section>;
}

const ADDABLE: Record<'short' | 'long', BeatKind[]> = { short: ['hook', 'cut', 'convert'], long: ['chapter', 'sponsor', 'recap', 'outro', 'hook', 'intro'] };

function BeatList({ piece, patch, patchBeat, readOnly, onCut }: {
  piece: Piece; patch: (fields: Partial<Piece>) => void; patchBeat: (id: string, fields: Partial<Beat>) => void; readOnly?: boolean; onCut: (id: string) => void;
}) {
  const timed = timeline(piece);
  const form = PLATFORMS[piece.platform].form;
  const move = (index: number, by: number) => {
    const beats = piece.beats.slice();
    const [item] = beats.splice(index, 1);
    beats.splice(index + by, 0, item);
    patch({ beats });
  };
  return <section className="creator-beats" aria-label="Beats">
    <ol>{timed.map((item, index) => <li key={item.id} className={`creator-beat creator-beat-${item.kind}`}>
      <header>
        <span className="creator-kind">{BEAT_LABELS[item.kind]}</span>
        <input className="creator-beat-label" aria-label="Beat name" value={item.label} readOnly={readOnly} onChange={event => patchBeat(item.id, { label: event.target.value })} />
        <span className="creator-time">{clock(item.start)}–{clock(item.end)}</span>
        {!readOnly && <span className="creator-beat-tools">
          {form === 'long' && item.kind === 'chapter' && <button type="button" onClick={() => onCut(item.id)} title="Cut a short from this chapter" aria-label={`Cut a short from ${item.label}`}><Scissors size={14} /> Cut a short</button>}
          <button type="button" aria-label={`Move ${item.label} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></button>
          <button type="button" aria-label={`Move ${item.label} down`} disabled={index === timed.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></button>
          <button type="button" aria-label={`Remove ${item.label}`} onClick={() => patch({ beats: piece.beats.filter(other => other.id !== item.id) })}><X size={14} /></button>
        </span>}
      </header>
      <p className="creator-hint">{BEAT_HINTS[item.kind]}</p>
      <label>Spoken<textarea rows={item.kind === 'chapter' || item.kind === 'cut' ? 4 : 2} value={item.spoken} readOnly={readOnly} placeholder="What you say" onChange={event => patchBeat(item.id, { spoken: event.target.value })} /></label>
      <div className="creator-beat-row">
        <label>On screen<input value={item.onScreen} readOnly={readOnly} placeholder="Caption or title card" onChange={event => patchBeat(item.id, { onScreen: event.target.value })} /></label>
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

function PublishPanel({ piece, patch, readOnly, onStatus }: { piece: Piece; patch: (fields: Partial<Piece>) => void; readOnly?: boolean; onStatus: (message: string) => void }) {
  const spec = PLATFORMS[piece.platform];
  const text = publishText(piece);
  const list = useMemo(() => spec.form === 'long' ? chapters(piece) : [], [piece, spec.form]);
  const copy = async (value: string, what: string) => {
    try { await navigator.clipboard.writeText(value); onStatus(`${what} copied.`); } catch { onStatus('Copy is blocked in this browser; select the text instead.'); }
  };
  const exportPack = () => {
    const body = [`TITLE\n${piece.title}`, spec.form === 'long' && `THUMBNAIL TEXT\n${piece.thumbnailText}`, `${spec.form === 'long' ? 'DESCRIPTION' : 'CAPTION'}\n${text}`,
      `SCRIPT\n${timeline(piece).map(item => `[${clock(item.start)}] ${item.label.toUpperCase()}\n${item.spoken}${item.onScreen ? `\nON SCREEN: ${item.onScreen}` : ''}${item.broll ? `\nB-ROLL: ${item.broll}` : ''}`).join('\n\n')}`]
      .filter(Boolean).join('\n\n———\n\n');
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${piece.title || 'video'} - publishing pack.txt`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="creator-publish" aria-label="Publishing pack">
    <div className="creator-publish-fields">
      {spec.form === 'long' && <label>Thumbnail text<input value={piece.thumbnailText} readOnly={readOnly} placeholder="Three to five words" onChange={event => patch({ thumbnailText: event.target.value })} /></label>}
      <label>{spec.form === 'long' ? 'Description' : 'Caption'}<textarea rows={5} value={piece.description} readOnly={readOnly}
        placeholder={spec.form === 'long' ? 'The first two lines show above the fold — lead with the payoff.' : 'One line that earns the rewatch.'} onChange={event => patch({ description: event.target.value })} /></label>
      <label>Hashtags<input value={piece.hashtags} readOnly={readOnly} placeholder="#filmmaking #screenwriting" onChange={event => patch({ hashtags: event.target.value })} /></label>
    </div>
    <div className="creator-preview">
      <header><h3>Ready to paste</h3>
        <span className="creator-actions">
          <Button label="Copy" size="sm" variant="secondary" icon={<Copy size={14} aria-hidden="true" />} onClick={() => void copy(text, spec.form === 'long' ? 'Description' : 'Caption')} />
          <Button label="Export pack" size="sm" variant="secondary" icon={<Download size={14} aria-hidden="true" />} onClick={exportPack} />
        </span>
      </header>
      <pre>{text || 'Your description, chapters and hashtags appear here.'}</pre>
      {spec.captionLimit && <small className={text.length > spec.captionLimit ? 'is-over' : undefined}>{text.length.toLocaleString()} / {spec.captionLimit.toLocaleString()} characters</small>}
      {list.length > 0 && <><h3>Chapters</h3><ol className="creator-chapters">{list.map(item => <li key={`${item.start}-${item.title}`}><span>{clock(item.start)}</span>{item.title}</li>)}</ol></>}
    </div>
  </section>;
}

function ChecksPanel({ piece }: { piece: Piece }) {
  const list = checks(piece);
  if (!list.length) return <section className="creator-clear" aria-label="Checks"><CheckCircle2 size={28} aria-hidden="true" /><h3>Ready to film</h3>
    <p className="creator-muted">Hook, length, title, chapters and call to action all pass for {PLATFORMS[piece.platform].label}.</p></section>;
  return <section aria-label="Checks"><ul className="creator-checks">{list.map((item, index) => <li key={index} className={`is-${item.level}`}>
    {item.level === 'error' ? <CircleAlert size={16} aria-hidden="true" /> : item.level === 'warning' ? <TriangleAlert size={16} aria-hidden="true" /> : <Lightbulb size={16} aria-hidden="true" />}
    <span>{item.message}</span><Badge variant={item.level === 'error' ? 'error' : item.level === 'warning' ? 'warning' : 'neutral'} label={item.level === 'error' ? 'Fix' : item.level === 'warning' ? 'Check' : 'Tip'} />
  </li>)}</ul></section>;
}

function Teleprompter({ piece, onClose }: { piece: Piece; onClose: () => void }) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const scroller = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  useEffect(() => {
    if (!playing) return;
    let frame = 0, last = performance.now();
    // Scroll at the piece's speaking pace: one line of about eight words per (8 / wpm) minutes.
    const step = (now: number) => {
      const element = scroller.current;
      if (element) element.scrollTop += (now - last) / 1000 * (piece.wpm / 60 / 8) * 64 * speed;
      last = now;
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, piece.wpm]);
  return <dialog ref={dialog} className="creator-prompter" aria-label="Teleprompter" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="creator-prompter-bar">
      <strong>{piece.title || 'Untitled'}</strong>
      <span className="creator-actions">
        <button type="button" onClick={() => setPlaying(value => !value)}>{playing ? <><Pause size={16} /> Pause</> : <><Play size={16} /> Play</>}</button>
        <label>Speed<input type="range" min={0.5} max={2} step={0.1} value={speed} onChange={event => setSpeed(Number(event.target.value))} /></label>
        <button type="button" onClick={onClose} aria-label="Close teleprompter"><X size={18} /></button>
      </span>
    </div>
    <div className="creator-prompter-text" ref={scroller}>
      {piece.beats.map(item => <p key={item.id}><small>{item.label}</small>{item.spoken || '…'}</p>)}
      <p aria-hidden="true" className="creator-prompter-end">■</p>
    </div>
  </dialog>;
}
