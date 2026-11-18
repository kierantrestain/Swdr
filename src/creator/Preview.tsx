import { Bookmark, Heart, MessageCircle, Music2, Pause, Play, Send, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { BEAT_LABELS, PLATFORMS, beatAt, captionChunks, chapters, clock, runtime } from './model';
import type { Piece } from './model';

export interface Playback { time: number; playing: boolean; setTime: (seconds: number) => void; toggle: () => void }

function Scrubber({ piece, playback, segments }: { piece: Piece; playback: Playback; segments?: Array<{ start: number; title: string }> }) {
  const total = Math.max(1, runtime(piece));
  return <div className="creator-scrub">
    <button type="button" className="creator-play" onClick={playback.toggle} aria-label={playback.playing ? 'Pause preview' : 'Play preview'}>
      {playback.playing ? <Pause size={16} /> : <Play size={16} />}
    </button>
    <div className="creator-scrub-track">
      {segments && segments.length > 1 && <div className="creator-scrub-chapters" aria-hidden="true">
        {segments.map((item, index) => <span key={item.start} style={{ left: `${item.start / total * 100}%`, width: `${((segments[index + 1]?.start ?? total) - item.start) / total * 100}%` }} />)}
      </div>}
      <input type="range" min={0} max={total} step={0.1} value={Math.min(playback.time, total)} aria-label="Preview position"
        onChange={event => playback.setTime(Number(event.target.value))} style={{ ['--progress' as string]: `${Math.min(playback.time, total) / total * 100}%` }} />
    </div>
    <span className="creator-scrub-time">{clock(playback.time)} / {clock(total)}</span>
  </div>;
}

/** A 9:16 phone frame with the platform's chrome, burned-in captions and the safe zones it covers. */
export function PhonePreview({ piece, playback }: { piece: Piece; playback: Playback }) {
  const [safe, setSafe] = useState(true);
  const spec = PLATFORMS[piece.platform];
  const current = beatAt(piece, playback.time);
  const caption = captionChunks(piece).find(chunk => playback.time >= chunk.start && playback.time < chunk.end);
  const handle = piece.handle || '@yourchannel';
  return <section className="creator-preview-panel" aria-label="Phone preview">
    <header><strong>{spec.label} preview</strong>
      <button type="button" className="creator-chip" aria-pressed={safe} onClick={() => setSafe(value => !value)}><ShieldCheck size={13} aria-hidden="true" /> Safe zones</button></header>
    <div className={`creator-phone creator-phone-${piece.platform}`}>
      <div className={`creator-phone-scene creator-scene-${current?.kind ?? 'hook'}`}>
        {current?.broll && <p className="creator-phone-broll">{current.broll}</p>}
      </div>
      {current?.onScreen && <p className="creator-phone-title">{current.onScreen}</p>}
      {caption && <p className="creator-phone-caption" key={caption.start}>{caption.text}</p>}
      <div className="creator-phone-rail" aria-hidden="true">
        <span><Heart size={22} /><small>12.4K</small></span><span><MessageCircle size={22} /><small>318</small></span>
        <span><Bookmark size={22} /><small>1.9K</small></span><span><Send size={22} /><small>Share</small></span>
      </div>
      <div className="creator-phone-meta" aria-hidden="true">
        <strong>{handle}</strong>
        <p>{piece.description || piece.title || 'Your caption'}</p>
        <small><Music2 size={11} /> Original sound · {handle}</small>
      </div>
      {safe && <><i className="creator-safe creator-safe-right" aria-hidden="true" /><i className="creator-safe creator-safe-bottom" aria-hidden="true" /><i className="creator-safe creator-safe-top" aria-hidden="true" /></>}
      <span className="creator-phone-beat">{current ? (current.label || BEAT_LABELS[current.kind]) : ''}</span>
    </div>
    <Scrubber piece={piece} playback={playback} />
    {safe && <p className="creator-muted">Shaded areas sit under the platform's buttons and caption — keep text and faces out of them.</p>}
  </section>;
}

/** How the video appears in the YouTube feed, and the watch page with its chapter scrubber. */
export function YouTubePreview({ piece, playback, title }: { piece: Piece; playback: Playback; title?: string }) {
  const total = runtime(piece);
  const list = chapters(piece);
  const chapter = [...list].reverse().find(item => playback.time >= item.start);
  const caption = captionChunks(piece, 8).find(chunk => playback.time >= chunk.start && playback.time < chunk.end);
  const shown = title ?? piece.title;
  const handle = piece.handle || 'Your Channel';
  return <section className="creator-preview-panel" aria-label="YouTube preview">
    <header><strong>In the feed</strong><span className="creator-muted">{shown.length > 70 ? 'Title cut off on phones' : 'Title fits on phones'}</span></header>
    <article className="creator-yt-card">
      <div className="creator-thumb">
        <span className="creator-thumb-text">{piece.thumbnailText || 'THUMBNAIL TEXT'}</span>
        <span className="creator-thumb-time">{clock(total)}</span>
      </div>
      <div className="creator-yt-meta">
        <span className="creator-avatar" aria-hidden="true">{handle.replace(/^@/, '').slice(0, 1).toUpperCase()}</span>
        <div><strong>{shown || 'Your title'}</strong><small>{handle} · 24K views · 2 days ago</small></div>
      </div>
    </article>
    <header><strong>On the watch page</strong></header>
    <div className="creator-yt-player">
      <span className="creator-yt-chapter">{chapter ? chapter.title : ''}</span>
      {caption && <p className="creator-yt-caption" key={caption.start}>{caption.text}</p>}
    </div>
    <Scrubber piece={piece} playback={playback} segments={list} />
    {list.length > 0 && <ol className="creator-chapter-list">{list.map(item => <li key={item.start}>
      <button type="button" aria-current={chapter?.start === item.start ? 'true' : undefined} onClick={() => playback.setTime(item.start)}>
        <span>{clock(item.start)}</span>{item.title}</button></li>)}</ol>}
  </section>;
}
