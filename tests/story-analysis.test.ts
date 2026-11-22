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

test('character portraits, arc progression stages, script scanning and spoiler-safe AI context stay connected', async () => {
  const { characterArcStages, characterSummaryStats, resolveCharacterPhoto, scanSeriesScripts } = await import('../src/story/series-analysis');
  const { aiContext } = await import('../src/ai/context');

  const nora = store.draft.characters.find(person => person.name === 'Nora Vale')!;
  assert.equal(resolveCharacterPhoto(series, nora), '/portraits/nora-vale.jpg');
  const stats = characterSummaryStats(series, store.draft, nora.id);
  assert(stats.records > 10 && stats.arcMilestones >= 3 && stats.relationships >= 4);

  const stages = characterArcStages(series, store.draft.points.filter(point => point.participants.includes(nora.id)));
  assert.equal(stages[0].stageLabel, 'Setup');
  assert.equal(stages.at(-1)!.stageLabel, 'Resolution');
  const canonStages = characterArcStages(series, store.canon[0].data.points.filter(point => point.participants.includes(nora.id)));
  assert.equal(canonStages.at(-1)!.stageLabel, 'Choice');

  // Scanning scripts finds unrecorded speaking characters with exact line citations.
  const withNewSpeaker: Project = {
    ...series,
    documents: series.documents.map((doc, idx) => idx === 0
      ? { ...doc, blocks: [...doc.blocks, newBlock('character', 'CAPTAIN REID'), newBlock('dialogue', 'We never cancelled that crossing.')] }
      : doc)
  };
  const scan = scanSeriesScripts(withNewSpeaker, store.draft);
  assert(scan.newCharacters.some(item => item.name === 'Captain Reid' && item.source.blockId), 'unrecorded speaking character discovered with citation');

  // Spoiler-safe AI context respects the current episode cutoff.
  const ep3Context = aiContext(series, series.documents[2]);
  assert(ep3Context.includes('Series Intelligence — Characters'));
  assert(ep3Context.includes('Jonah Price'));
  assert(!ep3Context.includes('Elias Crowe'), 'future character Elias must stay hidden in S1E03 AI context');
  const ep4Context = aiContext(series, series.documents[3]);
  assert(ep4Context.includes('Elias Crowe'), 'Elias enters AI context once introduced in S1E04');
});

