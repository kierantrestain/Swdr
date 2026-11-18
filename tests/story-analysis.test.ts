import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { newBlock, newDocument, newId } from '../src/model';
import type { Project } from '../src/model';
import { createProject } from '../src/workspace/project';
import { seedEditorial, seedSeries } from '../src/story/seed';
import { claimBoard, getEditorial, saveClaim } from '../src/story/editorial-model';
import {
  canonStates, cellKey, episodePositions, flashbacks, relationshipHistory, sourceDrift, storyChecks, storyMap
} from '../src/story/series-analysis';
import { getStory, queryStory } from '../src/story/series-model';
import { exactSource, orderedEpisodes, sourceText } from '../src/story/source';

// The same shape as the in-app demo: two seasons of twelve, with the full ferry office scene in S1E04.
const ferryOffice = [
  ['scene', 'INT. FERRY OFFICE – NIGHT'], ['action', 'Nora slides a paper ticket across the desk.'], ['character', 'NORA'],
  ['dialogue', 'Tell me which boat.'], ['character', 'ELIAS'], ['dialogue', 'The timetable they sent you is for tomorrow.'],
  ['scene', 'EXT. FERRY TERMINAL – NIGHT'], ['action', 'The ramp lifts.']
] as const;

function demo(title: string, kind: Project['kind'], script: (index: number) => ReturnType<typeof newBlock>[]): Project {
  const project = createProject(title, kind);
  project.episodes = Array.from({ length: 24 }, (_, index) => ({
    id: newId(), title: `Episode ${index + 1}`, number: index % 12 + 1, season: Math.floor(index / 12) + 1, synopsis: ''
  }));
  project.documents = project.episodes.map((episode, index) => {
    const document = newDocument(episode.title, 'screenplay', episode.id);
    document.blocks = script(index);
    return document;
  });
  return project;
}

const series = seedSeries(demo('The North Shore', 'series', index => index === 3
  ? ferryOffice.map(([kind, text]) => newBlock(kind, text))
  : [newBlock('scene', 'EXT. HARBOUR – DAWN'), newBlock('action', 'Nora checks the record.'), newBlock('character', 'NORA'), newBlock('dialogue', 'Show me the original.')]));
const factual = seedEditorial(demo('The Evidence Room', 'documentary', () => [newBlock('scene')]));
const store = getStory(series);
const nameOf = (name: string) => store.draft.characters.find(person => person.name === name)!.id;
const episodes = orderedEpisodes(series);

test('the demo series spans 24 episodes with seven characters and an approved canon', () => {
  assert.equal(episodes.length, 24);
  assert.equal(store.draft.characters.length, 7);
  assert.equal(store.canon.length, 1);
  const positions = episodePositions(series);
  const reached = new Set(store.draft.points.map(point => positions.get(point.source.episodeId ?? '')));
  assert(reached.size >= 18, `story records reach ${reached.size} episodes`);
});

test('story map groups each record under every participant and its reveal episode', () => {
  const canon = store.canon[0].data;
  const cells = storyMap(series, canon);
  const elias = cells.get(cellKey(nameOf('Elias Crowe'), episodes[3].id)) ?? [];
  assert.deepEqual(elias.map(point => point.kind).sort(), ['appearance', 'interaction', 'relationship']);
  const nora = cells.get(cellKey(nameOf('Nora Vale'), episodes[3].id)) ?? [];
  assert(nora.some(point => point.title === 'Elias changes the date on the timetable'));
  const total = [...cells.values()].reduce((sum, points) => sum + points.length, 0);
  assert.equal(total, canon.points.reduce((sum, point) => sum + point.participants.length, 0));
});

test('relationship history keeps every turn in reveal order with the state it replaced', () => {
  const pair = [nameOf('Nora Vale'), nameOf('Elias Crowe')].sort().join('/');
  const turns = relationshipHistory(series, store.draft.points).get(pair) ?? [];
  assert.deepEqual(turns.map(turn => turn.point.relationship), ['Trust', 'Distance', 'Trust']);
  assert.deepEqual(turns.map(turn => turn.previous), [undefined, 'Trust', 'Distance']);
});

test('flashbacks are the events revealed after a later event in story time', () => {
  const titles = [...flashbacks(series, store.draft.points)].map(id => store.draft.points.find(point => point.id === id)?.title).sort();
  assert.deepEqual(titles, ['Jonah produces the original', 'Tomas amends the log on the night of the storm']);
});

