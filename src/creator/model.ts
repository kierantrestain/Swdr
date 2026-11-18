/**
 * Creator content: short-form social videos and YouTube long-form, planned beat by beat.
 * Timing comes from the spoken words at a speaking pace unless a beat sets its own length.
 */
import { newId } from '../model';
import type { AVRow, Project } from '../model';

export type Platform = 'tiktok' | 'reels' | 'shorts' | 'linkedin' | 'youtube';
export type Form = 'short' | 'long';

export interface PlatformSpec {
  label: string;
  form: Form;
  aspect: string;
  /** The length that usually performs, in seconds. */
  target: [number, number];
  /** The longest upload the platform accepts for this format, in seconds. */
  maxSeconds: number;
  /** The hook should land before this many seconds. */
  hookSeconds: number;
  titleLimit?: number;
  captionLimit?: number;
}

export const PLATFORMS: Record<Platform, PlatformSpec> = {
  tiktok: { label: 'TikTok', form: 'short', aspect: '9:16', target: [15, 60], maxSeconds: 600, hookSeconds: 3, captionLimit: 4000 },
  reels: { label: 'Instagram Reels', form: 'short', aspect: '9:16', target: [15, 90], maxSeconds: 180, hookSeconds: 3, captionLimit: 2200 },
  shorts: { label: 'YouTube Shorts', form: 'short', aspect: '9:16', target: [15, 60], maxSeconds: 180, hookSeconds: 3, titleLimit: 100 },
  linkedin: { label: 'LinkedIn video', form: 'short', aspect: '4:5', target: [30, 90], maxSeconds: 600, hookSeconds: 3, captionLimit: 3000 },
  youtube: { label: 'YouTube long-form', form: 'long', aspect: '16:9', target: [480, 1200], maxSeconds: 43200, hookSeconds: 30, titleLimit: 100, captionLimit: 5000 }
};

export type BeatKind = 'hook' | 'cut' | 'convert' | 'intro' | 'chapter' | 'sponsor' | 'recap' | 'outro';

export const BEAT_LABELS: Record<BeatKind, string> = {
  hook: 'Hook', cut: 'Cut', convert: 'Convert', intro: 'Intro', chapter: 'Chapter', sponsor: 'Sponsor', recap: 'Recap', outro: 'Outro & end screen'
};

export const BEAT_HINTS: Record<BeatKind, string> = {
  hook: 'Stop the scroll: a bold claim, a question or the payoff shown first.',
  cut: 'The one idea, story or demonstration — nothing the viewer can skip.',
  convert: 'One clear action: follow, comment, watch the full video, visit the link.',
  intro: 'Promise what the viewer gets by the end, and why you are the one to show them.',
  chapter: 'One step, idea or story beat. It becomes a YouTube chapter.',
  sponsor: 'The integrated read: why it fits this video, one benefit, one link.',
  recap: 'Land the takeaways in a few lines.',
  outro: 'Point to the next video. Leave 5–20 seconds for the end screen.'
};

export const STATUSES = ['idea', 'scripting', 'filming', 'editing', 'scheduled', 'published'] as const;
export type Status = (typeof STATUSES)[number];

export interface Beat {
  id: string;
  kind: BeatKind;
  label: string;
  /** Words said on camera or in voice-over. */
  spoken: string;
  /** Text burned in or shown as a caption. */
  onScreen: string;
  /** Cutaways, graphics and shots. */
  broll: string;
  /** A fixed length in seconds; otherwise estimated from the spoken words. */
  seconds?: number;
}

export interface Piece {
  id: string;
  title: string;
  platform: Platform;
  status: Status;
  publishDate?: string;
  beats: Beat[];
  thumbnailText: string;
  description: string;
  hashtags: string;
  /** Words per minute used to estimate timing. */
  wpm: number;
  /** The long-form video a short was cut from. */
  sourceId?: string;
  /** Alternative titles to test; `title` is the one in use. */
  titleVariants?: string[];
  /** Other platforms the same cut is posted to. */
  crossPost?: Platform[];
  /** Channel or handle shown in previews. */
  handle?: string;
  createdAt: string;
}

export interface CreatorModule { pieces: Piece[] }