test('film projects use 3-act sequence bucketing for 91-scene features, film billings, act balance checks and scene-level spoiler safety', async () => {
  const { isStoryProject, storyStructure } = await import('../src/story/story-profile');
  const { scanProjectScripts, scriptDiscoveryPreview, storyChecks } = await import('../src/story/series-analysis');
  const { saveCharacter, saveStoryPoint } = await import('../src/story/series-model');
  const { aiContext } = await import('../src/ai/context');
  const { sceneList } = await import('../src/model');

  let film = createProject('The Prediction Engine', 'film');
  assert.equal(isStoryProject(film), true);
  const doc = film.documents[0];
  const blocks = [];
  for (let i = 1; i <= 91; i += 1) {
    blocks.push(newBlock('scene', i % 2 === 1 ? `INT. LAB ${i} - DAY` : `EXT. CITY STREET ${i} - NIGHT`));
    blocks.push(newBlock('action', `Beat ${i} unfolds.`));
    blocks.push(newBlock('character', 'DR. ARIS'));
    blocks.push(newBlock('dialogue', `Model run ${i} confirms the anomaly.`));
    if (i <= 40 || i >= 70) {
      blocks.push(newBlock('character', 'MAYA'));
      blocks.push(newBlock('dialogue', `Then we pull the plug on run ${i}.`));
    }
    if (i >= 75) {
      blocks.push(newBlock('character', 'DIRECTOR VANCE'));
      blocks.push(newBlock('dialogue', `The board authorised phase ${i}.`));
    }
  }
  doc.blocks = blocks;

  const structure = storyStructure(film, doc.id);
  assert.equal(structure.mode, 'script');
  assert.equal(structure.terms.workspaceTitle, 'Film Intelligence');
  assert.equal(structure.terms.canonLabel, 'Film canon');
  assert.equal(structure.scenes.length, 91);
  assert.deepEqual(structure.groups.map(g => g.label), ['Act I', 'Act II', 'Act III']);
  assert.equal(structure.bucketed, true, '91-scene feature should bucket into Sequences rather than 91 columns');
  assert(structure.units.length >= 9 && structure.units.length <= 18, `expected 9..18 sequences, got ${structure.units.length}`);

  const preview = scriptDiscoveryPreview(film, doc.id);
  assert.equal(preview.scenes, 91);
  assert.equal(preview.speakingRoles, 3);
  assert(preview.sharedPairs >= 2);

  const scan = scanProjectScripts(film, getStory(film).draft, doc.id);
  assert.equal(scan.newCharacters.length, 3);
  assert.equal(scan.newCharacters[0].name, 'Dr. Aris');
  assert.equal(scan.newCharacters[0].suggestedBilling, 'Lead');
  assert(scan.suggestedLinks.some(link => link.aName === 'Dr. Aris' && link.bName === 'Maya' && link.sharedScenes >= 50));

  // Save Lead (Scene 1) and Act III antagonist (Scene 76) and verify scene-level spoiler safety & Act balance check.
  const scenes = sceneList(doc);
  const sc1Block = doc.blocks[scenes[0].index + 2].id;
  const sc76Block = doc.blocks[scenes[75].index + 4].id;
  const arisId = newId();
  const vanceId = newId();
  film = saveCharacter(film, {
    id: arisId, name: 'Dr. Aris', aliases: ['ARIS'], role: 'Lead', bio: '', motivation: 'Stop the rogue forecast', conflict: 'Built the model',
    source: exactSource(film, film.documents[0], sc1Block)
  });
  film = saveCharacter(film, {
    id: vanceId, name: 'Director Vance', aliases: ['VANCE'], role: 'Supporting', bio: '', motivation: 'Keep the engine live', conflict: 'Public oversight',
    source: exactSource(film, film.documents[0], sc76Block)
  });
  // Record 4 events solely in Act I and Act III (leaving Act II empty) to trigger act-balance check.
  for (const [idx, sIdx] of [0, 3, 75, 85].entries()) {
    const lineId = film.documents[0].blocks[scenes[sIdx].index + 3].id;
    film = saveStoryPoint(film, {
      id: newId(), kind: 'event', title: `Major Beat ${idx + 1}`, detail: '',
      participants: [arisId], storyOrder: idx + 1,
      source: exactSource(film, film.documents[0], lineId)
    });
  }

  const draft = getStory(film).draft;
  const earlyView = queryStory(film, draft, { asOfId: scenes[4].id, documentId: doc.id });
  assert(earlyView.characters.some(c => c.id === arisId));
  assert(!earlyView.characters.some(c => c.id === vanceId), 'Act III character must stay hidden as of Scene 5');

  const act3Only = queryStory(film, draft, { season: 3, documentId: doc.id });
  assert(act3Only.characters.some(c => c.id === vanceId));

  const filmChecks = storyChecks(film, draft, storyStructure(film, doc.id).units, doc.id);
  assert(filmChecks.some(check => check.kind === 'act-balance' && check.title.includes('Act II')), 'should warn when Act II has no recorded major beats');

  const earlyAi = aiContext(film, film.documents[0], { blockId: sc1Block });
  assert(earlyAi.includes('Film Intelligence — Characters (spoiler-safe as of Act I · Sc 1)'));
  assert(earlyAi.includes('Dr. Aris'));
  assert(!earlyAi.includes('Director Vance'), 'Scene 1 AI context must stay spoiler-safe and hide Act III character');
});

