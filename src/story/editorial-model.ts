import { durationLabel, newId, sourceFor } from '../model';
import type { DocumentModel, Project, SourceRef } from '../model';
import { episodeCode, orderedEpisodes, retainSources, sourceDocument, upsert, validSource } from './source';

export const EVIDENCE_STATES = ['Verified', 'Check required', 'Contested'] as const;
export type EvidenceState = (typeof EVIDENCE_STATES)[number];
export const SEGMENT_KINDS = ['Host discussion', 'Interview', 'Panel', 'Voiceover', 'Archive', 'Field sequence'] as const;
export type SegmentKind = (typeof SEGMENT_KINDS)[number];
export const CUE_KINDS = ['Graphic', 'Still', 'Clip', 'Map', 'On-screen text'] as const;
export type CueKind = (typeof CUE_KINDS)[number];
export const APPROVAL_STATES = ['Draft', 'In review', 'Approved'] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];

interface Revision {
  revisionId: string;
  savedAt: string;
  correction: string;
}

export interface SourceContent {
  title: string;
  locator: string;
  url: string;
  assetId?: string;
  notes: string;
  status: EvidenceState;
}

export type SourceVersion = SourceContent & Revision;

export interface Evidence {
  id: string;
  versions: SourceVersion[];
}

export interface ClaimContent {
  text: string;
  evidenceIds: string[];
  status: EvidenceState;
  /** The exact script line where the claim is spoken or shown. */
  scriptLine?: SourceRef;
}

export type ClaimVersion = ClaimContent & Revision;

export interface Claim {
  id: string;
  versions: ClaimVersion[];
}

export interface VisualCue {
  id: string;
  title: string;
  type: CueKind;
  specification: string;
  status: ApprovalState;
  assetId?: string;
}

export interface Segment {
  id: string;
  title: string;
  purpose: string;
  kind: SegmentKind;
  seconds: number;
  points: string[];
  questions: string[];
  counterarguments: string[];
  evidenceIds: string[];
  claimIds: string[];
  cues: VisualCue[];
}

export interface Brief {
  client: string;
  objective: string;
  audience: string;
  copy: string;
  deliverables: string[];
  avSource?: SourceRef;
  approval: ApprovalState;
  approver: string;
  approvedAt?: string;
}

export interface EditorialDraft {
  revisionId: string;
  documentId: string;
  segments: Segment[];
  brief?: Brief;
}

export interface EditorialIssue {
  id: string;
  number: number;
  issuedAt: string;
  projectTitle: string;
  documentTitle: string;
  source: SourceRef;
  draft: EditorialDraft;
  sources: { id: string; version: SourceVersion }[];
  claims: { id: string; version: ClaimVersion }[];
}

export interface EditorialStore {
  schema: 1;
  drafts: Record<string, EditorialDraft>;
  evidence: Evidence[];
  claims: Claim[];
  issues: EditorialIssue[];
}

export const OUTPUT_LABELS = {
  research: 'Research dossier',
  host: 'Host guide',
  rundown: 'Producer rundown',
  graphics: 'Graphics and asset register'
} as const;
export type Output = keyof typeof OUTPUT_LABELS;

export function getEditorial(project: Project): EditorialStore {
  const value = project.modules.editorial as Partial<EditorialStore> | undefined;
  if (value?.schema === 1 && value.drafts && !Array.isArray(value.drafts)
    && Array.isArray(value.evidence) && Array.isArray(value.claims) && Array.isArray(value.issues)) return value as EditorialStore;
  return { schema: 1, drafts: {}, evidence: [], claims: [], issues: [] };
}

export function getEditorialDraft(store: EditorialStore, documentId: string): EditorialDraft {
  const draft = store.drafts[documentId];
  return draft && draft.documentId === documentId && Array.isArray(draft.segments)
    ? draft : { documentId, revisionId: '', segments: [] };
}

export function withEditorial(project: Project, value: EditorialStore): Project {
  return { ...project, modules: { ...project.modules, editorial: value } };
}