const WORD = /[\p{L}\p{N}'’-]+/gu;
export const wordCount = (text: string) => text.match(WORD)?.length ?? 0;

export function creatorModule(project: Project): CreatorModule {
  const raw = project.modules.creator as Partial<CreatorModule> | undefined;
  return { pieces: Array.isArray(raw?.pieces) ? raw.pieces : [] };
}

export function withCreator(project: Project, module: CreatorModule): Project {
  return { ...project, modules: { ...project.modules, creator: module }, updatedAt: new Date().toISOString() };
}

export function beatSeconds(beat: Beat, wpm: number): number {
  if (beat.seconds !== undefined && beat.seconds >= 0) return beat.seconds;
  const words = wordCount(beat.spoken);
  return words ? Math.max(1, Math.round(words / Math.max(60, wpm) * 60)) : 0;
}

export interface TimedBeat extends Beat { start: number; end: number }

export function timeline(piece: Piece): TimedBeat[] {
  let cursor = 0;
  return piece.beats.map(beat => {
    const start = cursor;
    cursor += beatSeconds(beat, piece.wpm);
    return { ...beat, start, end: cursor };
  });
}

export function runtime(piece: Piece): number {
  return piece.beats.reduce((sum, beat) => sum + beatSeconds(beat, piece.wpm), 0);
}

export function clock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const h = Math.floor(whole / 3600), m = Math.floor(whole / 60) % 60, s = whole % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function beat(kind: BeatKind, label = BEAT_LABELS[kind], spoken = ''): Beat {
  return { id: newId(), kind, label, spoken, onScreen: '', broll: '' };
}

export function newPiece(platform: Platform, title = ''): Piece {
  const long = PLATFORMS[platform].form === 'long';
  return {
    id: newId(), title, platform, status: 'idea', thumbnailText: '', description: '', hashtags: '', wpm: long ? 150 : 165,
    createdAt: new Date().toISOString(),
    beats: long
      ? [beat('hook', 'Cold open'), beat('intro'), beat('chapter', 'Chapter 1'), beat('chapter', 'Chapter 2'), beat('chapter', 'Chapter 3'), beat('recap'), beat('outro')]
      : [beat('hook'), beat('cut'), beat('convert')]
  };
}

export function newBeat(kind: BeatKind): Beat {
  return beat(kind);
}

/** YouTube chapters: the first starts at 0:00 and takes in the cold open. */
export function chapters(piece: Piece): Array<{ start: number; title: string; seconds: number }> {
  const timed = timeline(piece).filter(item => item.kind !== 'hook' || item.start > 0);
  const marks = timed.filter((item, index) => index === 0 || item.kind !== 'hook');
  return marks.map((item, index) => {
    const start = index === 0 ? 0 : item.start;
    const end = marks[index + 1]?.start ?? runtime(piece);
    return { start, title: item.label.trim() || BEAT_LABELS[item.kind], seconds: end - start };
  });
}

/** The description as it should be pasted into the platform: copy, chapters, then hashtags. */
export function publishText(piece: Piece): string {
  const parts = [piece.description.trim()];
  if (PLATFORMS[piece.platform].form === 'long') {
    const list = chapters(piece);
    if (list.length) parts.push(['Chapters', ...list.map(item => `${clock(item.start)} ${item.title}`)].join('\n'));
  }
  const tags = hashtagList(piece.hashtags);
  if (tags.length) parts.push(tags.join(' '));
  return parts.filter(Boolean).join('\n\n');
}

export function hashtagList(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).map(tag => tag.replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '')).filter(Boolean).map(tag => `#${tag}`))];
}

export interface CreatorCheck { level: 'error' | 'warning' | 'tip'; message: string; beatId?: string }

