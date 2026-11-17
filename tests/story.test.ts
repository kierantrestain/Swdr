import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { newBlock, newDocument, newId } from '../src/model';
import type { Project } from '../src/model';
import { createProject } from '../src/workspace/project';
import {
  approveCanon, continuityConflicts, getStory, knowledgeStates, queryStory, relationshipStates,
  reviewException, saveCharacter, saveStoryPoint, sceneMatrix, sortStory
} from '../src/story/series-model';
import type { StoryPoint } from '../src/story/series-model';
import {
  editorialRuntime, getEditorial, getEditorialDraft, issueCorrections, issueEditorial, issueManifest,
  OUTPUT_LABELS, renderEditorialOutput, saveClaim, saveEvidence, saveSegment
} from '../src/story/editorial-model';
import type { Output } from '../src/story/editorial-model';
import { exactSource, sourceText } from '../src/story/source';

function projectWithEpisodes(title: string, kind: Project['kind']): Project {
  const project = createProject(title, kind);
  project.episodes = Array.from({ length: 24 }, (_, index) => ({
    id: newId(), title: `Episode ${index + 1}`, number: index % 12 + 1,
    season: Math.floor(index / 12) + 1, synopsis: 'Synthetic testing fixture.'
  }));
  project.documents = project.episodes.map((episode, index) => {
    const document = newDocument(episode.title, 'screenplay', episode.id);
    document.blocks = [
      newBlock('scene', 'INT. CLOCK TOWER - NIGHT'),
      newBlock('action', `Line ${index + 1}: a new record is unsealed.`)
    ];
    return document;
  });
  return project;
}

test('two seasons keep relationship and knowledge states spoiler-safe with exact immutable evidence', () => {
  let project = projectWithEpisodes('Beyond the Harbour', 'series');
  const early = project.documents[0];
  const late = project.documents.at(-1)!;
  const firstSource = exactSource(project, early, early.blocks[1].id);
  const finalSource = exactSource(project, late, late.blocks[1].id);
  const mara = newId();
  const rowan = newId();
  project = saveCharacter(project, {
    id: mara, name: 'Mara Bow', aliases: ['M. Bow'], role: 'Archivist', motivation: 'Record the truth',
    conflict: 'Protects the witness', source: firstSource
  });
  project = saveCharacter(project, {
    id: rowan, name: 'Rowan Ash', aliases: ['R. Ash'], role: 'Guard', motivation: 'Keep the route open',
    conflict: 'Fears the consequences', source: firstSource
  });
  const earlyEvent: StoryPoint = {
    id: newId(), kind: 'event', title: 'A sealed record', detail: 'The first reveal.',
    participants: [mara], source: firstSource, storyOrder: 15
  };
  const flashback: StoryPoint = {
    id: newId(), kind: 'event', title: 'The hidden record', detail: 'The later-revealed flashback.',
    participants: [mara], source: finalSource, storyOrder: 5, causeId: earlyEvent.id
  };
  const interaction: StoryPoint = {
    id: newId(), kind: 'interaction', title: 'Guard returns the key', detail: 'Both characters speak.',
    participants: [mara, rowan], source: finalSource, storyOrder: 40
  };
  for (const point of [
    earlyEvent, flashback, interaction,
    { ...earlyEvent, id: newId(), kind: 'appearance' as const, participants: [mara] },
    { ...earlyEvent, id: newId(), kind: 'appearance' as const, participants: [rowan] },
    { ...earlyEvent, id: newId(), kind: 'relationship' as const, participants: [mara, rowan], relationship: 'Trust' as const },
    { ...earlyEvent, id: newId(), kind: 'knowledge' as const, knowledge: 'Unresolved' as const, factKey: 'key location' },
    { ...interaction, id: newId(), kind: 'relationship' as const, relationship: 'Conflict' as const },
    { ...interaction, id: newId(), kind: 'knowledge' as const, participants: [mara], knowledge: 'Confirmed' as const, factKey: 'key location' }
  ]) project = saveStoryPoint(project, point);
  const conflict = continuityConflicts(getStory(project).draft.points).find(item => item.records.some(point => point.id === flashback.id));
  assert(conflict);
  project = reviewException(project, conflict.id, 'The untrustworthy narrator intentionally reverses the cause.');
  project = approveCanon(project, 'Canon locked for directors');
  const canon = getStory(project).canon[0];
  assert.equal(project.episodes.length, 24);
  assert.equal(new Set(project.episodes.map(episode => episode.season)).size, 2);

  const first = queryStory(project, canon.data, { asOfId: project.episodes[0].id });
  assert.deepEqual(relationshipStates(project, first.points).map(point => point.relationship), ['Trust']);
  assert.deepEqual(knowledgeStates(project, first.points).map(point => point.knowledge), ['Unresolved']);
  assert.equal(sceneMatrix(first.points)[0].appearances.length, 2);
  assert.equal(sceneMatrix(first.points)[0].interactions.length, 0);
  assert.equal(first.exceptions.length, 0);
  const earlyScope = JSON.stringify(first);
  assert(!earlyScope.includes(flashback.title));
  assert(!earlyScope.includes(finalSource.revisionId));

  const latest = queryStory(project, canon.data, { asOfId: project.episodes[23].id });
  assert.deepEqual(relationshipStates(project, latest.points).map(point => point.relationship), ['Conflict']);
  assert.deepEqual(knowledgeStates(project, latest.points).map(point => point.knowledge), ['Confirmed']);
  const events = latest.points.filter(point => point.kind === 'event');
  assert.deepEqual(sortStory(project, events, 'story').map(point => point.id), [flashback.id, earlyEvent.id]);
  assert.deepEqual(sortStory(project, events, 'reveal').map(point => point.id), [earlyEvent.id, flashback.id]);
  assert.equal(latest.exceptions[0]?.reason, 'The untrustworthy narrator intentionally reverses the cause.');
  assert.equal(sourceText(project, latest.points.find(point => point.id === interaction.id)!.source), 'Line 24: a new record is unsealed.');
  assert(queryStory(project, canon.data, { season: 1 }).points.every(point => point.source.episodeId === project.episodes[0].id));

  project = saveStoryPoint(project, { ...interaction, title: 'A new working draft interaction' });
  assert.equal(getStory(project).canon[0].data.points.find(point => point.id === interaction.id)?.title, interaction.title);
});

