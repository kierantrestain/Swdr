import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { CheckboxList, CheckboxListItem } from '@astryxdesign/core/CheckboxList';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { newId, sourceFor } from '../model';
import type { Project, SourceRef } from '../model';
import { Choice, initialSource, Pane, SourceFields } from './StoryControls';
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

function FormActions({ close, label }: { close: () => void; label: string }) {
  return <HStack gap={2} justify="end">
    <Button label="Cancel" onClick={close} />
    <Button variant="primary" type="submit" label={label} />
  </HStack>;
}

function Links({ label, items, value, onChange }: {
  label: string;
  items: { id: string; title: string }[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  if (!items.length) return null;
  return <CheckboxList label={label} density="compact" value={value} onChange={onChange}>
    {items.map(item => <CheckboxListItem key={item.id} value={item.id} label={item.title} />)}
  </CheckboxList>;
}

function AssetSelect({ project, value, onChange }: {
  project: Project;
  value: string;
  onChange: (value: string) => void;
}) {
  return <Choice
    label="Project asset"
    value={value}
    onChange={onChange}
    options={[{ value: '', label: 'No linked asset' }, ...project.assets.map(asset => ({ value: asset.id, label: asset.name }))]}
  />;
}

export function SegmentForm({ project, segment, save, close }: CommonProps & {
  segment?: Segment;
  save: (updated: Segment) => boolean;
}) {
  const store = getEditorial(project);
  const [title, setTitle] = useState(segment?.title ?? '');
  const [kind, setKind] = useState<SegmentKind>(segment?.kind ?? SEGMENT_KINDS[0]);
  const [seconds, setSeconds] = useState<number>(segment?.seconds ?? 60);
  const [purpose, setPurpose] = useState(segment?.purpose ?? '');
  const [points, setPoints] = useState(segment?.points.join('\n') ?? '');
  const [questions, setQuestions] = useState(segment?.questions.join('\n') ?? '');
  const [counterarguments, setCounterarguments] = useState(segment?.counterarguments.join('\n') ?? '');
  const [evidenceIds, setEvidenceIds] = useState<string[]>(segment?.evidenceIds ?? []);
  const [claimIds, setClaimIds] = useState<string[]>(segment?.claimIds ?? []);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (save({
      id: segment?.id ?? newId(),
      title: title.trim(),
      purpose: purpose.trim(),
      kind,
      seconds: Number.isFinite(seconds) ? seconds : 60,
      points: fields(points),
      questions: fields(questions),
      counterarguments: fields(counterarguments),
      evidenceIds,
      claimIds,
      cues: segment?.cues ?? []
    })) close();
  }

  return <VStack as="form" gap={3} onSubmit={submit}>
    <Heading level={2}>{segment ? 'Edit segment' : 'Add segment'}</Heading>
    <TextInput label="Segment title" value={title} onChange={setTitle} isRequired />
    <Grid columns={{ minWidth: 180, repeat: 'fit' }} gap={3}>
      <Choice
        label="Segment type"
        value={kind}
        onChange={value => setKind(value as SegmentKind)}
        options={SEGMENT_KINDS.map(value => ({ value, label: value }))}
      />
      <NumberInput label="Runtime in seconds" min={1} max={36000} value={seconds} onChange={value => setSeconds(Number(value) || 60)} />
    </Grid>
    <TextArea label="Purpose" value={purpose} onChange={setPurpose} rows={2} />
    <TextArea label="Talking points, one per line" value={points} onChange={setPoints} rows={4} />
    <TextArea label="Questions, one per line" value={questions} onChange={setQuestions} rows={3} />
    <TextArea label="Counterarguments, one per line" value={counterarguments} onChange={setCounterarguments} rows={3} />
    <Links
      label="Linked evidence"
      value={evidenceIds}
      onChange={setEvidenceIds}
      items={store.evidence.map(item => ({ id: item.id, title: item.versions.at(-1)?.title ?? 'Source' }))}
    />
    <Links
      label="Linked claims"
      value={claimIds}
      onChange={setClaimIds}
      items={store.claims.map(item => ({ id: item.id, title: item.versions.at(-1)?.text ?? 'Claim' }))}
    />
    <FormActions close={close} label="Save segment" />
  </VStack>;
}

export function EvidenceForm({ project, item, save, close }: CommonProps & {
  item?: Evidence;
  save: (version: SourceContent, id?: string, correction?: string) => boolean;
}) {
  const current = item?.versions.at(-1);
  const [title, setTitle] = useState(current?.title ?? '');
  const [locator, setLocator] = useState(current?.locator ?? '');
  const [status, setStatus] = useState<EvidenceState>(current?.status ?? 'Check required');
  const [url, setUrl] = useState(current?.url ?? '');
  const [assetId, setAssetId] = useState(current?.assetId ?? '');
  const [notes, setNotes] = useState(current?.notes ?? '');
  const [correction, setCorrection] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    if (save({
      title: title.trim(),
      url: url.trim(),
      locator: locator.trim(),
      status,
      notes: notes.trim(),
      assetId: assetId || undefined
    }, item?.id, correction.trim())) close();
  }

  return <Pane title={item ? 'Correct source' : 'Add source'} level={2} padding={5}>
    <VStack as="form" gap={3} onSubmit={submit}>
      <TextInput label="Source title" value={title} onChange={setTitle} isRequired />
      <Grid columns={{ minWidth: 180, repeat: 'fit' }} gap={3}>
        <TextInput label="Location in source" value={locator} onChange={setLocator} placeholder="Page, section or timecode" />
        <Choice
          label="Verification"
          value={status}
          onChange={value => setStatus(value as EvidenceState)}
          options={EVIDENCE_STATES.map(state => ({ value: state, label: state }))}
        />
      </Grid>
      <TextInput label="Source URL" type="url" value={url} onChange={setUrl} placeholder="https://" />
      <AssetSelect project={project} value={assetId} onChange={setAssetId} />
      <TextArea label="Research notes" value={notes} onChange={setNotes} rows={3} />
      {item && <TextInput label="Reason for correction" value={correction} onChange={setCorrection} isRequired />}
      <FormActions close={close} label="Save source" />
    </VStack>
  </Pane>;
}

