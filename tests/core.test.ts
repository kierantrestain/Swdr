import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { newBlock, newDocument, sceneList, sourceFor } from '../src/model';
import { createProject, issueDocument, resolveSource, restoreDocument } from '../src/workspace/project';
import { elementBox, geometryFor, lockManuscriptPages, paginateDocument } from '../src/writing/layout';
import { timedRows } from '../src/writing/av-timing';
import { applyProjection, mergeTeamProjects, preserveSnapshots, toVisibleProject, visibleDocument } from '../server/team-model';

test('restore forks a draft head and preserves all immutable revision source links', () => {
  const project = createProject('June Harbour', 'film');
  const initial = project.documents[0];
  initial.blocks = [newBlock('scene', 'INT. WATCH ROOM - DAY'), newBlock('action', 'The radio falls quiet.')];
  const sceneId = sceneList(initial)[0].id;
  const issued = issueDocument(project, initial.id, 'Blue Issue');
  const issuedRef = sourceFor(issued.project, issued.snapshot.document, { sceneId, blockId: initial.blocks[1].id });
  const head = issued.project.documents[0];
  assert.notEqual(head.revisionId, initial.revisionId);
  const edit = { ...issued.project, documents: [{ ...head, blocks: [head.blocks[0], { ...head.blocks[1], text: 'Someone answers.' }] }] };
  const restored = restoreDocument(edit, issued.snapshot.id);
  assert.notEqual(restored.documents[0].revisionId, issued.snapshot.document.revisionId);
  assert.notEqual(restored.documents[0].revisionId, head.revisionId);
  assert.equal(restored.documents[0].blocks[1].text, 'The radio falls quiet.');
  assert.equal(resolveSource(restored, issuedRef)?.blocks[1].id, initial.blocks[1].id);
  assert.deepEqual(restored.snapshots.map(snapshot => snapshot.document.blocks[1].text), ['The radio falls quiet.', 'Someone answers.']);
  assert.doesNotThrow(() => preserveSnapshots(issued.project, restored));
  assert.throws(() => preserveSnapshots(issued.project, { ...restored, snapshots: [] }), /immutable|snapshots?|issued/i);
});

test('Letter and A4 have fixed physical geometry, dual dialogue and stable locked labels', () => {
  assert.deepEqual([geometryFor('letter').width, geometryFor('letter').height], [612, 792]);
  assert.deepEqual([geometryFor('a4').width, geometryFor('a4').height], [210 * 72 / 25.4, 297 * 72 / 25.4]);
  const document = newDocument('An Empty Road', 'screenplay');
  document.titlePage = { title: 'An Empty Road', author: 'A Fictional Writer' };
  document.blocks = [
    newBlock('scene', 'EXT. ROAD - DAY'),
    { ...newBlock('character', 'JO'), dual: 'left' },
    newBlock('dialogue', 'Wait here.'),
    { ...newBlock('character', 'ROWAN'), dual: 'right' },
    newBlock('dialogue', 'I am already through.'),
    ...Array.from({ length: 100 }, (_, index) => newBlock('action', `The next marker is numbered ${index}.`))
  ];
  const firstLayout = paginateDocument(document);
  assert(firstLayout.pages[0].titlePage);
  const rows = firstLayout.pages.flatMap(page => page.lines);
  const jo = rows.find(line => line.text === 'JO');
  const rowan = rows.find(line => line.text === 'ROWAN');
  assert(jo && rowan);
  assert.equal(jo.y, rowan.y);
  assert(jo.x < rowan.x);
  assert.equal(firstLayout.geometry.fontSize, 12);
  assert.equal(elementBox('action', firstLayout.geometry).x, firstLayout.geometry.left);

  const locks = lockManuscriptPages(document);
  const originalPageTwo = locks.find(lock => lock.label === '2');
  assert(originalPageTwo);
  const revised = {
    ...document,
    lockedPages: locks,
    revisionLabel: 'Blue',
    blocks: [document.blocks[0], ...Array.from({ length: 50 }, () => ({ ...newBlock('action', 'An extra beat.'), revision: 'Blue' })), ...document.blocks.slice(1)]
  };
  const amended = paginateDocument(revised).pages;
  assert(amended.some(page => /^1[A-Z]+$/.test(page.label)));
  assert(amended.find(page => page.label === '2')?.lines.some(line => line.blockId === originalPageTwo.firstBlockId));
  assert(amended.flatMap(page => page.lines).some(line => line.revision === 'Blue'));
});

test('AV duration handles both a sixty-second spot and a twenty-minute rehearsal', () => {
  const rows = [6, 10, 12, 15, 11, 6].map((durationSeconds, index) => ({
    id: String(index), durationSeconds, video: 'Camera', audio: 'Sound'
  }));
  const spot = timedRows(rows);
  assert.equal(spot.durationSeconds, 60);
  assert.equal(timedRows(Array.from({ length: 20 }, (_, index) => ({ ...rows[0], id: String(index), durationSeconds: 60 }))).durationSeconds, 1200);
  const timed = timedRows([{ ...rows[0], cueSeconds: 12 }, ...rows.slice(1)]);
  assert.equal(timed.durationSeconds, 72);
});

test('five writers merge independent blocks and conflicting edits retain the server head', () => {
  const original = createProject('The Lockkeeper', 'film');
  const document = original.documents[0];
  document.blocks = Array.from({ length: 5 }, (_, index) => newBlock('action', `Original line ${index}.`));
  const write = (index: number, text: string) => ({
    ...original,
    documents: [{ ...document, blocks: document.blocks.map((block, position) => position === index ? { ...block, text } : block) }]
  });
  let head = original;
  for (let index = 0; index < 5; index++) {
    const result = mergeTeamProjects(original, write(index, `Writer ${index} revised the line.`), head);
    assert.equal(result.conflicts.length, 0);
    head = result.project;
  }
  assert.deepEqual(head.documents[0].blocks.map(block => block.text), Array.from({ length: 5 }, (_, index) => `Writer ${index} revised the line.`));
  const conflict = mergeTeamProjects(original, write(0, 'A second writer changed this line.'), head);
  assert(conflict.conflicts.length > 0);
  assert.equal(head.documents[0].blocks[0].text, 'Writer 0 revised the line.');
});

test('episode grants project only allowed episodes and preserve the private remote data on scoped writes', () => {
  const project = createProject('The Second Platform', 'series');
  const firstEpisode = project.episodes[0];
  const newEpisode = { ...firstEpisode, id: crypto.randomUUID(), number: 2, title: 'Private episode' };
  const second = newDocument(newEpisode.title, 'screenplay', newEpisode.id);
  const original = { ...project, episodes: [firstEpisode, newEpisode], documents: [project.documents[0], second], modules: { hidden: 'Private plot' } };
  const grant = { email: 'test-writer@example.com', role: 'editor' as const, episodeIds: [firstEpisode.id] };
  const scoped = toVisibleProject(original, grant);
  assert.deepEqual(scoped.episodes.map(episode => episode.id), [firstEpisode.id]);
  assert.deepEqual(scoped.documents.map(document => document.id), [project.documents[0].id]);
  assert.deepEqual(scoped.modules, {});
  assert.throws(() => visibleDocument(original, grant, second.id));
  const revision = { ...scoped, documents: [{ ...scoped.documents[0], title: 'Revised episode' }] };
  const applied = applyProjection(original, revision, grant);
  assert.equal(applied.documents.find(document => document.id === scoped.documents[0].id)?.title, 'Revised episode');
  assert.equal(applied.documents.find(document => document.id === second.id)?.title, 'Private episode');
  assert.deepEqual(applied.modules, original.modules);
});