function writeDraft(project: Project, documentId: string, update: (draft: EditorialDraft) => EditorialDraft): Project {
  if (!project.documents.some(document => document.id === documentId)) throw new Error('This editorial document is unavailable.');
  const store = getEditorial(project);
  const current = getEditorialDraft(store, documentId);
  const draft = { ...update(current), revisionId: newId() };
  return withEditorial(project, { ...store, drafts: { ...store.drafts, [documentId]: draft } });
}

export function saveSegment(project: Project, documentId: string, segment: Segment): Project {
  const store = getEditorial(project);
  if (!segment.title.trim() || !Number.isSafeInteger(segment.seconds) || segment.seconds < 1 || segment.seconds > 36000) {
    throw new Error('Enter a segment title and a runtime from 1 to 36,000 seconds.');
  }
  if (segment.evidenceIds.some(id => !store.evidence.some(item => item.id === id))
    || segment.claimIds.some(id => !store.claims.some(item => item.id === id))) throw new Error('An evidence or claim link is unavailable.');
  if (segment.cues.some(cue => cue.assetId && !project.assets.some(asset => asset.id === cue.assetId))) throw new Error('A linked asset is unavailable.');
  return writeDraft(project, documentId, draft => ({
    ...draft, segments: upsert(draft.segments, { ...segment, evidenceIds: [...new Set(segment.evidenceIds)], claimIds: [...new Set(segment.claimIds)] })
  }));
}

export function reorderSegments(project: Project, documentId: string, segmentId: string, shift: -1 | 1): Project {
  return writeDraft(project, documentId, draft => {
    const from = draft.segments.findIndex(segment => segment.id === segmentId);
    const to = from + shift;
    if (from < 0 || to < 0 || to >= draft.segments.length) return draft;
    const segments = [...draft.segments];
    [segments[from], segments[to]] = [segments[to], segments[from]];
    return { ...draft, segments };
  });
}

export function removeSegment(project: Project, documentId: string, segmentId: string): Project {
  return writeDraft(project, documentId, draft => ({ ...draft, segments: draft.segments.filter(segment => segment.id !== segmentId) }));
}

function correctionRevision(correction: string, requiresReason: boolean): Revision {
  if (requiresReason && !correction.trim()) throw new Error('Describe the change to retain a correction history.');
  return { revisionId: newId(), savedAt: new Date().toISOString(), correction: correction.trim() };
}

export function saveEvidence(project: Project, input: SourceContent, evidenceId?: string, correction = ''): Project {
  if (!input.title.trim()) throw new Error('Enter a source title.');
  if (input.url) {
    let parsed: URL;
    try { parsed = new URL(input.url); }
    catch { throw new Error('Enter a valid HTTP or HTTPS source URL.'); }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('Enter a valid HTTP or HTTPS source URL.');
  }
  if (input.assetId && !project.assets.some(asset => asset.id === input.assetId)) throw new Error('A linked source asset is unavailable.');
  const store = getEditorial(project);
  const current = evidenceId ? store.evidence.find(item => item.id === evidenceId) : undefined;
  if (evidenceId && !current) throw new Error('The source is unavailable.');
  const version = { ...input, ...correctionRevision(correction, Boolean(current)) };
  const evidence = upsert(store.evidence, { id: current?.id ?? newId(), versions: [...(current?.versions ?? []), version] });
  return withEditorial(project, { ...store, evidence });
}

