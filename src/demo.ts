import { newBlock, newDocument, newId } from './model';
import type { DocumentModel, Episode, Project } from './model';
import { createProject } from './workspace';
import { seedProduction } from './production/seed';
import { seedEditorial, seedSeries } from './story/seed';
import { cutShort, newPiece, withCreator } from './creator/model';

const episodeNames = [
  'The Last Boat', 'Crossing', 'The Original', 'Doubt', 'The Service Road', 'First Light',
  'Dead Water', 'The Meeting', 'Rising Tide', 'A Missing Line', 'Landfall', 'Open Channel',
  'The Breakwater', 'Second Passage', 'A New Mark', 'Incoming', 'The Fog', 'Night Shift',
  'Paper Trail', 'The Outer Light', 'Soundings', 'High Water', 'The Inquest', 'Safe Harbour'
];

const sceneScript = [
  ['scene', 'INT. FERRY OFFICE – NIGHT'],
  ['action', 'A desk lamp illuminates a wall of cancelled routes. Rain ticks against the window.'],
  ['action', 'Nora slides a paper ticket across the desk.'],
  ['character', 'NORA'],
  ['dialogue', 'Tell me which boat.'],
  ['action', 'Elias turns the ticket over. Nothing on the back.'],
  ['character', 'ELIAS'],
  ['parenthetical', '(quietly)'],
  ['dialogue', 'The timetable they sent you is for tomorrow.'],
  ['action', 'A ferry horn sounds once. Nora looks past him to the water.'],
  ['scene', 'EXT. FERRY TERMINAL – NIGHT'],
  ['action', 'The ramp lifts. A passenger reaches the gate a step too late.'],
  ['scene', 'EXT. HARBOUR WALL – DAWN'],
  ['action', 'Jonah folds a second timetable along a crease that is already there.'],
  ['character', 'JONAH'],
  ['dialogue', 'I kept the version they put up before the storm.']
] as const;

const cueLines = [
  [6, 'Exterior. A service station at dusk.\nA sign flickers as a car enters frame.', 'SFX\nLow roadside hum. A single relay click.'],
  [10, 'Interior. Near the counter.\nMaya sets keys beside a folded paper map.', 'VO\nSome roads feel like they’re waiting for you.'],
  [12, 'Close on the map.\nA hand draws a line through the last town.', 'Music\nA muted pulse begins beneath the room tone.'],
  [15, 'Wide. The road opens out.\nHeadlights climb towards the ridge.', 'VO\nYou just have to choose to go.'],
  [11, 'Product reveal.\nThe receiver lights up on the dashboard.', 'SFX\nClean switch click. Pulse drops out.'],
  [6, 'End card.\nNight Signal and release date.', 'Music\nResolve and tail to silence.']
] as const;

function episodes(titles: string[]): Episode[] {
  return titles.map((title, index) => ({
    id: newId(), season: Math.floor(index / 12) + 1, number: index % 12 + 1, title, synopsis: ''
  }));
}

function seriesDocument(episode: Episode): DocumentModel {
  const document = newDocument(episode.title, 'screenplay', episode.id);
  document.blocks = episode.season === 1 && episode.number === 4
    ? sceneScript.map(([kind, text]) => newBlock(kind, text))
    : [newBlock('scene', 'EXT. HARBOUR – DAWN'),
      newBlock('action', `Beneath the first light, Nora checks the record for ${episode.title.toLowerCase()}.`),
      newBlock('character', 'NORA'), newBlock('dialogue', 'Show me the original.')];
  const scenes = document.blocks.filter(block => block.kind === 'scene');
  document.beats = scenes.map((block, i) => ({
    id: newId(), title: ['The paper ticket', 'A missed departure', 'The original timetable'][i],
    notes: ['Nora tests Elias’s account.', 'A passenger reaches the gate too late.', 'Jonah brings the only original.'][i],
    sceneId: block.sceneId
  }));
  return document;
}

export function createDemoProjects(): Project[] {
  const series = createProject('The North Shore', 'series', 'A ferry producer follows a paper record through a town that would rather let the last boat go.');
  series.episodes = episodes(episodeNames);
  series.documents = series.episodes.map(seriesDocument);
  const selected = series.documents[3];
  series.documents = [selected, ...series.documents.filter(document => document.id !== selected.id)];

  const factual = createProject('The Evidence Room', 'documentary', 'A factual series about the records behind public decisions.');
  factual.episodes = episodes(['The Price of Progress', ...Array.from({ length: 23 }, (_, index) => `Case ${index + 2}`)]);
  factual.documents = factual.episodes.map(episode => newDocument(episode.title, 'screenplay', episode.id));

  const commercial = createProject('Night Signal', 'commercial', 'A 60-second spot built around a road, a map and a quiet decision.');
  const master = commercial.documents[0];
  master.title = 'Sixty-second cut';
  master.avRows = cueLines.map(([durationSeconds, video, audio]) => ({ id: newId(), video, audio, durationSeconds }));
  const long = newDocument('Twenty-minute rehearsal', 'av');
  long.avRows = Array.from({ length: 20 }, (_, index) => ({
    id: newId(), durationSeconds: 60, video: `Camera cue ${index + 1}`, audio: `Minute ${index + 1}`
  }));
  commercial.documents.push(long);
  return [seedEditorial(commercial), seedEditorial(factual), seedSeries(seedProduction(series, selected.id)), creatorDemo()];
}

