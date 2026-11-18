import { newBlock, newId, sceneList, sourceFor } from '../model';
import type { DocumentModel, Project } from '../model';
import { approveCanon, continuityConflicts, getStory, withStory } from './series-model';
import type { Character, StoryPoint, StoryState } from './series-model';
import { exactSource, orderedEpisodes, retainSources } from './source';
import { issueEditorial, saveBrief, withEditorial } from './editorial-model';
import type { EditorialDraft, EditorialStore, EvidenceState, Segment, SourceVersion } from './editorial-model';

export function seedSeries(project: Project): Project {
  const episodes = orderedEpisodes(project);
  const episodeDocuments = episodes.flatMap(episode => {
    const document = project.documents.find(item => item.episodeId === episode.id && sceneList(item).length);
    return document ? [document] : [];
  });
  if (episodeDocuments.length < 5) return project;
  const [first, second, third, fourth, fifth] = episodeDocuments;
  const introductionText = new Map([
    [first.id, ['Nora Vale checks the record of the first cancellation.']],
    [second.id, ['Mara Quinn asks that the new timetable be posted without a correction note.', 'Leah Hart leaves Nora a warning from the department.']],
    [third.id, ['Jonah Price shows Nora the timetable he saved before the storm.', 'Their printed times differ. Nora circles both.']],
    [fourth.id, ['Elias Crowe says both printings carried the same time.', 'Nora hears the last ferry leave while she holds the disputed ticket.']],
    [fifth.id, ['Elias closes his notebook and steps back from the investigation.']]
  ]);
  const laterLines: Record<string, string[]> = {
    '1:6': ['Leah meets Mara in the ministry car park and hands over Nora’s notes.'],
    '1:7': ['Tomas Rhee, the ferry master, refuses to sign the amended log.'],
    '1:8': ['Mara tells Tomas the inquiry will not need his log.'],
    '1:9': ['Jonah’s boat is impounded at the outer mooring.', 'Jonah tells Nora to stay away from the harbour.'],
    '1:10': ['Nora finds the line Leah removed from her notes.'],
    '1:11': ['Elias brings Nora a name from the ticket office, then burns the page.'],
    '1:12': ['Nora broadcasts both timetables side by side.', 'Mara switches off the radio.'],
    '2:1': ['Ines Calder opens the public inquiry and asks for every printed timetable.'],
    '2:2': ['Elias sits beside Nora in the inquiry gallery.'],
    '2:3': ['Tomas hands Nora the original ferry log.', 'On the night of the storm, Tomas rewrites the departure time by lamplight.'],
    '2:5': ['Leah asks Nora for a second chance and offers the ministry minutes.'],
    '2:7': ['Mara tells the inquiry the storm left no choice.'],
    '2:9': ['Jonah testifies before the inquiry with the folded timetable in his hand.'],
    '2:11': ['Ines reads the name on the unmarked ticket: Mara’s driver.'],
    '2:12': ['The inquiry corrects the record. Nora reads it on the harbour wall.']
  };
  for (const episode of episodes) {
    const lines = laterLines[`${episode.season}:${episode.number}`];
    const document = lines && project.documents.find(item => item.episodeId === episode.id && sceneList(item).length);
    if (document && !introductionText.has(document.id)) introductionText.set(document.id, lines);
  }
  const documents = project.documents.map(document => {
    const lines = introductionText.get(document.id);
    if (!lines) return document;
    const secondScene = sceneList(document)[1]?.index ?? document.blocks.length;
    return { ...document, blocks: [...document.blocks.slice(0, secondScene), ...lines.map(line => newBlock('action', line)), ...document.blocks.slice(secondScene)] };
  });
  const prepared = { ...project, documents };
  const live = (id: string): DocumentModel => documents.find(document => document.id === id)!;
  const ref = (documentId: string, text?: string) => {
    const document = live(documentId);
    const match = text && document.blocks.find(block => block.text.toLowerCase().includes(text.toLowerCase()));
    return exactSource(prepared, document, (match && match.id) || sceneList(document)[0].blockId);
  };
  const person = (name: string, role: string, motivation: string, conflict: string, source: Character['source'], aliases: string[]): Character => ({
    id: newId(), name, role, motivation, conflict, source, aliases
  });
  const nora = person('Nora Vale', 'Producer', 'Find out who changed the ferry records and trace the passenger on the unmarked ticket.',
    'The crew know who corrected the route. Nobody will put it in writing.', ref(first.id, 'Nora Vale'), ['Nora']);
  const mara = person('Mara Quinn', 'Political adviser', 'Keep the inquiry focused on the storm.', 'An original timetable could contradict her account.', ref(second.id, 'Mara Quinn'), ['Mara']);
  const leah = person('Leah Hart', 'Government liaison', 'Protect a contact at the ferry authority.', 'Nora is asking the questions Leah cannot ask publicly.', ref(second.id, 'Leah Hart'), ['Leah']);
  const jonah = person('Jonah Price', 'Fisherman', 'Make sure the old record is heard.', 'He is wary of what an interview will cost his neighbours.', ref(third.id, 'Jonah Price'), ['Jonah']);
  const elias = person('Elias Crowe', 'Journalist', 'Keep his original source anonymous.', 'His source and the papers may tell different stories.', ref(fourth.id, 'Elias Crowe'), ['Elias']);
  const point = (kind: StoryPoint['kind'], title: string, source: StoryPoint['source'], storyOrder: number,
    participants: Character[] = [], extra: Partial<StoryPoint> = {}): StoryPoint => ({
    id: newId(), kind, title, source, storyOrder, participants: participants.map(character => character.id), detail: '', ...extra
  });
  const opening = point('event', 'The first cancellation', nora.source, 30, [nora]);
  const timetable = point('event', 'The timetable changes', mara.source, 40, [nora, mara], { causeId: opening.id });
  const original = point('event', 'Jonah produces the original', jonah.source, 10, [nora, jonah], { detail: 'A flashback shows when Jonah kept the earlier printing.' });
  const departure = point('event', 'The last departure', ref(fourth.id, 'last ferry leave'), 50, [nora], { causeId: timetable.id });
  const points = [
    opening, timetable, original, departure,
    point('relationship', 'Nora challenges the unmarked correction', mara.source, 40, [nora, mara], { relationship: 'Conflict' }),
    point('relationship', 'Leah passes along a warning', leah.source, 42, [nora, leah], { relationship: 'Pressure' }),
    point('relationship', 'Jonah brings the earlier timetable', jonah.source, 46, [nora, jonah], { relationship: 'Alliance' }),
    point('relationship', 'Elias agrees to compare records', ref(fourth.id, 'tomorrow'), 48, [nora, elias], { relationship: 'Trust' }),
    point('relationship', 'Elias withdraws the notebook', ref(fifth.id, 'closes his notebook'), 60, [nora, elias], { relationship: 'Distance' }),
    point('interaction', 'Elias changes the date on the timetable', ref(fourth.id, 'tomorrow'), 47, [nora, elias]),
    point('interaction', 'Jonah shows Nora the original timetable', jonah.source, 46, [nora, jonah]),
    point('appearance', 'Nora at the ferry office', ref(fourth.id, 'NORA'), 47, [nora]),
    point('appearance', 'Elias at the ferry office', ref(fourth.id, 'ELIAS'), 47, [elias]),
    point('appearance', 'Jonah gives his account', jonah.source, 46, [jonah]),
    point('appearance', 'Nora hears Jonah’s account', ref(third.id, 'printed times differ'), 46, [nora]),
    point('knowledge', 'The printed and posted times differ', ref(third.id, 'printed times differ'), 46, [nora], { knowledge: 'Confirmed', factKey: 'timetable-change' }),
    point('knowledge', 'Elias’s account puts both printings at the same time', elias.source, 46, [nora], { knowledge: 'Refuted', factKey: 'timetable-change' }),
    point('knowledge', 'Who travelled under the unmarked ticket?', ref(fourth.id, 'paper ticket'), 48, [nora], { knowledge: 'Unresolved', factKey: 'unmarked-ticket' }),
    point('arc', 'Questions the route', nora.source, 30, [nora], { causeId: opening.id }),
    point('arc', 'Finds a witness with the original timetable', jonah.source, 46, [nora]),
    point('arc', 'Confronts Elias', ref(fourth.id, 'which boat'), 47, [nora])
  ];
  const byEpisode = (season: number, number: number) => {
    const episode = episodes.find(item => item.season === season && item.number === number);
    return episodeDocuments.find(document => document.episodeId === episode?.id);
  };
  const line = (season: number, number: number, text: string) => {
    const document = byEpisode(season, number);
    return document ? ref(document.id, text) : undefined;
  };
  const tomasSource = line(1, 7, 'Tomas Rhee');
  const inesSource = line(2, 1, 'Ines Calder');
  const tomas = tomasSource && person('Tomas Rhee', 'Ferry master', 'Keep his licence and his crew working.',
    'He signed the amended log the night of the storm.', tomasSource, ['Tomas', 'The ferry master']);
  const ines = inesSource && person('Ines Calder', 'Inquiry chair', 'Put every printed timetable on the public record.',
    'The ministry controls the documents she needs.', inesSource, ['Ines']);
  const add = (season: number, number: number, text: string, make: (src: StoryPoint['source']) => StoryPoint) => {
    const source = line(season, number, text);
    if (source) points.push(make(source));
  };
  const cast: Character[] = [nora, elias, mara, jonah, leah];
  add(1, 6, 'hands over Nora', src => point('interaction', 'Leah gives Mara a copy of Nora’s notes', src, 62, [leah, mara]));
  add(1, 6, 'hands over Nora', src => point('relationship', 'Leah and Mara close ranks', src, 62, [leah, mara], { relationship: 'Alliance' }));
  add(1, 6, 'hands over Nora', src => point('relationship', 'Leah passes Nora’s notes to the ministry', src, 62, [nora, leah],
    { relationship: 'Betrayal', detail: 'Nora does not know yet.' }));
  if (tomas) {
    cast.push(tomas);
    add(1, 7, 'refuses to sign', src => point('interaction', 'Tomas refuses to sign the amended log', src, 64, [nora, tomas]));
    add(1, 7, 'refuses to sign', src => point('relationship', 'Nora presses the ferry master', src, 64, [nora, tomas], { relationship: 'Pressure' }));
    add(1, 8, 'will not need his log', src => point('interaction', 'Mara tells Tomas the inquiry will not need his log', src, 66, [mara, tomas]));
    add(1, 8, 'will not need his log', src => point('relationship', 'Mara leans on the ferry master', src, 66, [mara, tomas], { relationship: 'Pressure' }));
    add(1, 8, 'will not need his log', src => point('event', 'The ferry log disappears', src, 66, [mara, tomas], { causeId: timetable.id }));
  }
  add(1, 9, 'impounded', src => point('event', 'Jonah’s boat is impounded', src, 70, [jonah], { detail: 'Two days after he speaks to Nora.' }));
  add(1, 9, 'impounded', src => point('relationship', 'Jonah blames the ministry', src, 70, [jonah, mara], { relationship: 'Conflict' }));
  add(1, 9, 'stay away', src => point('interaction', 'Jonah tells Nora to stay away from the harbour', src, 70, [nora, jonah]));
  add(1, 9, 'impounded', src => point('arc', 'Pays for speaking up', src, 70, [jonah]));
  add(1, 10, 'line Leah removed', src => point('interaction', 'Nora confronts Leah over the missing line', src, 74, [nora, leah]));
  add(1, 10, 'line Leah removed', src => point('relationship', 'Nora learns who leaked her notes', src, 74, [nora, leah], { relationship: 'Conflict' }));
  add(1, 10, 'line Leah removed', src => point('knowledge', 'Leah leaked Nora’s notes', src, 74, [nora], { knowledge: 'Confirmed', factKey: 'leaked-notes' }));
  add(1, 11, 'burns the page', src => point('interaction', 'Elias brings the name on the ticket, then burns the page', src, 78, [nora, elias]));
  add(1, 11, 'burns the page', src => point('knowledge', 'Nora believes the ticket was issued to a ministry driver', src, 78, [nora],
    { knowledge: 'Believes', factKey: 'unmarked-ticket' }));
  add(1, 12, 'both timetables', src => point('event', 'Nora broadcasts both timetables', src, 80, [nora], { causeId: original.id }));
  add(1, 12, 'both timetables', src => point('arc', 'Goes public', src, 80, [nora]));
  add(1, 12, 'switches off the radio', src => point('arc', 'Loses control of the story', src, 80, [mara]));
  if (ines) {
    cast.push(ines);
    const broadcast = points.find(item => item.title === 'Nora broadcasts both timetables');
    add(2, 1, 'Ines Calder', src => point('event', 'The public inquiry opens', src, 160, [ines, nora], { causeId: broadcast?.id }));
    add(2, 1, 'every printed timetable', src => point('interaction', 'Ines asks Nora for every printed timetable', src, 160, [ines, nora]));
    add(2, 1, 'every printed timetable', src => point('relationship', 'Ines takes Nora’s evidence', src, 160, [ines, nora], { relationship: 'Trust' }));
  }
  add(2, 2, 'Elias sits beside Nora', src => point('interaction', 'Elias sits beside Nora in the inquiry gallery', src, 170, [nora, elias]));
  if (tomas) {
    add(2, 3, 'original ferry log', src => point('interaction', 'Tomas hands Nora the original ferry log', src, 175, [nora, tomas]));
    add(2, 3, 'original ferry log', src => point('relationship', 'Tomas chooses the record', src, 175, [nora, tomas], { relationship: 'Alliance' }));
    add(2, 3, 'night of the storm', src => point('event', 'Tomas amends the log on the night of the storm', src, 25, [tomas],
      { detail: 'A flashback revealed in season two.' }));
    add(2, 3, 'original ferry log', src => point('arc', 'Hands over the log', src, 175, [tomas]));
  }
  add(2, 5, 'second chance', src => point('interaction', 'Leah offers Nora the ministry minutes', src, 180, [nora, leah]));
  add(2, 5, 'second chance', src => point('relationship', 'Nora keeps Leah at arm’s length', src, 180, [nora, leah], { relationship: 'Distance' }));
  add(2, 5, 'second chance', src => point('arc', 'Seeks to make amends', src, 180, [leah]));
  add(2, 5, 'minutes', src => point('knowledge', 'Were the ministry minutes edited before release?', src, 180, [nora],
    { knowledge: 'Unresolved', factKey: 'ministry-minutes' }));
  if (ines) {
    add(2, 7, 'no choice', src => point('interaction', 'Mara tells the inquiry the storm left no choice', src, 185, [mara, ines]));
    add(2, 7, 'no choice', src => point('relationship', 'Ines challenges Mara’s account', src, 185, [mara, ines], { relationship: 'Conflict' }));
    add(2, 9, 'Jonah testifies', src => point('interaction', 'Jonah testifies before the inquiry', src, 190, [jonah, ines]));
    add(2, 9, 'Jonah testifies', src => point('arc', 'Testifies in public', src, 190, [jonah]));
  }
  const seasonTwo = episodes.find(episode => episode.season === 2 && episode.number === 2);
  const laterDocument = episodeDocuments.find(document => document.episodeId === seasonTwo?.id);
  if (laterDocument) points.push(point('relationship', 'Elias returns to the inquiry', ref(laterDocument.id, 'Elias sits beside Nora'), 170, [nora, elias], { relationship: 'Trust' }));
  // The season-two finale stays in the working draft until the room approves it as canon.
  const finale: [number, number, string, (src: StoryPoint['source']) => StoryPoint][] = [
    [2, 11, 'driver', src => point('knowledge', 'The ticket was issued to Mara’s driver', src, 195, [nora], { knowledge: 'Confirmed', factKey: 'unmarked-ticket' })],
    [2, 11, 'driver', src => point('interaction', 'Nora shows Mara the name on the ticket', src, 195, [nora, mara])],
    [2, 12, 'corrects the record', src => point('event', 'The inquiry corrects the record', src, 200, ines ? [nora, ines] : [nora])],
    [2, 12, 'corrects the record', src => point('arc', 'Gets the record corrected', src, 200, [nora])]
  ];
  const draftOnly = finale.flatMap(([season, number, text, make]) => {
    const source = line(season, number, text);
    return source ? [make(source)] : [];
  });
  const exception = continuityConflicts(points)[0];
  const characters = cast;
  const draft: StoryState = { characters, points, exceptions: exception
    ? [{ id: exception.id, reason: 'The contradictory account is intentional. Nora keeps both records open until the inquiry.', reviewedAt: project.createdAt }]
    : [] };
  const retained = retainSources(prepared, [...characters, ...points, ...draftOnly].map(record => record.source), 'Series evidence');
  const approved = approveCanon(withStory(retained, { schema: 1, draft, canon: [] }), 'Canon 1');
  const store = getStory(approved);
  return withStory(approved, { ...store, draft: { ...store.draft, points: [...store.draft.points, ...draftOnly] } });
}

