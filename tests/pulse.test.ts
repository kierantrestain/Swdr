import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { newPiece, withCreator } from '../src/creator/model';
import { newBlock } from '../src/model';
import { pitchFacts, pitchOf } from '../src/PitchSheet';
import { dailyBrief, projectPulse, scoreStep, urgency } from '../src/pulse';
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

test('the daily brief ranks by impact and urgency, and favours quick wins', () => {
  const now = new Date('2026-11-18T10:00:00Z');
  assert.ok(scoreStep('blocker', 10, 1) > scoreStep('blocker', 10, 60), 'a blocker tomorrow outranks the same blocker in two months');
  assert.ok(scoreStep('blocker', 30) > scoreStep('risk', 10), 'a blocker outranks a risk with no date');
  assert.ok(scoreStep('risk', 10, 3) > scoreStep('risk', 10), 'a risk this week outranks an undated one');
  assert.ok(scoreStep('upkeep', 1) > scoreStep('upkeep', 20), 'a one-minute chore beats a long one of equal weight');
  assert.equal(urgency(undefined), 1);
  assert.equal(urgency(0), 2);

  const project = createProject('Brief', 'film');
  const script = project.documents[0];
  script.blocks = [newBlock('scene', 'LIGHTHOUSE'), newBlock('character', 'MARA'), newBlock('action', 'The lamp turns.')];
  const { steps } = projectPulse(project, script, now);
  const format = steps.find(item => item.id === 'format')!;
  assert.equal(format.impact, 'risk', 'unreleased scripts carry formatting as a risk, not a blocker');
  assert.ok(format.why.length > 20 && format.minutes > 0);
  for (let index = 1; index < steps.length; index++) assert.ok(steps[index - 1].score >= steps[index].score, 'steps come in score order');

  const brief = dailyBrief(steps);
  assert.equal(brief.focus?.id, steps[0].id);
  assert.equal(brief.then.length, steps.length - 1);
  assert.match(brief.summary, /^\d+ things? needs? you · .*about \d+ minutes$/);
  assert.equal(dailyBrief([]).summary, 'Nothing needs you today.');
});