test('twenty-four factual episodes issue four reproducible outputs and flag a shared claim correction', () => {
  let project = projectWithEpisodes('Tracks in the Snow', 'documentary');
  project = saveEvidence(project, {
    title: 'Synthetic public register', url: 'https://example.com/fictional-register', locator: 'Fictional entry 5',
    notes: 'QA fixture', status: 'Verified'
  });
  const evidence = getEditorial(project).evidence[0];
  project = saveClaim(project, { text: 'The inspection occurred in January.', evidenceIds: [evidence.id], status: 'Verified' });
  const claim = getEditorial(project).claims[0];
  for (const [index, document] of project.documents.entries()) {
    const minutes = 60 + (index * 7) % 41;
    project = saveSegment(project, document.id, {
      id: newId(), title: `Act ${index + 1}`, purpose: 'Test the source against the timeline.', kind: 'Host discussion',
      seconds: minutes * 60, points: ['Check the original entry.'], questions: ['Who was responsible?'],
      counterarguments: ['The signature may have been recorded later.'], evidenceIds: [evidence.id], claimIds: [claim.id],
      cues: [{ id: newId(), title: 'Register overlay', type: 'Graphic', specification: 'Highlight entry 5.', status: 'Draft' }]
    });
  }
  const runTimes = project.documents.map(document => editorialRuntime(getEditorialDraft(getEditorial(project), document.id).segments));
  assert.equal(runTimes.length, 24);
  assert(runTimes.every(seconds => seconds >= 3600 && seconds <= 6000));

  const firstId = project.documents[0].id;
  const lastId = project.documents.at(-1)!.id;
  project = issueEditorial(project, firstId);
  project = issueEditorial(project, lastId);
  const initial = getEditorial(project).issues;
  const outputs = Object.keys(OUTPUT_LABELS) as Output[];
  const issuedFiles = outputs.map(output => renderEditorialOutput(initial[0], output));
  assert.equal(issuedFiles.length, 4);
  assert(issuedFiles.every(file => file.includes(initial[0].draft.revisionId) && file.includes(initial[0].source.revisionId)));
  assert(issuedFiles[0].includes('The inspection occurred in January.'));
  const manifest = issueManifest(initial[0]);
  assert.equal(manifest.segments[0].source.revisionId, manifest.source.revisionId);
  assert.equal(manifest.segments[0].source.segmentId, initial[0].draft.segments[0].id);
  assert.equal(issueCorrections(getEditorial(project), initial[0]).length, 0);

  project = saveClaim(project, { text: 'The inspection occurred in February.', evidenceIds: [evidence.id], status: 'Verified' },
    claim.id, 'Corrected the calendar entry.');
  const corrected = getEditorial(project);
  for (const issue of initial) assert.deepEqual(issueCorrections(corrected, issue), ['The inspection occurred in February.']);
  assert.deepEqual(outputs.map(output => renderEditorialOutput(corrected.issues[0], output)), issuedFiles);

  project = issueEditorial(project, firstId);
  const reissue = getEditorial(project).issues.at(-1)!;
  assert.equal(reissue.number, 2);
  assert(renderEditorialOutput(reissue, 'research').includes('The inspection occurred in February.'));
  assert.equal(issueCorrections(getEditorial(project), reissue).length, 0);
});
