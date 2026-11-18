import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { newBlock, sceneList } from '../src/model';
import { createProject } from '../src/workspace/project';
import { seedProduction } from '../src/production/seed';
import {
  callSheetCsv, castNumbers, dayOutOfDays, dayStrips, estimateEighths, getProductionPlan, orderedDays, placeStrip, previewCallSheet,
  sceneSetting, scriptChanges
} from '../src/production/model';

function fixture() {
  const original = createProject('The Ferry Record', 'series');
  const document = original.documents[0];
  document.blocks = [
    newBlock('scene', 'INT. FERRY OFFICE - NIGHT'), newBlock('action', 'Nora holds a ticket.'),
    newBlock('character', 'NORA'), newBlock('dialogue', 'Tell me which boat.'),
    newBlock('scene', 'EXT. FERRY TERMINAL - NIGHT'), newBlock('action', 'The ramp lifts.'),
    newBlock('scene', 'EXT. HARBOUR WALL - DAWN'), newBlock('action', 'Jonah keeps the earlier log.'),
    newBlock('scene', 'INT./EXT. FERRY DECK - DAY'), newBlock('action', 'Spray over the rail.')
  ];
  const project = seedProduction(original, document.id);
  const plan = getProductionPlan(project, document.id);
  assert(plan);
  return { project, document, plan };
}

test('scene headings split into stripboard setting, set and colour tone', () => {
  assert.deepEqual(sceneSetting('INT. FERRY OFFICE – NIGHT'), { interior: 'INT', time: 'NIGHT', set: 'FERRY OFFICE', tone: 'int-night' });
  assert.deepEqual(sceneSetting('EXT. HARBOUR WALL - DAWN'), { interior: 'EXT', time: 'DAWN', set: 'HARBOUR WALL', tone: 'ext-day' });
  assert.equal(sceneSetting('INT./EXT. CAR - MOVING - DUSK').set, 'CAR - MOVING');
  assert.equal(sceneSetting('INT./EXT. CAR - MOVING - DUSK').tone, 'ext-night');
  assert.equal(sceneSetting('int. kitchen - day').tone, 'int-day');
  assert.equal(sceneSetting('MONTAGE').interior, '');
});

test('page eighths are estimated from screenplay blocks', () => {
  assert.equal(estimateEighths([]), 0);
  assert.equal(estimateEighths([newBlock('scene', 'INT. ROOM - DAY')]), 1);
  const page = Array.from({ length: 27 }, (_, index) => newBlock('action', `Line ${index}`));
  assert.equal(estimateEighths(page), 8);
});

test('cast ID numbers stay consistent across the directory and day out of days', () => {
  const { plan } = fixture();
  const ids = castNumbers(plan);
  const cast = plan.people.filter(person => person.type === 'Cast');
  assert.deepEqual(cast.map(person => ids.get(person.id)), [1, 2, 3]);
  assert(!plan.people.some(person => person.type === 'Crew' && ids.has(person.id)));
  assert.deepEqual(dayOutOfDays(plan).rows.map(row => ids.get(row.person.id)), [1, 2, 3]);
});

