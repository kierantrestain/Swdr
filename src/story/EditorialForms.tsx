import { useState } from 'react';
import type { FormEvent } from 'react';
import { newId, sourceFor } from '../model';
import type { Project } from '../model';
import {
  APPROVAL_STATES, CUE_KINDS, EVIDENCE_STATES, SEGMENT_KINDS,
  getEditorial
} from './editorial-model';
import type {
  ApprovalState, Brief, Claim, ClaimContent, CueKind, Evidence, EvidenceState,
  Segment, SegmentKind, SourceContent, VisualCue
} from './editorial-model';
import { fields, sourceDocument, sourceLabel } from './source';

type CommonProps = { project: Project; close: () => void };

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const multi = (form: FormData, key: string) => form.getAll(key).map(String);

function FormActions({ close, label }: { close: () => void; label: string }) {
  return <div className="actions"><button className="primary" type="submit">{label}</button><button type="button" onClick={close}>Cancel</button></div>;
}

function Links({ label, name, items, selected }: { label: string; name: string; items: { id: string; title: string }[]; selected: string[] }) {
  if (!items.length) return null;
  return <fieldset><legend>{label}</legend><div className="swdr-story-checks">
    {items.map(item => <label key={item.id}><input type="checkbox" name={name} value={item.id} defaultChecked={selected.includes(item.id)} />{item.title}</label>)}
  </div></fieldset>;
}

function AssetSelect({ project, selected }: { project: Project; selected?: string }) {
  return <label>Project asset<select name="assetId" defaultValue={selected ?? ''}>
    <option value="">No linked asset</option>{project.assets.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
  </select></label>;
}

export function SegmentForm({ project, segment, save, close }: CommonProps & {
  segment?: Segment; save: (updated: Segment) => boolean;
}) {
  const store = getEditorial(project);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (save({
      id: segment?.id ?? newId(), title: text(form, 'title'), purpose: text(form, 'purpose'),
      kind: text(form, 'kind') as SegmentKind, seconds: Number(form.get('seconds')),
      points: fields(text(form, 'points')), questions: fields(text(form, 'questions')), counterarguments: fields(text(form, 'counterarguments')),
      evidenceIds: multi(form, 'evidence'), claimIds: multi(form, 'claims'), cues: segment?.cues ?? []
    })) close();
  }
  return <form className="swdr-story-form" onSubmit={submit}>
    <h2>{segment ? 'Edit segment' : 'Add segment'}</h2>
    <label>Segment title<input required name="title" defaultValue={segment?.title} /></label>
    <div className="swdr-story-field-row">
      <label>Segment type<select name="kind" defaultValue={segment?.kind}>{SEGMENT_KINDS.map(kind => <option key={kind}>{kind}</option>)}</select></label>
      <label>Runtime in seconds<input required name="seconds" type="number" min="1" max="36000" defaultValue={segment?.seconds ?? 60} /></label>
    </div>
    <label>Purpose<textarea name="purpose" rows={2} defaultValue={segment?.purpose} /></label>
    <label>Talking points, one per line<textarea name="points" rows={4} defaultValue={segment?.points.join('\n')} /></label>
    <label>Questions, one per line<textarea name="questions" rows={3} defaultValue={segment?.questions.join('\n')} /></label>
    <label>Counterarguments, one per line<textarea name="counterarguments" rows={3} defaultValue={segment?.counterarguments.join('\n')} /></label>
    <Links label="Linked evidence" name="evidence" selected={segment?.evidenceIds ?? []}
      items={store.evidence.map(item => ({ id: item.id, title: item.versions.at(-1)?.title ?? 'Source' }))} />
    <Links label="Linked claims" name="claims" selected={segment?.claimIds ?? []}
      items={store.claims.map(item => ({ id: item.id, title: item.versions.at(-1)?.text ?? 'Claim' }))} />
    <FormActions close={close} label="Save segment" />
  </form>;
}

export function EvidenceForm({ project, item, save, close }: CommonProps & {
  item?: Evidence; save: (version: SourceContent, id?: string, correction?: string) => boolean;
}) {
  const current = item?.versions.at(-1);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (save({
      title: text(form, 'title'), url: text(form, 'url'), locator: text(form, 'locator'),
      status: text(form, 'status') as EvidenceState, notes: text(form, 'notes'),
      assetId: text(form, 'assetId') || undefined
    }, item?.id, text(form, 'correction'))) close();
  }
  return <form className="swdr-story-card swdr-story-form" onSubmit={submit}>
    <h2>{item ? 'Correct source' : 'Add source'}</h2>
    <label>Source title<input required name="title" defaultValue={current?.title} /></label>
    <div className="swdr-story-field-row">
      <label>Location in source<input name="locator" placeholder="Page, section or timecode" defaultValue={current?.locator} /></label>
      <label>Verification<select name="status" defaultValue={current?.status ?? 'Check required'}>{EVIDENCE_STATES.map(state => <option key={state}>{state}</option>)}</select></label>
    </div>
    <label>Source URL<input name="url" type="url" defaultValue={current?.url} placeholder="https://" /></label>
    <AssetSelect project={project} selected={current?.assetId} />
    <label>Research notes<textarea rows={3} name="notes" defaultValue={current?.notes} /></label>
    {item && <label>Reason for correction<input required name="correction" /></label>}
    <FormActions close={close} label="Save source" />
  </form>;
}