export function saveClaim(project: Project, input: ClaimContent, claimId?: string, correction = ''): Project {
  const store = getEditorial(project);
  if (!input.text.trim()) throw new Error('Enter the exact claim.');
  if (input.status === 'Verified' && !input.evidenceIds.length) throw new Error('A verified claim requires linked evidence.');
  if (input.evidenceIds.some(id => !store.evidence.some(item => item.id === id))) throw new Error('A linked source is unavailable.');
  if (input.scriptLine && !validSource(project, input.scriptLine, true)) throw new Error('Choose the exact script line for this claim.');
  const current = claimId ? store.claims.find(item => item.id === claimId) : undefined;
  if (claimId && !current) throw new Error('The claim is unavailable.');
  const version = { ...input, evidenceIds: [...new Set(input.evidenceIds)], ...correctionRevision(correction, Boolean(current)) };
  if (!version.scriptLine) delete version.scriptLine;
  const claims = upsert(store.claims, { id: current?.id ?? newId(), versions: [...(current?.versions ?? []), version] });
  const retained = retainSources(project, input.scriptLine ? [input.scriptLine] : [], 'Claim script line');
  return withEditorial(retained, { ...store, claims });
}

export function saveBrief(project: Project, documentId: string, brief: Brief): Project {
  if (!brief.client.trim() || !brief.objective.trim()) throw new Error('A brief requires a client and an objective.');
  if (brief.avSource && sourceDocument(project, brief.avSource)?.kind !== 'av') throw new Error('Choose a valid AV revision.');
  if (brief.approval === 'Approved' && (!brief.approver.trim() || !brief.avSource || !brief.deliverables.length)) {
    throw new Error('An approved brief requires an approver, AV revision and deliverables.');
  }
  const retained = retainSources(project, brief.avSource ? [brief.avSource] : [], 'Branded AV version');
  return writeDraft(retained, documentId, draft => ({ ...draft, brief: { ...brief,
    approvedAt: brief.approval === 'Approved' ? new Date().toISOString() : undefined } }));
}

function linkedRecords(store: EditorialStore, draft: EditorialDraft, doc: DocumentModel, project: Project): EditorialIssue {
  const claimIds = new Set(draft.segments.flatMap(segment => segment.claimIds));
  const claims = store.claims.flatMap(claim => {
    const version = claim.versions.at(-1);
    return claimIds.has(claim.id) && version ? [{ id: claim.id, version }] : [];
  });
  const evidenceIds = new Set([
    ...draft.segments.flatMap(segment => segment.evidenceIds),
    ...claims.flatMap(claim => claim.version.evidenceIds)
  ]);
  const sources = store.evidence.flatMap(evidence => {
    const version = evidence.versions.at(-1);
    return evidenceIds.has(evidence.id) && version ? [{ id: evidence.id, version }] : [];
  });
  return {
    projectTitle: project.title, documentTitle: doc.title, source: sourceFor(project, doc),
    id: '', number: 0, issuedAt: '', draft, claims, sources
  };
}

export function previewEditorial(project: Project, doc: DocumentModel): EditorialIssue {
  const store = getEditorial(project);
  return linkedRecords(store, getEditorialDraft(store, doc.id), doc, project);
}

export function issueEditorial(project: Project, documentId: string): Project {
  const document = project.documents.find(item => item.id === documentId);
  if (!document) throw new Error('The script is unavailable.');
  const store = getEditorial(project);
  const draft = getEditorialDraft(store, documentId);
  if (!draft.segments.length && !draft.brief) throw new Error('Add a segment or branded brief before issuing outputs.');
  const number = 1 + Math.max(0, ...store.issues.filter(issue => issue.source.documentId === documentId).map(issue => issue.number));
  const frozen = structuredClone(linkedRecords(store, draft, document, project));
  const issue: EditorialIssue = { ...frozen, id: newId(), number, issuedAt: new Date().toISOString() };
  const retained = retainSources(project, [issue.source], 'Editorial output source');
  return withEditorial(retained, { ...store, issues: [...store.issues, issue] });
}

export function issueCorrections(store: EditorialStore, issue: EditorialIssue): string[] {
  const claims = new Map(store.claims.map(claim => [claim.id, claim.versions.at(-1)]));
  const evidence = new Map(store.evidence.map(item => [item.id, item.versions.at(-1)]));
  return [
    ...issue.claims.filter(claim => claims.get(claim.id)?.revisionId !== claim.version.revisionId)
      .map(claim => claims.get(claim.id)?.text ?? claim.version.text),
    ...issue.sources.filter(item => evidence.get(item.id)?.revisionId !== item.version.revisionId)
      .map(item => evidence.get(item.id)?.title ?? item.version.title)
  ];
}