test('stage plays honour explicit Act breaks, flag quick-change turnarounds and identify repertory doubling pairs', async () => {
  const { storyStructure } = await import('../src/story/story-profile');
  const { scanProjectScripts, stageDoublingAnalysis, storyChecks } = await import('../src/story/series-analysis');
  const { saveCharacter, saveStoryPoint } = await import('../src/story/series-model');
  const { sceneList } = await import('../src/model');

  let play = createProject('The Glass Parlour', 'stage');
  const doc = play.documents[0];
  doc.blocks = [
    newBlock('act', 'ACT I'),
    newBlock('scene', 'INT. PARLOUR - EVENING'),
    newBlock('character', 'CLARA'),
    newBlock('dialogue', 'Light the lamps before the bell.'),
    newBlock('character', 'PORTER'),
    newBlock('dialogue', 'The coach is at the gate.'),
    newBlock('scene', 'EXT. COURTYARD - NIGHT'),
    newBlock('character', 'CLARA'),
    newBlock('dialogue', 'Wait in the rain — I heard footsteps.'),
    newBlock('act', 'INTERMISSION'),
    newBlock('act', 'ACT II'),
    newBlock('scene', 'INT. CONSERVATORY - MORNING'),
    newBlock('character', 'CLARA'),
    newBlock('dialogue', 'The glass has cracked overnight.'),
    newBlock('character', 'JUDGE'),
    newBlock('dialogue', 'We begin the inquiry now.')
  ];

  const structure = storyStructure(play, doc.id);
  assert.equal(structure.mode, 'script');
  assert.equal(structure.explicitActs, true);
  assert.equal(structure.bucketed, false);
  assert.equal(structure.terms.workspaceTitle, 'Stage Intelligence');
  assert.deepEqual(structure.groups.map(g => g.label), ['Act I', 'Act II']);
  assert.deepEqual(structure.units.map(u => u.code), ['I.1', 'I.2', 'II.1']);

  const scan = scanProjectScripts(play, getStory(play).draft, doc.id);
  assert.equal(scan.newCharacters[0].name, 'Clara');
  assert.equal(scan.newCharacters[0].suggestedBilling, 'Principal');

  const scenes = sceneList(doc);
  const claraId = newId();
  const porterId = newId();
  const judgeId = newId();
  const blockIn = (sceneIdx: number, speaker: string) => {
    const start = scenes[sceneIdx].index;
    const end = scenes[sceneIdx + 1]?.index ?? doc.blocks.length;
    return doc.blocks.slice(start, end).find(b => b.kind === 'character' && b.text === speaker)!.id;
  };

  play = saveCharacter(play, { id: claraId, name: 'Clara', aliases: ['CLARA'], role: 'Principal', bio: '', motivation: 'Hold the estate together', conflict: 'Hiding the will', source: exactSource(play, play.documents[0], blockIn(0, 'CLARA')) });
  play = saveCharacter(play, { id: porterId, name: 'Porter', aliases: ['PORTER'], role: 'Ensemble', bio: '', motivation: 'Keep watch at the gate', conflict: 'Bribed by the heirs', source: exactSource(play, play.documents[0], blockIn(0, 'PORTER')) });
  play = saveCharacter(play, { id: judgeId, name: 'Judge', aliases: ['JUDGE'], role: 'Featured', bio: '', motivation: 'Settle the estate', conflict: 'Old debt to Clara', source: exactSource(play, play.documents[0], blockIn(2, 'JUDGE')) });

  // Clara appears in I.1 (Parlour), I.2 (Courtyard -> same-act location jump!), and II.1 (Conservatory -> across intermission).
  play = saveStoryPoint(play, { id: newId(), kind: 'appearance', title: 'Clara in Parlour', detail: '', participants: [claraId], storyOrder: 1, source: exactSource(play, play.documents[0], blockIn(0, 'CLARA')) });
  play = saveStoryPoint(play, { id: newId(), kind: 'appearance', title: 'Clara in Courtyard', detail: '', participants: [claraId], storyOrder: 2, source: exactSource(play, play.documents[0], blockIn(1, 'CLARA')) });
  play = saveStoryPoint(play, { id: newId(), kind: 'appearance', title: 'Clara in Conservatory', detail: '', participants: [claraId], storyOrder: 3, source: exactSource(play, play.documents[0], blockIn(2, 'CLARA')) });
  play = saveStoryPoint(play, { id: newId(), kind: 'appearance', title: 'Porter in Parlour', detail: '', participants: [porterId], storyOrder: 1, source: exactSource(play, play.documents[0], blockIn(0, 'PORTER')) });
  play = saveStoryPoint(play, { id: newId(), kind: 'appearance', title: 'Judge in Conservatory', detail: '', participants: [judgeId], storyOrder: 3, source: exactSource(play, play.documents[0], blockIn(2, 'JUDGE')) });

  const draft = getStory(play).draft;
  const playChecks = storyChecks(play, draft, storyStructure(play, doc.id).units, doc.id);
  const turnarounds = playChecks.filter(check => check.kind === 'turnaround');
  assert.equal(turnarounds.length, 1, 'should flag exactly 1 same-act quick-change (I.1 -> I.2) and ignore intermission break (I.2 -> II.1)');
  assert(turnarounds[0].title.includes('Clara'));

  const doubling = stageDoublingAnalysis(play, draft, doc.id);
  assert.equal(doubling.loads.find(l => l.character.id === claraId)?.totalScenes, 3);
  assert(doubling.doublingPairs.some(pair =>
    (pair.a.id === porterId && pair.b.id === judgeId) || (pair.a.id === judgeId && pair.b.id === porterId)
  ), 'Porter (Act I only) and Judge (Act II only) should be recommended as a clean repertory doubling pair');
});

