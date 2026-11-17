import { newBlock, newId, sceneList, sourceFor } from '../model';
import type { DocumentModel, Project } from '../model';
import { approveCanon, continuityConflicts, withStory } from './series-model';
import type { Character, StoryPoint, StoryState } from './series-model';
import { exactSource, orderedEpisodes, retainSources } from './source';
import { issueEditorial, saveBrief, withEditorial } from './editorial-model';
import type { EditorialDraft, EditorialStore, Segment, SourceVersion } from './editorial-model';

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
  for (const [index, item] of episodeDocuments.slice(4).entries()) {
    points.push(point('event', `Nora reviews the record in ${item.title}`, ref(item.id), 60 + index * 10, [nora]));
  }
  const seasonTwo = episodes.find(episode => episode.season === 2 && episode.number === 2);
  const laterDocument = episodeDocuments.find(document => document.episodeId === seasonTwo?.id);
  if (laterDocument) points.push(point('relationship', 'Elias returns to the inquiry', ref(laterDocument.id), 170, [nora, elias], { relationship: 'Trust' }));
  const exception = continuityConflicts(points)[0];
  const characters = [nora, elias, mara, jonah, leah];
  const draft: StoryState = { characters, points, exceptions: exception
    ? [{ id: exception.id, reason: 'The contradictory account is intentional. Nora keeps both records open until the inquiry.', reviewedAt: project.createdAt }]
    : [] };
  const retained = retainSources(prepared, [...characters, ...points].map(record => record.source), 'Series evidence');
  return approveCanon(withStory(retained, { schema: 1, draft, canon: [] }), 'Canon 1');
}

export function seedEditorial(project: Project): Project {
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
  const assetId = newId();
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
      claimIds: number === 0 || number === 2 ? [claimId] : [],
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
    claims: [{ id: claimId, versions: [{
      revisionId: newId(), savedAt: project.createdAt, correction: '', text: 'The committee examined three costed alternatives before the vote.',
      status: 'Verified', evidenceIds: [firstEvidenceId]
    }] }]
  };
  const sourceFile = 'SWDR fictional decision record\nSection 4.2: Three proposals were considered by the committee.\n';
  const asset = { id: assetId, name: 'demo-decision-record.txt', mime: 'text/plain',
    dataUrl: `data:text/plain;base64,${btoa(sourceFile)}`, addedAt: project.createdAt };
  const seeded = withEditorial({ ...project, assets: [...project.assets, asset] }, store);
  return documents.slice(0, 2).reduce((current, document) => issueEditorial(current, document.id), seeded);
}