export function checks(piece: Piece): CreatorCheck[] {
  const spec = PLATFORMS[piece.platform];
  const timed = timeline(piece);
  const total = runtime(piece);
  const out: CreatorCheck[] = [];
  const first = timed[0];
  if (!first || first.kind !== 'hook') out.push({ level: 'error', message: 'Open with a hook. The first beat decides whether anyone keeps watching.' });
  else if (first.end > spec.hookSeconds) out.push({ level: 'warning', beatId: first.id, message: `The hook runs ${clock(first.end)}. On ${spec.label} it should land within ${spec.hookSeconds} seconds.` });
  if (first?.kind === 'hook' && !first.spoken.trim() && !first.onScreen.trim()) out.push({ level: 'error', beatId: first.id, message: 'The hook is empty.' });
  if (total > spec.maxSeconds) out.push({ level: 'error', message: `${clock(total)} is longer than ${spec.label} allows (${clock(spec.maxSeconds)}).` });
  else if (total && (total < spec.target[0] || total > spec.target[1])) {
    out.push({ level: 'tip', message: `${clock(total)} is outside the usual ${clock(spec.target[0])}–${clock(spec.target[1])} for ${spec.label}.` });
  }
  if (!piece.title.trim()) out.push({ level: 'warning', message: 'Add a title.' });
  if (spec.titleLimit && piece.title.length > spec.titleLimit) out.push({ level: 'error', message: `The title is ${piece.title.length} characters; ${spec.label} allows ${spec.titleLimit}.` });
  if (spec.form === 'long' && piece.title.length > 60) out.push({ level: 'tip', message: 'Titles over about 60 characters are cut off in search and suggestions.' });
  if (!timed.some(item => item.kind === 'convert' || item.kind === 'outro')) out.push({ level: 'warning', message: 'End with a call to action.' });
  const text = publishText(piece);
  if (spec.captionLimit && text.length > spec.captionLimit) out.push({ level: 'error', message: `The ${spec.form === 'long' ? 'description' : 'caption'} is ${text.length} characters; ${spec.label} allows ${spec.captionLimit}.` });
  if (piece.platform === 'youtube' || piece.platform === 'shorts') {
    if (hashtagList(piece.hashtags).length > 60) out.push({ level: 'error', message: 'YouTube ignores every hashtag on a video with more than 60.' });
  }
  if (spec.form === 'long') {
    const list = chapters(piece);
    if (list.length < 3) out.push({ level: 'warning', message: 'YouTube needs at least three chapters to show them.' });
    for (const item of list) {
      if (item.seconds < 10) out.push({ level: 'warning', message: `Chapter “${item.title}” is ${item.seconds}s; YouTube chapters must be at least 10 seconds.` });
    }
    if (!piece.thumbnailText.trim()) out.push({ level: 'tip', message: 'Write the thumbnail text before you film; it shapes the hook.' });
    else if (wordCount(piece.thumbnailText) > 5) out.push({ level: 'tip', message: 'Thumbnail text reads best at five words or fewer.' });
  }
  for (const item of timed) {
    if (item.kind !== 'hook' && !item.spoken.trim() && !item.onScreen.trim() && !item.broll.trim()) out.push({ level: 'tip', beatId: item.id, message: `“${item.label || BEAT_LABELS[item.kind]}” is still empty.` });
    // Retention: long stretches with nothing new on screen are where viewers leave.
    const still = item.end - item.start;
    const limit = spec.form === 'long' ? 90 : 8;
    if (still > limit && !item.broll.trim() && !item.onScreen.trim()) {
      out.push({ level: 'warning', beatId: item.id, message: `“${item.label}” runs ${clock(still)} with no B-roll or on-screen text. Add a visual change at least every ${spec.form === 'long' ? '60–90 seconds' : 'few seconds'}.` });
    }
  }
  for (const platform of piece.crossPost ?? []) {
    const other = PLATFORMS[platform];
    if (other.form === spec.form && total > other.maxSeconds) out.push({ level: 'error', message: `Too long to cross-post to ${other.label} (${clock(other.maxSeconds)} maximum).` });
    if (other.captionLimit && text.length > other.captionLimit) out.push({ level: 'warning', message: `The caption is too long for ${other.label} (${other.captionLimit.toLocaleString()} characters).` });
  }
  return out;
}

/** Cuts a short from one beat of a long video: a hook from its first line, the beat itself, and a pointer back. */
export function cutShort(source: Piece, beatId: string, platform: Platform = 'shorts'): Piece {
  const from = source.beats.find(item => item.id === beatId);
  const short = newPiece(platform, from ? `${source.title || 'Untitled'} — ${from.label}` : source.title);
  const firstSentence = from?.spoken.split(/(?<=[.!?])\s+/)[0] ?? '';
  short.sourceId = source.id;
  short.hashtags = source.hashtags;
  short.beats = [
    { ...short.beats[0], spoken: firstSentence, onScreen: source.thumbnailText },
    { ...short.beats[1], label: from?.label || 'Cut', spoken: from?.spoken.slice(firstSentence.length).trim() ?? '', onScreen: from?.onScreen ?? '', broll: from?.broll ?? '' },
    { ...short.beats[2], spoken: 'The full breakdown is on the channel — link in the description.' }
  ];
  return short;
}