export function editorialRuntime(segments: Segment[]): number {
  return segments.reduce((sum, segment) => sum + segment.seconds, 0);
}

export function segmentTimes(segments: Segment[]): { id: string; from: number; to: number }[] {
  let from = 0;
  return segments.map(segment => {
    const current = { id: segment.id, from, to: from + segment.seconds };
    from = current.to;
    return current;
  });
}

const list = (entries: string[]) => entries.map(entry => `- ${entry}`).join('\n');

export function renderEditorialOutput(issue: EditorialIssue, output: Output): string {
  const { draft, claims, sources } = issue;
  const header = [
    `# ${OUTPUT_LABELS[output]}`, issue.projectTitle, issue.documentTitle,
    issue.number ? `Issue ${issue.number} · ${issue.issuedAt}` : 'Working preview',
    `Editorial revision ${draft.revisionId || 'unsaved'}`, `Script revision ${issue.source.revisionId}`,
    `Estimated runtime ${durationLabel(editorialRuntime(draft.segments))}`
  ].join('\n\n');
  const segmentEvidence = (segment: Segment) => [
    ...claims.filter(claim => segment.claimIds.includes(claim.id)).map(claim => `[${claim.version.status}] ${claim.version.text}`),
    ...sources.filter(source => segment.evidenceIds.includes(source.id)
      || claims.some(claim => segment.claimIds.includes(claim.id) && claim.version.evidenceIds.includes(source.id)))
      .map(source => `[${source.version.status}] ${source.version.title}${source.version.locator && ` · ${source.version.locator}`}`)
  ];
  let sections: string[];
  if (output === 'research') {
    sections = [
      '## Claims', claims.length ? claims.map(({ version }) => [
        `### ${version.text}`, version.status, `Claim revision ${version.revisionId}`,
        list(sources.filter(source => version.evidenceIds.includes(source.id)).map(source => source.version.title))
      ].filter(Boolean).join('\n\n')).join('\n\n') : 'No linked claims.',
      '## Evidence', sources.length ? sources.map(({ version }) => [
        `### ${version.title}`, [version.status, version.locator].filter(Boolean).join(' · '),
        version.url, version.notes, version.assetId && `Asset ${version.assetId}`, `Evidence revision ${version.revisionId}`
      ].filter(Boolean).join('\n\n')).join('\n\n') : 'No linked evidence.'
    ];
  } else if (output === 'host') {
    sections = draft.segments.map(segment => [
      `## ${segment.title}`, `${durationLabel(segment.seconds)} · ${segment.kind}`, segment.purpose,
      '### Talking points', list(segment.points) || 'None recorded.', '### Questions', list(segment.questions) || 'None recorded.',
      '### Counterarguments', list(segment.counterarguments) || 'None recorded.',
      ...(segmentEvidence(segment).length ? ['### Evidence and claims', list(segmentEvidence(segment))] : [])
    ].filter(Boolean).join('\n\n'));
  } else if (output === 'rundown') {
    const timing = segmentTimes(draft.segments);
    sections = draft.segments.map((segment, index) => [
      `## ${durationLabel(timing[index].from)}–${durationLabel(timing[index].to)} · ${segment.title}`, segment.kind,
      segment.purpose, list(segment.cues.map(cue => `${cue.type} · ${cue.title} · ${cue.status}`)),
      list(segmentEvidence(segment))
    ].filter(Boolean).join('\n\n'));
  } else {
    sections = draft.segments.flatMap(segment => segment.cues.map(cue => [
      `## ${cue.title}`, `${segment.title} · ${cue.type} · ${cue.status}`, cue.specification,
      cue.assetId && `Asset ${cue.assetId}`, list(segmentEvidence(segment))
    ].filter(Boolean).join('\n\n')));
  }
  if (draft.brief && (output === 'rundown' || output === 'graphics')) {
    const brief = draft.brief;
    sections.push([
      '## Branded brief', brief.client, brief.objective, brief.audience, brief.copy, list(brief.deliverables),
      `${brief.approval}${brief.approver && ` · ${brief.approver}`}`, brief.approvedAt,
      brief.avSource && `AV revision ${brief.avSource.revisionId}`
    ].filter(Boolean).join('\n\n'));
  }
  return [header, ...sections].join('\n\n') + '\n';
}