export function ClaimForm({ project, item, save, close }: CommonProps & {
  item?: Claim; save: (version: ClaimContent, id?: string, correction?: string) => boolean;
}) {
  const current = item?.versions.at(-1);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (save({ text: text(form, 'text'), status: text(form, 'status') as EvidenceState,
      evidenceIds: multi(form, 'evidence') }, item?.id, text(form, 'correction'))) close();
  }
  return <form className="swdr-story-card swdr-story-form" onSubmit={submit}>
    <h2>{item ? 'Correct claim' : 'Add shared claim'}</h2>
    <label>Exact claim<textarea required name="text" rows={3} defaultValue={current?.text} /></label>
    <label>Verification<select name="status" defaultValue={current?.status ?? 'Check required'}>{EVIDENCE_STATES.map(state => <option key={state}>{state}</option>)}</select></label>
    <Links label="Evidence for this claim" name="evidence" selected={current?.evidenceIds ?? []}
      items={getEditorial(project).evidence.map(item => ({ id: item.id, title: item.versions.at(-1)?.title ?? 'Source' }))} />
    {item && <label>Reason for correction<input required name="correction" /></label>}
    <FormActions close={close} label="Save claim" />
  </form>;
}

export function CueForm({ project, cue, segments, segmentId, save, close }: CommonProps & {
  cue?: VisualCue; segments: Segment[]; segmentId?: string; save: (id: string, cue: VisualCue) => boolean;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (save(text(form, 'segment'), {
      id: cue?.id ?? newId(), title: text(form, 'title'), type: text(form, 'type') as CueKind,
      specification: text(form, 'specification'), status: text(form, 'status') as ApprovalState,
      assetId: text(form, 'assetId') || undefined
    })) close();
  }
  return <form className="swdr-story-card swdr-story-form" onSubmit={submit}>
    <h2>{cue ? 'Edit visual cue' : 'Add visual cue'}</h2>
    <label>Episode segment<select name="segment" required defaultValue={segmentId ?? ''}>
      <option value="">Select a segment</option>{segments.map(segment => <option key={segment.id} value={segment.id}>{segment.title}</option>)}
    </select></label>
    <label>Cue title<input name="title" required defaultValue={cue?.title} /></label>
    <div className="swdr-story-field-row">
      <label>Type<select name="type" defaultValue={cue?.type}>{CUE_KINDS.map(kind => <option key={kind}>{kind}</option>)}</select></label>
      <label>Approval<select name="status" defaultValue={cue?.status}>{APPROVAL_STATES.map(state => <option key={state}>{state}</option>)}</select></label>
    </div>
    <label>Specification<textarea name="specification" rows={4} defaultValue={cue?.specification} /></label>
    <AssetSelect project={project} selected={cue?.assetId} />
    <FormActions close={close} label="Save cue" />
  </form>;
}

export function BriefForm({ project, brief, save, close }: CommonProps & {
  brief?: Brief; save: (value: Brief) => boolean;
}) {
  const previous = brief?.avSource && sourceDocument(project, brief.avSource);
  const documents = project.documents.filter(document => document.kind === 'av');
  const known = previous && !documents.some(document => document.id === previous.id && document.revisionId === previous.revisionId);
  const entries = known ? [previous, ...documents] : documents;
  const [avKey, setAvKey] = useState(previous ? `${previous.id}:${previous.revisionId}` : '');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const av = entries.find(document => `${document.id}:${document.revisionId}` === avKey);
    if (save({
      client: text(form, 'client'), objective: text(form, 'objective'), audience: text(form, 'audience'),
      copy: text(form, 'copy'), deliverables: fields(text(form, 'deliverables')),
      avSource: av ? sourceFor(project, av) : undefined, approval: text(form, 'approval') as ApprovalState,
      approver: text(form, 'approver')
    })) close();
  }
  return <form className="swdr-story-card swdr-story-form" onSubmit={submit}>
    <h2>{brief ? 'Edit branded brief' : 'Create branded brief'}</h2>
    <div className="swdr-story-field-row">
      <label>Client<input required name="client" defaultValue={brief?.client} /></label>
      <label>Audience<input name="audience" defaultValue={brief?.audience} /></label>
    </div>
    <label>Objective<textarea required name="objective" rows={2} defaultValue={brief?.objective} /></label>
    <label>Approved or working copy<textarea name="copy" rows={3} defaultValue={brief?.copy} /></label>
    <label>Deliverables, one per line<textarea name="deliverables" rows={3} defaultValue={brief?.deliverables.join('\n')} /></label>
    <label>Linked AV version<select name="av" value={avKey} onChange={event => setAvKey(event.currentTarget.value)}>
      <option value="">No AV revision linked</option>{entries.map(document => {
        const source = sourceFor(project, document);
        return <option key={`${document.id}:${document.revisionId}`} value={`${document.id}:${document.revisionId}`}>{sourceLabel(project, source)} · {documents.includes(document) ? 'Current draft' : 'Retained revision'}</option>;
      })}
    </select></label>
    <div className="swdr-story-field-row">
      <label>Approval<select name="approval" defaultValue={brief?.approval}>{APPROVAL_STATES.map(item => <option key={item}>{item}</option>)}</select></label>
      <label>Approver<input name="approver" defaultValue={brief?.approver} /></label>
    </div>
    <FormActions close={close} label="Save brief" />
  </form>;
}