function creatorDemo(): Project {
  const channel = createProject('Frame by Frame', 'creator', 'A filmmaking channel: one YouTube breakdown a week, cut into shorts for TikTok, Reels and Shorts.');
  const video = newPiece('youtube', 'How a 3-person crew shot a car chase for £500');
  video.status = 'editing';
  video.thumbnailText = '£500 CAR CHASE';
  video.hashtags = '#filmmaking #lowbudget #indiefilm';
  video.description = 'We shot a full car chase with three people, two cars and one weekend. Here is every trick, the kit list and what we would never do again.';
  // [label, spoken, on screen, b-roll, seconds on screen]
  const beats: Array<[string, string, string, string, number]> = [
    ['Cold open', 'This chase cost less than your phone. And nobody watching it can tell.', 'SHOT IN ONE WEEKEND', 'Fastest 3 seconds of the chase, hard cut to black', 6],
    ['Intro', 'By the end of this video you will know how we planned it, rigged it and cut it — and the one shot that nearly sank the whole thing.', '', 'Crew on location, wide', 40],
    ['Planning the route', 'We storyboarded every shot on index cards and drove the route twice at the same time of day. Every corner got a number, and every number got a camera position. That map is the reason we finished on time.', 'THE ROUTE MAP', 'Index cards on the bonnet, drone of the route', 210],
    ['Rigging the car', 'A suction mount, a ratchet strap and a borrowed estate car gave us six angles. We never drove above thirty — the speed is all in the shutter and the edit.', 'SIX ANGLES, ONE CAR', 'Rig close-ups, behind the scenes', 240],
    ['Cutting the chase', 'Short shots, sound effects doing the heavy lifting, and one long take in the middle so the audience can breathe before the crash.', 'CUT FAST, THEN HOLD', 'Timeline screen recording', 225],
    ['Recap', 'Plan the route, fake the speed, let sound sell it.', '', '', 30],
    ['Outro & end screen', 'If you want the shot list we used, the next video breaks down every single setup.', 'NEXT: THE SHOT LIST', 'End screen: next video and subscribe', 20]
  ];
  video.beats = video.beats.map((beat, index) => {
    const [label, spoken, onScreen, broll, seconds] = beats[index];
    return { ...beat, label, spoken, onScreen, broll, seconds };
  });
  const short = cutShort(video, video.beats[3].id, 'tiktok');
  short.beats = short.beats.map(beat => ({ ...beat, seconds: beat.kind === 'hook' ? 2 : beat.kind === 'cut' ? 24 : 4 }));
  short.status = 'scheduled';
  short.title = 'The £0 trick that makes a slow car look fast';
  const day = (offset: number) => { const date = new Date(); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); };
  video.handle = 'Frame by Frame';
  video.publishDate = day(5);
  video.titleVariants = [video.title, 'I Shot a Car Chase for £500 (3-Person Crew)', 'Hollywood Car Chase on a £500 Budget'];
  short.handle = '@framebyframe';
  short.publishDate = day(2);
  short.crossPost = ['reels', 'shorts'];
  short.description = 'We never drove above 30. The speed is all in the edit.';
  const lens = newPiece('reels', 'One lens, three looks');
  lens.status = 'scripting';
  lens.handle = '@framebyframe';
  lens.beats[0] = { ...lens.beats[0], spoken: 'Same lens. Same room. Three completely different films.', onScreen: '1 LENS · 3 LOOKS' };
  const ideas = ['Lighting a night interior with one lamp', 'Why every indie film looks the same', 'I tried shooting a short on a phone for 30 days']
    .map((title, index) => ({ ...newPiece(index === 1 ? 'youtube' : 'tiktok', title), handle: '@framebyframe' }));
  const live = newPiece('youtube', 'The sound design trick that sells every fight scene');
  live.status = 'published';
  live.publishDate = day(-9);
  live.thumbnailText = 'FAKE PUNCHES, REAL SOUND';
  live.beats = live.beats.map(beat => ({ ...beat, seconds: beat.kind === 'hook' ? 7 : beat.kind === 'chapter' ? 190 : 35, spoken: beat.spoken || `${beat.label}.` }));
  return withCreator(channel, { pieces: [video, short, lens, ...ideas, live] });
}

export function episodeLabel(episode: Episode | undefined): string {
  return episode ? `S${episode.season}E${String(episode.number).padStart(2, '0')} · ${episode.title}` : '';
}