test('placing strips reorders, moves, schedules and unschedules with a back-to-back running order', () => {
  const { plan } = fixture();
  const [first, second] = orderedDays(plan);
  const [office, terminal] = dayStrips(plan, first.id);
  assert.deepEqual([office.startTime, terminal.startTime], ['15:00', '16:30']);

  const closed = placeStrip(plan, { stripId: office.id, sceneId: office.sceneId }, second.id, 0);
  assert.deepEqual(dayStrips(closed, first.id).map(strip => [strip.id, strip.startTime]), [[terminal.id, '15:00']]);
  assert.equal(dayStrips(closed, second.id)[0].id, office.id);
  assert.equal(dayStrips(closed, second.id)[0].startTime, '08:00');

  const swapped = placeStrip(plan, { stripId: terminal.id, sceneId: terminal.sceneId }, first.id, 0);
  assert.deepEqual(dayStrips(swapped, first.id).map(strip => [strip.id, strip.startTime]), [[terminal.id, '15:00'], [office.id, '15:45']]);

  const moved = placeStrip(swapped, { stripId: office.id, sceneId: office.sceneId }, second.id, 1);
  assert.deepEqual(dayStrips(moved, second.id).map(strip => [strip.sceneId, strip.startTime]), [
    [plan.strips.find(strip => strip.dayId === second.id)!.sceneId, '08:00'], [office.sceneId, '08:45']
  ]);
  assert.equal(dayStrips(moved, first.id).length, 1);

  const pooled = placeStrip(moved, { stripId: office.id, sceneId: office.sceneId }, null, 0);
  assert(!pooled.strips.some(strip => strip.id === office.id));
  const deck = plan.scenes[3];
  assert(!pooled.strips.some(strip => strip.sceneId === deck.id));

  const scheduled = placeStrip(pooled, { sceneId: deck.id }, first.id, 0, 6);
  const added = dayStrips(scheduled, first.id)[0];
  assert.equal(added.sceneId, deck.id);
  assert.equal(added.eighths, 6);
  assert.equal(added.minutes, 60);
  assert.equal(added.startTime, '15:00');
  assert.deepEqual(added.source, deck.source);

  const late = { ...scheduled, strips: scheduled.strips.map(strip => strip.id === added.id ? { ...strip, minutes: 600 } : strip) };
  assert.throws(() => placeStrip(late, { stripId: terminal.id, sceneId: terminal.sceneId }, first.id, 0), /before midnight/);
  assert.throws(() => placeStrip(plan, { stripId: 'missing', sceneId: office.sceneId }, first.id, 0), /no longer on the schedule/);
});

test('script changes after release flag edited and removed production scenes', () => {
  const { project, document, plan } = fixture();
  assert.deepEqual(scriptChanges(project, plan, document), []);
  const [office, terminal] = sceneList(document);
  const officeBlocks = document.blocks.slice(office.index, terminal.index);
  const revised = {
    ...document,
    blocks: [
      ...officeBlocks.slice(0, 2), newBlock('character', 'ELIAS (V.O.)'), newBlock('dialogue', 'The last boat left an hour ago.'),
      ...document.blocks.slice(sceneList(document)[2].index)
    ]
  };
  const changes = scriptChanges(project, plan, revised);
  const edited = changes.find(change => change.sceneId === office.id);
  assert.equal(edited?.status, 'edited');
  assert.deepEqual(edited?.charactersAdded, ['ELIAS']);
  assert.deepEqual(edited?.charactersRemoved, ['NORA']);
  assert.equal(edited?.headingAfter, undefined);
  assert.equal(changes.find(change => change.sceneId === terminal.id)?.status, 'removed');
  assert.equal(changes.length, 2);
});

test('call sheets carry cast IDs, setting, pages, day count and safety details into the export', () => {
  const { project, plan } = fixture();
  const [first] = orderedDays(plan);
  const sheet = previewCallSheet(project, plan, first.id);
  assert.equal(sheet.dayNumber, 1);
  assert.equal(sheet.dayCount, 2);
  assert.match(sheet.hospital ?? '', /North Shore General/);
  assert.deepEqual(sheet.scenes[0].castIds, [1, 2]);
  assert.equal(sheet.scenes[0].setting, 'INT · NIGHT');
  assert.equal(sheet.scenes[0].eighths, 10);
  assert.deepEqual(sheet.recipients.map(person => [person.name, person.type, person.castId]), [
    ['Nora', 'Cast', 1], ['Elias', 'Cast', 2], ['Ari Bell', 'Crew', undefined]
  ]);
  const csv = callSheetCsv(sheet);
  assert.match(csv, /"Date","2027-01-18","Day 1 of 2"/);
  assert.match(csv, /"15:00","1","INT\. FERRY OFFICE - NIGHT","INT · NIGHT","1 2\/8","1 2"/);
  assert.match(csv, /"Nearest hospital","North Shore General/);
});