export function issueManifest(issue: EditorialIssue) {
  return {
    issueId: issue.id, issueNumber: issue.number, issuedAt: issue.issuedAt, source: issue.source,
    editorialRevision: issue.draft.revisionId, segments: issue.draft.segments.map(segment => ({
      id: segment.id, source: { ...issue.source, segmentId: segment.id },
      durationSeconds: segment.seconds, cueIds: segment.cues.map(cue => cue.id)
    })),
    claims: issue.claims.map(item => ({ id: item.id, revisionId: item.version.revisionId })),
    evidence: issue.sources.map(item => ({ id: item.id, revisionId: item.version.revisionId })),
    avSource: issue.draft.brief?.avSource, outputs: OUTPUT_LABELS
  };
}

export const CLAIM_LANES = ['Unsourced', 'Sourced', 'Verified', 'Disputed'] as const;
export type ClaimLane = (typeof CLAIM_LANES)[number];

export interface ClaimUse {
  documentId: string;
  documentTitle: string;
  episode: string;
  segmentId: string;
  segmentTitle: string;
}

export interface ClaimCard {
  id: string;
  version: ClaimVersion;
  corrections: number;
  lane: ClaimLane;
  warnings: string[];
  sources: { id: string; version: SourceVersion }[];
  uses: ClaimUse[];
}

/**
 * Places every shared claim on the verification board. The lane is derived from the claim's own
 * status and the current status of each linked source, so a verified claim never hides a contested source.
 */
export function claimBoard(project: Project, store: EditorialStore): ClaimCard[] {
  const episodes = orderedEpisodes(project);
  const order = new Map(episodes.map((episode, index) => [episode.id, index]));
  const documents = [...project.documents].sort((a, b) => (order.get(a.episodeId ?? '') ?? Infinity) - (order.get(b.episodeId ?? '') ?? Infinity));
  return store.claims.flatMap(claim => {
    const version = claim.versions.at(-1);
    if (!version) return [];
    const sources = store.evidence.flatMap(item => {
      const latest = item.versions.at(-1);
      return version.evidenceIds.includes(item.id) && latest ? [{ id: item.id, version: latest }] : [];
    });
    const uses = documents.flatMap(document => {
      const episode = episodes.find(item => item.id === document.episodeId);
      return getEditorialDraft(store, document.id).segments.filter(segment => segment.claimIds.includes(claim.id)).map(segment => ({
        documentId: document.id, documentTitle: document.title, episode: episode ? episodeCode(episode) : document.title,
        segmentId: segment.id, segmentTitle: segment.title
      }));
    });
    const contested = sources.filter(source => source.version.status === 'Contested');
    const pending = sources.filter(source => source.version.status === 'Check required');
    const lane: ClaimLane = version.status === 'Contested' || contested.length ? 'Disputed'
      : version.status === 'Verified' ? 'Verified' : sources.length ? 'Sourced' : 'Unsourced';
    const warnings = [
      ...contested.map(source => `Linked source is contested: ${source.version.title}`),
      ...(lane === 'Verified' ? pending.map(source => `Verified, but relies on a source still marked Check required: ${source.version.title}`) : []),
      ...(!version.scriptLine ? ['Not linked to a script line'] : []),
      ...(!uses.length ? ['Not used in any segment'] : [])
    ];
    return [{ id: claim.id, version, corrections: claim.versions.length - 1, lane, warnings, sources, uses }];
  });
}