test('documentary projects expose Story Intelligence alongside Editorial in both episodic and single-film modes', async () => {
  const { sectionsFor, storyLabel } = await import('../src/shell/routes');
  const { storyStructure } = await import('../src/story/story-profile');

  assert.equal(sectionsFor(factual).story, true);
  assert.equal(sectionsFor(factual).editorial, true);
  assert.equal(storyLabel(factual), 'Story Intelligence');
  assert.equal(storyStructure(factual).mode, 'episodic');

  const featureDoc = createProject('Ice Core', 'documentary');
  featureDoc.documents[0].blocks = Array.from({ length: 8 }, (_, idx) => newBlock('scene', `EXT. GLACIER ${idx + 1} - DAY`));
  assert.equal(storyStructure(featureDoc).mode, 'script');
  assert.equal(storyStructure(featureDoc).groups.length, 3);
});

test('bidirectional and asymmetric relationships, unified characterConnections, deletion, and cached storyStructure work together', async () => {
  const { characterConnections, allPairConnections } = await import('../src/story/series-analysis');
  const {
    approveCanon, continuityConflicts, deleteCharacter, deleteStoryPoint, saveCharacter, saveStoryPoint
  } = await import('../src/story/series-model');
  const { storyStructure } = await import('../src/story/story-profile');

  let film = createProject('Harbour Line', 'film');
  const doc = film.documents[0];
  doc.blocks = [
    newBlock('scene', 'INT. DOCK OFFICE - DAY'),
    newBlock('character', 'MARA'),
    newBlock('dialogue', 'Keep the manifest locked.'),
    newBlock('character', 'JONAH'),
    newBlock('dialogue', 'I already sent a copy.'),
    newBlock('character', 'LEAH'),
    newBlock('dialogue', 'Not to the harbourmaster.'),
    newBlock('scene', 'EXT. PIER - NIGHT'),
    newBlock('character', 'MARA'),
    newBlock('dialogue', 'Where is Leah?'),
    newBlock('character', 'JONAH'),
    newBlock('dialogue', 'Gone.')
  ];

  // StoryStructure WeakMap cache returns the exact same object for the same immutable Project
  const s1 = storyStructure(film, doc.id);
  const s2 = storyStructure(film, doc.id);
  assert.equal(s1, s2);

  const maraId = newId();
  const jonahId = newId();
  const leahId = newId();
  const maraSrc = exactSource(film, doc, doc.blocks[1].id);
  const jonahSrc = exactSource(film, doc, doc.blocks[3].id);
  const leahSrc = exactSource(film, doc, doc.blocks[5].id);

  film = saveCharacter(film, { id: maraId, name: 'Mara', role: 'Lead', motivation: '', conflict: '', aliases: ['MARA'], source: maraSrc });
  film = saveCharacter(film, { id: jonahId, name: 'Jonah', role: 'Partner', motivation: '', conflict: '', aliases: ['JONAH'], source: jonahSrc });
  film = saveCharacter(film, { id: leahId, name: 'Leah', role: 'Clerk', motivation: '', conflict: '', aliases: ['LEAH'], source: leahSrc });

  // Asymmetric directed relationship at the SAME storyOrder: Mara -> Jonah: Trust, Jonah -> Mara: Betrayal
  const pAB = newId();
  const pBA = newId();
  film = saveStoryPoint(film, {
    id: pAB, kind: 'relationship', title: 'Mara trusts Jonah with the manifest', detail: '',
    participants: [maraId, jonahId], direction: 'directed', bond: 'Partner', relationship: 'Trust',
    storyOrder: 10, source: jonahSrc
  });
  film = saveStoryPoint(film, {
    id: pBA, kind: 'relationship', title: 'Jonah secretly betrays Mara', detail: '',
    participants: [jonahId, maraId], direction: 'directed', bond: 'Partner', relationship: 'Betrayal',
    storyOrder: 10, source: jonahSrc
  });

  // Asymmetric opposite directions at the same storyOrder must NOT trigger a false conflict
  const draft = getStory(film).draft;
  assert.equal(continuityConflicts(draft.points).length, 0);

  // Mara's connections include BOTH Jonah (formal asymmetric, 2 shared scenes) AND Leah (live script co-presence, 1 shared scene)
  const maraConns = characterConnections(film, draft, maraId, doc.id);
  assert.equal(maraConns.length, 2);
  const withJonah = maraConns.find(c => c.other.id === jonahId)!;
  assert.equal(withJonah.asymmetric, true);
  assert.equal(withJonah.bond, 'Partner');
  assert.equal(withJonah.outgoing?.relationship, 'Trust');
  assert.equal(withJonah.incoming?.relationship, 'Betrayal');
  assert.equal(withJonah.sharedScenes, 2);

  // From Jonah's perspective, outgoing/incoming flip accurately!
  const jonahConns = characterConnections(film, draft, jonahId, doc.id);
  const jonahWithMara = jonahConns.find(c => c.other.id === maraId)!;
  assert.equal(jonahWithMara.outgoing?.relationship, 'Betrayal');
  assert.equal(jonahWithMara.incoming?.relationship, 'Trust');

  // Leah appears in Mara's connections automatically via shared script scene even with 0 formal relationship records
  const withLeah = maraConns.find(c => c.other.id === leahId)!;
  assert.equal(withLeah.sharedScenes, 1);
  assert.equal(withLeah.primaryState, undefined);

  // Whole-cast pairs include all 3 pairs (Mara-Jonah, Mara-Leah, Jonah-Leah)
  assert.equal(allPairConnections(film, draft, doc.id).length, 3);

  // Approve canon, then delete a point and a character from working draft — canon stays immutable!
  film = approveCanon(film, 'V1');
  film = deleteStoryPoint(film, pBA);
  assert.equal(getStory(film).draft.points.some(p => p.id === pBA), false);
  assert.equal(getStory(film).canon[0].data.points.some(p => p.id === pBA), true);

  film = deleteCharacter(film, leahId);
  assert.equal(getStory(film).draft.characters.some(c => c.id === leahId), false);
  assert.equal(getStory(film).canon[0].data.characters.some(c => c.id === leahId), true);
});