export function ClaimForm({ project, item, save, close }: CommonProps & {
  item?: Claim;
  save: (version: ClaimContent, id?: string, correction?: string) => boolean;
}) {
  const current = item?.versions.at(-1);
  const [claimText, setClaimText] = useState(current?.text ?? '');
  const [status, setStatus] = useState<EvidenceState>(current?.status ?? 'Check required');
  const [evidenceIds, setEvidenceIds] = useState<string[]>(current?.evidenceIds ?? []);
  const [line, setLine] = useState<SourceRef | undefined>(current?.scriptLine);
  const [linked, setLinked] = useState(Boolean(current?.scriptLine));
  const [correction, setCorrection] = useState('');
  const scripted = project.documents.find(document => document.kind !== 'av' && document.blocks.some(block => block.text.trim()));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (save({
      text: claimText.trim(),
      status,
      evidenceIds,
      scriptLine: linked ? line : undefined
    }, item?.id, correction.trim())) close();
  }

  return <Pane title={item ? 'Correct claim' : 'Add shared claim'} level={2} padding={5}>
    <VStack as="form" gap={3} onSubmit={submit}>
      <TextArea label="Exact claim" value={claimText} onChange={setClaimText} rows={3} isRequired />
      <Choice
        label="Verification"
        value={status}
        onChange={value => setStatus(value as EvidenceState)}
        options={EVIDENCE_STATES.map(state => ({ value: state, label: state }))}
      />
      <Links
        label="Evidence for this claim"
        value={evidenceIds}
        onChange={setEvidenceIds}
        items={getEditorial(project).evidence.map(entry => ({ id: entry.id, title: entry.versions.at(-1)?.title ?? 'Source' }))}
      />
      <VStack gap={2}>
        <CheckboxInput
          label="Link the exact line where this claim is said"
          value={linked}
          onChange={next => {
            setLinked(next);
            if (next && !line && scripted) setLine(initialSource(project, scripted));
          }}
        />
        {linked && <SourceFields project={project} value={line} onChange={setLine} />}
      </VStack>
      {item && <TextInput label="Reason for correction" value={correction} onChange={setCorrection} isRequired />}
      <FormActions close={close} label="Save claim" />
    </VStack>
  </Pane>;
}