const hostScript = [
  ['scene', 'INT. STUDIO – NIGHT'],
  ['action', 'The host stands beside a projected map of the proposed route.'],
  ['character', 'HOST'],
  ['dialogue', 'The committee examined three costed alternatives before the vote.'],
  ['character', 'HOST'],
  ['dialogue', 'The revised forecast doubled the original cost.'],
  ['action', 'Archive: residents queue outside the consultation evening.'],
  ['character', 'HOST (V.O.)'],
  ['dialogue', 'Residents say nobody told them when the consultation closed.']
] as const;

/** The host's wording for a claim where it differs from the claim register. */
function spokenText(claim: string): string {
  return claim.startsWith('Residents') ? 'Residents say nobody told them when the consultation closed.' : claim;
}

export function seedEditorial(base: Project): Project {
  const opening = orderedEpisodes(base)[0];
  const scripted = base.kind === 'commercial' ? undefined
    : base.documents.find(document => document.episodeId === opening?.id && document.kind !== 'av') ?? base.documents.find(document => document.kind !== 'av');
  const project = scripted ? { ...base, documents: base.documents.map(document => document.id === scripted.id
    ? { ...document, blocks: hostScript.map(([kind, text]) => newBlock(kind, text)) } : document) } : base;
  if (project.kind === 'commercial') {
    const document = project.documents.find(item => item.kind === 'av');
    return document ? saveBrief(project, document.id, {
      client: 'Night Signal', objective: 'Introduce the receiver in a 60-second launch spot.', audience: 'Drivers planning remote trips.',
      copy: 'Choose your way forward.', deliverables: ['60-second master', '15-second cutdown', 'Captioned vertical cut'],
      approval: 'In review', approver: '', avSource: sourceFor(project, document)
    }) : project;
  }
  if (!project.documents.length) return project;
  const firstEvidenceId = newId();
  const secondEvidenceId = newId();
  const claimId = newId();
  const costClaimId = newId();
  const residentsClaimId = newId();
  const approvalClaimId = newId();
  const assetId = newId();
  const scriptDocument = scripted && project.documents.find(document => document.id === scripted.id);
  const scriptLine = (text: string) => {
    const block = scriptDocument?.blocks.find(item => item.text === text);
    return scriptDocument && block ? exactSource(project, scriptDocument, block.id) : undefined;
  };
  const evidence = (value: Omit<SourceVersion, 'revisionId' | 'savedAt' | 'correction'>): SourceVersion => ({
    ...value, revisionId: newId(), savedAt: project.createdAt, correction: ''
  });
  const draftDocuments = orderedEpisodes(project).flatMap(episode => project.documents.find(document => document.episodeId === episode.id) ?? []);
  const documents = draftDocuments.length ? draftDocuments : project.documents;
  const drafts = Object.fromEntries(documents.map((document, index): [string, EditorialDraft] => {
    const segmentMinutes = [5, 12, 16 + index % 8, 18, 16, 8 + index % 7];
    const titles = ['Opening question', 'The origins', 'Follow the money', 'The alternatives', 'What changed', 'Where it leaves us'];
    const purposes = [
      'Set up the decision and explain what was at stake before the costs became clear.',
      'Trace the written record through the initial consultation and the first decision.',
      'Compare the submitted costs against the revised forecast and separate cost from financing.',
      'Test the alternatives on the same assumptions and show what the reviewers knew.',
      'Explain which commitments survived the vote and who was responsible for them.',
      'Close with the evidence still missing and the next stage of scrutiny.'
    ];
    const points = [
      ['Who proposed the project and what did they promise?', 'What did the public hear before the vote?', 'Compare the original timetable with the approved decision record.'],
      ['Place the first announcement and brief in chronological order.', 'Identify decisions taken before consultation ended.'],
      ['Explain the cost categories before comparing totals.', 'Separate the forecasts from actual spending.'],
      ['Compare the options on the same time horizon.', 'Identify which assumptions need independent evidence.'],
      ['Describe which cost or delivery commitments changed.', 'Give the decision-makers’ explanation and test it against the record.'],
      ['List the remaining questions and the records that could answer them.', 'Identify the next point at which the decision can be reviewed.']
    ];
    const segments = titles.map((title, number): Segment => ({
      id: newId(), title, purpose: purposes[number], kind: number === 4 ? 'Interview' : number === 3 ? 'Panel' : 'Host discussion',
      seconds: segmentMinutes[number] * 60, points: points[number],
      questions: [number === 0 ? 'Would the case have looked different if the alternatives had been costed on the same basis?' : 'What evidence would change our reading of this decision?'],
      counterarguments: [number === 0 ? 'The earlier estimate may have covered a different scope.' : 'Consider how the conclusion changes when the forecast period changes.'],
      evidenceIds: number === 0 || number === 2 ? [firstEvidenceId, secondEvidenceId] : [firstEvidenceId],
      claimIds: number === 0 ? [claimId] : number === 2 ? [claimId, costClaimId] : number === 1 && index === 0 ? [residentsClaimId]
        : number === 4 ? [approvalClaimId] : [],
      cues: number === 0 ? [{ id: newId(), title: 'Project map', type: 'Map', status: 'Draft', assetId,
        specification: 'Mark the boundaries in the fictional decision record. Confirm the final map artwork and its clearance before broadcast.' }] : []
    }));
    return [document.id, { documentId: document.id, revisionId: newId(), segments }];
  }));
  const store: EditorialStore = {
    schema: 1, drafts, issues: [],
    evidence: [
      { id: firstEvidenceId, versions: [evidence({ title: 'Decision record', locator: 'Section 4.2', url: '', assetId,
        notes: 'Fictional evidence for the SWDR demo.', status: 'Verified' })] },
      { id: secondEvidenceId, versions: [evidence({ title: 'Original feasibility brief', locator: 'Page 8', url: '',
        notes: 'Synthetic comparison source. Check scope before presenting its number as a like-for-like equivalent.', status: 'Check required' })] }
    ],
    claims: [
      [claimId, 'The committee examined three costed alternatives before the vote.', 'Verified', [firstEvidenceId], true],
      [costClaimId, 'The revised forecast doubled the original cost.', 'Check required', [secondEvidenceId], true],
      [residentsClaimId, 'Residents were not told when the consultation closed.', 'Check required', [], true],
      [approvalClaimId, 'The scheme was approved before the consultation closed.', 'Contested', [firstEvidenceId], false]
    ].map(([id, text, status, evidenceIds, spoken]) => ({ id: id as string, versions: [{
      revisionId: newId(), savedAt: project.createdAt, correction: '', text: text as string, status: status as EvidenceState,
      evidenceIds: evidenceIds as string[], ...(spoken ? { scriptLine: scriptLine(spokenText(text as string)) } : {})
    }] }))
  };
  const sourceFile = 'SWDR fictional decision record\nSection 4.2: Three proposals were considered by the committee.\n';
  const asset = { id: assetId, name: 'demo-decision-record.txt', mime: 'text/plain',
    dataUrl: `data:text/plain;base64,${btoa(sourceFile)}`, addedAt: project.createdAt };
  const lines = store.claims.flatMap(claim => claim.versions.flatMap(version => version.scriptLine ? [version.scriptLine] : []));
  const seeded = retainSources(withEditorial({ ...project, assets: [...project.assets, asset] }, store), lines, 'Claim script lines');
  return documents.slice(0, 2).reduce((current, document) => issueEditorial(current, document.id), seeded);
}
