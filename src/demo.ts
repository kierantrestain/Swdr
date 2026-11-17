import { newBlock, newDocument, newId } from './model';
import type { DocumentModel, Episode, Project } from './model';
import { createProject } from './workspace';
import { seedProduction } from './production';

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
  return [commercial, factual, seedProduction(series, selected.id)];
}

export function episodeLabel(episode: Episode | undefined): string {
  return episode ? `S${episode.season}E${String(episode.number).padStart(2, '0')} · ${episode.title}` : '';
}
