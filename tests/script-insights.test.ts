import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { newBlock, newDocument } from '../src/model';
import type { BlockKind } from '../src/model';
import { castVoices, characterName, formatIssues, parseHeading, scriptReport, tableReadLines } from '../src/writing/script-insights';

function script(lines: Array<[BlockKind, string]>) {
  const document = newDocument('Test', 'screenplay');
  document.blocks = lines.map(([kind, text], index) => ({ ...newBlock(kind, text), id: `b${index}`, ...(kind === 'scene' ? { sceneNumber: String(lines.slice(0, index + 1).filter(([k]) => k === 'scene').length) } : {}) }));
  return document;
}

const sample = script([
  ['scene', 'INT. LIGHTHOUSE - NIGHT'],
  ['action', 'Rain lashes the glass.'],
  ['character', 'MARA'],
  ['dialogue', 'Keep the lamp lit.'],
  ['character', 'ELIAS (V.O.)'],
  ['parenthetical', '(quietly)'],
  ['dialogue', 'Always.'],
  ['scene', 'EXT. HARBOUR - DAY'],
  ['character', "MARA (CONT'D)"],
  ['dialogue', 'The boats are back early today.'],
  ['transition', 'CUT TO:']
]);

test('character names drop extensions and headings split into setting, location and time', () => {
  assert.equal(characterName("Mara (CONT'D)"), 'MARA');
  assert.equal(characterName('ELIAS (V.O.)'), 'ELIAS');
  assert.deepEqual(parseHeading('INT./EXT. CAR - MOVING - NIGHT'), { setting: 'INT/EXT', location: 'CAR - MOVING', time: 'NIGHT' });
  assert.deepEqual(parseHeading('EXT. HARBOUR - DAY'), { setting: 'EXT', location: 'HARBOUR', time: 'DAY' });
});

test('the report counts dialogue per character across scenes', () => {
  const report = scriptReport(sample);
  assert.equal(report.scenes, 2);
  assert.deepEqual(report.characters.map(item => [item.name, item.speeches, item.words, item.scenes, item.firstScene]), [
    ['MARA', 2, 10, 2, '1'], ['ELIAS', 1, 1, 1, '1']
  ]);
  assert.equal(report.settings.INT, 1);
  assert.equal(report.settings.EXT, 1);
  assert.deepEqual(report.locations.map(item => item.name).sort(), ['HARBOUR', 'LIGHTHOUSE']);
  assert.ok(report.pages >= 1);
});

test('formatting checks flag broken structure and likely misspelt names', () => {
  const broken = script([
    ['scene', 'LIGHTHOUSE'],
    ['character', 'MARA'],
    ['dialogue', 'One.'],
    ['character', 'MARA'],
    ['dialogue', 'Two.'],
    ['character', 'MARRA'],
    ['dialogue', 'Three.'],
    ['character', 'ELIAS'],
    ['action', 'He says nothing.'],
    ['dialogue', 'Orphan line.'],
    ['parenthetical', 'beat'],
    ['transition', 'CUT TO']
  ]);
  const messages = formatIssues(broken).map(issue => issue.message);
  assert.ok(messages.some(message => /no INT\. or EXT\./.test(message)));
  assert.ok(messages.some(message => /no time of day/.test(message)));
  assert.ok(messages.includes('ELIAS has no dialogue'));
  assert.ok(messages.includes('Dialogue without a character cue'));
  assert.ok(messages.some(message => /missing its brackets/.test(message)));
  assert.ok(messages.some(message => /should end with a colon/.test(message)));
  assert.ok(messages.some(message => /MARRA appears 1× — did you mean MARA\?/.test(message)));
  assert.deepEqual(formatIssues(sample), []);
});

test('the table read gives dialogue to its speaker and everything else to the narrator', () => {
  const lines = tableReadLines(sample, { headings: true, action: true, cues: false, parentheticals: false });
  assert.deepEqual(lines.map(line => [line.speaker ?? 'narrator', line.text]), [
    ['narrator', 'Interior. LIGHTHOUSE - NIGHT'], ['narrator', 'Rain lashes the glass.'], ['MARA', 'Keep the lamp lit.'],
    ['ELIAS', 'Always.'], ['narrator', 'Exterior. HARBOUR - DAY'], ['MARA', 'The boats are back early today.'], ['narrator', 'CUT TO:']
  ]);
  const fromScene2 = tableReadLines(sample, { headings: false, action: false, cues: false, parentheticals: false, fromBlockId: 'b7' });
  assert.deepEqual(fromScene2.map(line => line.text), ['The boats are back early today.']);
  assert.deepEqual(castVoices(['MARA', 'ELIAS', 'NORA'], ['A', 'B', 'C'], 'A'), { MARA: 'B', ELIAS: 'C', NORA: 'B' });
});
