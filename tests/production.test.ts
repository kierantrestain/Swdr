import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { newBlock, sceneList } from '../src/model';
import { createProject, resolveSource } from '../src/workspace/project';
import { seedProduction } from '../src/production/seed';
import {
  applyRevision, getProductionPlan, issueScriptSnapshot, previewRevision, scheduleConflicts, sidesFor
} from '../src/production/model';

test('a released production revision preserves reviewed shot and breakdown links and retains omitted sources', () => {
  const original = createProject('The Ferry Record', 'series');
  const document = original.documents[0];
  document.blocks = [
    newBlock('scene', 'INT. FERRY OFFICE - NIGHT'), newBlock('action', 'Nora holds a ticket.'),
    newBlock('scene', 'EXT. FERRY TERMINAL - NIGHT'), newBlock('action', 'The ramp lifts.'),
    newBlock('scene', 'EXT. HARBOUR WALL - DAWN'), newBlock('action', 'Jonah keeps the earlier log.')
  ];
  const project = seedProduction(original, document.id);
  const [office, terminal, harbour] = sceneList(document);
  const plan = getProductionPlan(project, document.id);
  assert(plan);
  const originalRelease = project.snapshots.find(snapshot => snapshot.id === plan.activeSnapshotId);
  assert(originalRelease);
  const previousShot = plan.shots.find(shot => shot.sceneId === office.id);
  assert(previousShot);
  const previousTag = plan.tags.find(tag => tag.sceneId === office.id);
  assert(previousTag);

  const harbourBlocks = document.blocks.slice(harbour.index);
  const revised = { ...document, blocks: [
    harbourBlocks[0], { ...harbourBlocks[1], text: 'Jonah brings the updated ferry log.' }, ...harbourBlocks.slice(2),
    ...document.blocks.slice(office.index, terminal.index),
    newBlock('scene', 'EXT. HARBOUR STREET - DAY'), newBlock('action', 'The crowd waits for the ferry to return.')
  ] };
  const working = { ...project, documents: project.documents.map(item => item.id === revised.id ? revised : item) };
  const incoming = issueScriptSnapshot(working, revised, 'Shooting Draft 2', '2027-01-13T09:00:00Z');
  const withIncoming = { ...working, snapshots: [...working.snapshots, incoming] };
  const review = previewRevision(withIncoming, plan, incoming.id);
  assert(review.previous.some(match => match.scene.id === harbour.id && match.moved && match.edited));
  assert(review.previous.some(match => match.scene.id === terminal.id && !match.suggested));
  assert.equal(review.newCandidates[0]?.heading, 'EXT. HARBOUR STREET - DAY');
  assert.throws(() => applyRevision(withIncoming, document.id, incoming.id, plan.activeSnapshotId, {}), /review the mapping/i);

  const updated = applyRevision(withIncoming, document.id, incoming.id, plan.activeSnapshotId, {
    [office.id]: office.id, [terminal.id]: null, [harbour.id]: harbour.id
  });
  const planAfter = getProductionPlan(updated, document.id);
  assert(planAfter);
  assert.equal(planAfter.activeSnapshotId, incoming.id);
  assert.equal(planAfter.scenes.find(scene => scene.id === terminal.id)?.status, 'omitted');
  assert.equal(planAfter.scenes.find(scene => scene.id === terminal.id)?.source.revisionId, originalRelease.document.revisionId);
  assert.equal(planAfter.shots.find(shot => shot.id === previousShot.id)?.source.revisionId, incoming.document.revisionId);
  const retainedTag = planAfter.tags.find(tag => tag.id === previousTag.id);
  assert.equal(retainedTag?.reviewed, true);
  assert.equal(retainedTag?.source.revisionId, incoming.document.revisionId);
  assert.equal(resolveSource(updated, previousTag.source)?.revisionId, originalRelease.document.revisionId);
  assert(scheduleConflicts(planAfter).some(conflict => conflict.kind === 'source'));
  const sides = sidesFor(updated, planAfter, [harbour.id, terminal.id]);
  assert.equal(sides.length, 1);
  assert(sides[0].blocks.some(block => block.text === 'Jonah brings the updated ferry log.'));
});