/** Two-column rows for the AV script: picture on the left, words on the right. */
export function toAvRows(piece: Piece): AVRow[] {
  return piece.beats.map(item => ({
    id: newId(),
    video: [`${BEAT_LABELS[item.kind].toUpperCase()}${item.label && item.label !== BEAT_LABELS[item.kind] ? ` — ${item.label}` : ''}`, item.onScreen && `ON SCREEN: ${item.onScreen}`, item.broll && `B-ROLL: ${item.broll}`].filter(Boolean).join('\n'),
    audio: item.spoken,
    durationSeconds: beatSeconds(item, piece.wpm)
  }));
}

/** Proven opening patterns. {topic} and {result} are placeholders the writer replaces. */
export const HOOKS: Array<{ name: string; text: string }> = [
  { name: 'Result first', text: 'This {result} took me one weekend — here is exactly how.' },
  { name: 'Stop doing', text: 'Stop doing {topic} like this. Do this instead.' },
  { name: 'Nobody tells you', text: 'Nobody tells you this about {topic}.' },
  { name: 'I tried it', text: 'I tried {topic} for 30 days so you don\'t have to.' },
  { name: 'Mistake', text: 'The biggest mistake I see with {topic} — and the two-minute fix.' },
  { name: 'Versus', text: '{topic} for £50 versus £5,000. Can you tell which is which?' },
  { name: 'Question', text: 'Why does every {topic} look the same? It comes down to one choice.' },
  { name: 'Countdown', text: 'Three {topic} tricks that look expensive and cost nothing.' },
  { name: 'Story cold open', text: 'Ten minutes before we called action, everything went wrong.' },
  { name: 'Challenge', text: 'Can you {result} with only a phone? Let\'s find out.' }
];

export const TITLE_FORMULAS: string[] = [
  'How I {result} (and what I\'d never do again)',
  '{topic}: Everything I Wish I Knew Sooner',
  'I Tried {topic} for 30 Days',
  '{topic} for £50 vs £5,000',
  'Stop Making This {topic} Mistake',
  'The {topic} Trick Nobody Talks About',
  '3 {topic} Tricks That Look Expensive',
  'Why Every {topic} Looks the Same'
];

/** On-screen captions: the spoken words in short chunks, spread across each beat's time. */
export function captionChunks(piece: Piece, size = 4): Array<{ start: number; end: number; text: string; beatId: string }> {
  const out: Array<{ start: number; end: number; text: string; beatId: string }> = [];
  for (const item of timeline(piece)) {
    const words = item.spoken.trim().split(/\s+/).filter(Boolean);
    if (!words.length || item.end <= item.start) continue;
    const per = (item.end - item.start) / words.length;
    for (let index = 0; index < words.length; index += size) {
      const group = words.slice(index, index + size);
      out.push({ start: item.start + index * per, end: item.start + (index + group.length) * per, text: group.join(' '), beatId: item.id });
    }
  }
  return out;
}

function srtTime(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

/** SubRip subtitles timed from the script, for upload or as a burn-in guide in the edit. */
export function srt(piece: Piece): string {
  return captionChunks(piece, 7).map((chunk, index) => `${index + 1}\n${srtTime(chunk.start)} --> ${srtTime(chunk.end)}\n${chunk.text}\n`).join('\n');
}

export function beatAt(piece: Piece, seconds: number): TimedBeat | undefined {
  const timed = timeline(piece);
  return timed.find(item => seconds >= item.start && seconds < item.end) ?? timed.at(-1);
}

/** The weeks of a month as ISO dates, Monday first, padded with the neighbouring months. */
export function monthGrid(year: number, month: number): string[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const start = new Date(first);
  start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
  const weeks: string[][] = [];
  const cursor = new Date(start);
  do {
    const week: string[] = [];
    for (let day = 0; day < 7; day += 1) { week.push(cursor.toISOString().slice(0, 10)); cursor.setUTCDate(cursor.getUTCDate() + 1); }
    weeks.push(week);
  } while (cursor.getUTCMonth() === month);
  return weeks;
}
