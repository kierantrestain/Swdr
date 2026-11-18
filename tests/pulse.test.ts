import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { newPiece, withCreator } from '../src/creator/model';
import { newBlock } from '../src/model';
import { pitchFacts, pitchOf } from '../src/PitchSheet';
import { projectPulse } from '../src/pulse';
import { assetUsage, sizeOf } from '../src/workspace/media';
import { createProject } from '../src/workspace/project';

test('the pulse measures writing, flags broken formatting and suggests what to do next', () => {
  const project = createProject('Pulse', 'film', 'A ferry captain lies to save her crew. Then the tide turns.');
  const script = project.documents[0];
  script.blocks = [newBlock('scene', 'LIGHTHOUSE'), newBlock('character', 'MARA'), newBlock('action', 'The lamp turns.')];
  const { tiles, steps } = projectPulse(project, script, new Date('2026-11-18T10:00:00Z'));
  assert.equal(tiles.find(tile => tile.id === 'words')?.value, '5');
  assert.equal(tiles.find(tile => tile.id === 'format')?.tone, 'bad');
  assert.match(steps[0].text, /formatting problems? in “/);
  assert.equal(steps[0].target, 'write');
  assert.deepEqual(pitchOf(project).logline, 'A ferry captain lies to save her crew.');
  assert.ok(pitchFacts(project, script).facts.some(([label]) => label === 'Scenes'));
});

test('creator projects get publishing tiles and a cadence warning', () => {
  const base = createProject('Channel', 'creator');
  const late = newPiece('shorts', 'Soon');
  late.publishDate = '2026-11-20';
  late.status = 'scheduled';
  const { tiles, steps } = projectPulse(withCreator(base, { pieces: [late] }), undefined, new Date('2026-11-18T10:00:00Z'));
  assert.equal(tiles.find(tile => tile.id === 'publish')?.value, 'in 2 days');
  assert.ok(steps.some(step => step.target === 'creator' && /publishes in 2 days with \d+ problem/.test(step.text)));
  const quiet = projectPulse(withCreator(base, { pieces: [newPiece('tiktok', 'Idea')] }), undefined, new Date('2026-11-18T10:00:00Z'));
  assert.ok(quiet.steps.some(step => /Nothing is scheduled to publish/.test(step.text)));
});

test('media usage lists where each file is referenced and sizes come from the data', () => {
  const project = createProject('Media', 'film');
  project.assets = [
    { id: 'f0e1d2c3-0000-4000-8000-00000000a001', name: 'cast.jpg', mime: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,QUJDRA==', addedAt: '2026-11-18T00:00:00Z' },
    { id: 'f0e1d2c3-0000-4000-8000-00000000a002', name: 'loose.pdf', mime: 'application/pdf', dataUrl: 'data:application/pdf;base64,QUJD', addedAt: '2026-11-18T00:00:00Z' }
  ];
  project.modules = { production: { people: [{ photoAssetId: 'f0e1d2c3-0000-4000-8000-00000000a001' }] } };
  const usage = assetUsage(project);
  assert.deepEqual(usage.get('f0e1d2c3-0000-4000-8000-00000000a001'), ['Production']);
  assert.deepEqual(usage.get('f0e1d2c3-0000-4000-8000-00000000a002'), []);
  assert.equal(sizeOf(project.assets[0]), 6);
});