test('draft records outside the approved canon are marked and stay out of the canon view', () => {
  const states = canonStates(store);
  const drafts = store.draft.points.filter(point => states.get(point.id) === 'draft').map(point => point.title);
  assert.equal(drafts.length, 4);
  assert(drafts.includes('The ticket was issued to Mara’s driver'));
  assert(store.draft.characters.every(person => states.get(person.id) === 'approved'));
  const canonView = queryStory(series, store.canon[0].data, {});
  assert(!canonView.points.some(point => drafts.includes(point.title)));
});

test('suggested checks find open questions, off-screen turns, absences and rewritten source lines', () => {
  const data = queryStory(series, store.draft, {});
  const checks = storyChecks(series, data, episodes);
  const titles = checks.map(check => check.title);
  assert(titles.includes('Open question: Were the ministry minutes edited before release?'));
  assert(!titles.some(title => title.includes('unmarked ticket')), 'the answered ticket question is not open');
  assert(titles.includes('Nora Vale and Elias Crowe: Trust → Distance off screen'));
  assert(titles.includes('Tomas Rhee has no recorded story after S2E03'));
  assert(!checks.some(check => check.kind === 'source-changed'));

  const asOfFirstSeason = queryStory(series, store.draft, { asOfId: episodes[11].id });
  const early = storyChecks(series, asOfFirstSeason, episodes.slice(0, 12));
  assert(early.some(check => check.title === 'Unconfirmed belief: Nora believes the ticket was issued to a ministry driver'));

  const point = data.points.find(item => item.title === 'Elias withdraws the notebook')!;
  assert.equal(sourceDrift(series, point), 'current');
  const rewritten = {
    ...series, documents: series.documents.map(document => document.id === point.source.documentId
      ? { ...document, blocks: document.blocks.map(block => block.id === point.source.blockId ? { ...block, text: 'Elias keeps his notebook open.' } : block) }
      : document)
  };
  assert.equal(sourceDrift(rewritten, point), 'changed');
  assert(storyChecks(rewritten, data, episodes).some(check => check.title === 'Source line rewritten: Elias withdraws the notebook'));
  const removed = {
    ...series, documents: series.documents.map(document => document.id === point.source.documentId
      ? { ...document, blocks: document.blocks.filter(block => block.id !== point.source.blockId) } : document)
  };
  assert.equal(sourceDrift(removed, point), 'removed');
});

test('the claim board derives lanes from claim and source status and links exact host lines', () => {
  const editorial = getEditorial(factual);
  const board = claimBoard(factual, editorial);
  const lane = (text: string) => board.find(card => card.version.text.startsWith(text))?.lane;
  assert.equal(lane('The committee examined'), 'Verified');
  assert.equal(lane('The revised forecast'), 'Sourced');
  assert.equal(lane('Residents were not told'), 'Unsourced');
  assert.equal(lane('The scheme was approved'), 'Disputed');
  const verified = board.find(card => card.lane === 'Verified')!;
  assert.equal(new Set(verified.uses.map(use => use.documentId)).size, 24);
  assert.equal(sourceText(factual, verified.version.scriptLine!), 'The committee examined three costed alternatives before the vote.');
  assert(board.find(card => card.lane === 'Disputed')!.warnings.includes('Not linked to a script line'));

  const pending = editorial.evidence.find(item => item.versions.at(-1)?.status === 'Check required')!;
  const relying = saveClaim(factual, { text: 'The brief costed two options.', status: 'Verified', evidenceIds: [pending.id] });
  const card = claimBoard(relying, getEditorial(relying)).find(item => item.version.text === 'The brief costed two options.')!;
  assert.equal(card.lane, 'Verified');
  assert(card.warnings.some(warning => warning.startsWith('Verified, but relies on a source still marked Check required')));

  const document = factual.documents.find(item => item.blocks.some(block => block.text.startsWith('The revised forecast')))!;
  const line = exactSource(factual, document, document.blocks.find(block => block.text.startsWith('The revised forecast'))!.id);
  const linked = saveClaim(factual, { text: 'Doubled cost.', status: 'Check required', evidenceIds: [], scriptLine: line });
  assert.equal(getEditorial(linked).claims.at(-1)!.versions[0].scriptLine?.blockId, line.blockId);
  assert(linked.snapshots.some(snapshot => snapshot.document.revisionId === line.revisionId), 'the cited revision is retained');
  assert.throws(() => saveClaim(factual, { text: 'Bad line.', status: 'Check required', evidenceIds: [], scriptLine: { ...line, blockId: 'missing' } }),
    /exact script line/);
});