export function CueForm({ project, cue, segments, segmentId, save, close }: CommonProps & {
  cue?: VisualCue;
  segments: Segment[];
  segmentId?: string;
  save: (id: string, cue: VisualCue) => boolean;
}) {
  const [targetSegment, setTargetSegment] = useState(segmentId ?? segments[0]?.id ?? '');
  const [title, setTitle] = useState(cue?.title ?? '');
  const [type, setType] = useState<CueKind>(cue?.type ?? CUE_KINDS[0]);
  const [status, setStatus] = useState<ApprovalState>(cue?.status ?? APPROVAL_STATES[0]);
  const [specification, setSpecification] = useState(cue?.specification ?? '');
  const [assetId, setAssetId] = useState(cue?.assetId ?? '');

  function submit(event: FormEvent) {
    event.preventDefault();
    if (save(targetSegment, {
      id: cue?.id ?? newId(),
      title: title.trim(),
      type,
      specification: specification.trim(),
      status,
      assetId: assetId || undefined
    })) close();
  }

  return <Pane title={cue ? 'Edit visual cue' : 'Add visual cue'} level={2} padding={5}>
    <VStack as="form" gap={3} onSubmit={submit}>
      <Choice
        label="Episode segment"
        value={targetSegment}
        onChange={setTargetSegment}
        placeholder="Select a segment"
        options={segments.map(segment => ({ value: segment.id, label: segment.title }))}
      />
      <TextInput label="Cue title" value={title} onChange={setTitle} isRequired />
      <Grid columns={{ minWidth: 180, repeat: 'fit' }} gap={3}>
        <Choice
          label="Type"
          value={type}
          onChange={value => setType(value as CueKind)}
          options={CUE_KINDS.map(kind => ({ value: kind, label: kind }))}
        />
        <Choice
          label="Approval"
          value={status}
          onChange={value => setStatus(value as ApprovalState)}
          options={APPROVAL_STATES.map(state => ({ value: state, label: state }))}
        />
      </Grid>
      <TextArea label="Specification" value={specification} onChange={setSpecification} rows={4} />
      <AssetSelect project={project} value={assetId} onChange={setAssetId} />
      <FormActions close={close} label="Save cue" />
    </VStack>
  </Pane>;
}

export function BriefForm({ project, brief, save, close }: CommonProps & {
  brief?: Brief;
  save: (value: Brief) => boolean;
}) {
  const previous = brief?.avSource && sourceDocument(project, brief.avSource);
  const documents = project.documents.filter(document => document.kind === 'av');
  const known = previous && !documents.some(document => document.id === previous.id && document.revisionId === previous.revisionId);
  const entries = known ? [previous, ...documents] : documents;
  const [client, setClient] = useState(brief?.client ?? '');
  const [audience, setAudience] = useState(brief?.audience ?? '');
  const [objective, setObjective] = useState(brief?.objective ?? '');
  const [copy, setCopy] = useState(brief?.copy ?? '');
  const [deliverables, setDeliverables] = useState(brief?.deliverables.join('\n') ?? '');
  const [avKey, setAvKey] = useState(previous ? `${previous.id}:${previous.revisionId}` : '');
  const [approval, setApproval] = useState<ApprovalState>(brief?.approval ?? APPROVAL_STATES[0]);
  const [approver, setApprover] = useState(brief?.approver ?? '');

  function submit(event: FormEvent) {
    event.preventDefault();
    const av = entries.find(document => `${document.id}:${document.revisionId}` === avKey);
    if (save({
      client: client.trim(),
      objective: objective.trim(),
      audience: audience.trim(),
      copy: copy.trim(),
      deliverables: fields(deliverables),
      avSource: av ? sourceFor(project, av) : undefined,
      approval,
      approver: approver.trim()
    })) close();
  }

  return <Pane title={brief ? 'Edit branded brief' : 'Create branded brief'} level={2} padding={5}>
    <VStack as="form" gap={3} onSubmit={submit}>
      <Grid columns={{ minWidth: 180, repeat: 'fit' }} gap={3}>
        <TextInput label="Client" value={client} onChange={setClient} isRequired />
        <TextInput label="Audience" value={audience} onChange={setAudience} />
      </Grid>
      <TextArea label="Objective" value={objective} onChange={setObjective} rows={2} isRequired />
      <TextArea label="Approved or working copy" value={copy} onChange={setCopy} rows={3} />
      <TextArea label="Deliverables, one per line" value={deliverables} onChange={setDeliverables} rows={3} />
      <Choice
        label="Linked AV version"
        value={avKey}
        onChange={setAvKey}
        options={[
          { value: '', label: 'No AV revision linked' },
          ...entries.map(document => {
            const source = sourceFor(project, document);
            return {
              value: `${document.id}:${document.revisionId}`,
              label: `${sourceLabel(project, source)} · ${documents.includes(document) ? 'Current draft' : 'Retained revision'}`
            };
          })
        ]}
      />
      <Grid columns={{ minWidth: 180, repeat: 'fit' }} gap={3}>
        <Choice
          label="Approval"
          value={approval}
          onChange={value => setApproval(value as ApprovalState)}
          options={APPROVAL_STATES.map(item => ({ value: item, label: item }))}
        />
        <TextInput label="Approver" value={approver} onChange={setApprover} />
      </Grid>
      <FormActions close={close} label="Save brief" />
    </VStack>
  </Pane>;
}
