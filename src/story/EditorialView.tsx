import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Divider } from '@astryxdesign/core/Divider';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Link } from '@astryxdesign/core/Link';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { SelectableCard } from '@astryxdesign/core/SelectableCard';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { Table, pixel, proportional } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { ToggleButton } from '@astryxdesign/core/ToggleButton';
import { VStack } from '@astryxdesign/core/VStack';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { ArrowDown, ArrowUp, ClipboardCheck, Download, Expand, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { durationLabel } from '../model';
import type { Project, WorkspaceViewProps } from '../model';
import { PageHeader } from '../shell/PageHeader';
import { BriefForm, ClaimForm, CueForm, EvidenceForm, SegmentForm } from './EditorialForms';
import {
  editorialRuntime, getEditorial, getEditorialDraft, issueCorrections, issueEditorial, issueManifest,
  OUTPUT_LABELS, previewEditorial, removeSegment, renderEditorialOutput, reorderSegments, saveBrief, saveClaim,
  saveEvidence, saveSegment, segmentTimes
} from './editorial-model';
import type { Claim, EditorialIssue, Evidence, Output, Segment, SourceVersion, VisualCue } from './editorial-model';
import { ClaimBoard } from './ClaimBoard';
import { Choice, Empty, FormError, Glyph, Pane, PaneHeading, SourceButton, Split } from './StoryControls';
import { QuietDotTag } from './StoryParts';
import { downloadText, episodeCode, fileStem, orderedEpisodes, upsert } from './source';

const PANES = ['Segments', 'Sources', 'Claims', 'Host guide', 'Producer rundown', 'Graphics', 'Issues', 'Branded brief'] as const;
type PaneName = (typeof PANES)[number];
type FormState = { kind: 'segment'; segment?: Segment }
  | { kind: 'evidence'; item?: Evidence }
  | { kind: 'claim'; item?: Claim }
  | { kind: 'cue'; segmentId?: string; cue?: VisualCue }
  | { kind: 'brief' };

const OUTPUT_KEYS = Object.keys(OUTPUT_LABELS) as Output[];
const paneSlug = (pane: PaneName) => pane.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const statusDot = (status: string) =>
  status === 'Verified' || status === 'Approved' ? 'var(--color-success)'
    : status === 'Contested' ? 'var(--color-error)'
      : status === 'In review' || status === 'Unverified' || status === 'Needs check' ? 'var(--color-warning)'
        : 'var(--color-text-secondary)';

function Bullets({ title, entries }: { title: string; entries: string[] }) {
  if (!entries.length) return null;
  return <VStack as="section" gap={1.5}>
    <Heading level={3}>{title}</Heading>
    <VStack as="ul" gap={1} style={{ margin: 0, paddingLeft: 'var(--spacing-5)' }}>
      {entries.map((entry, i) => (
        <VStack as="li" key={`${i}-${entry}`} gap={0} style={{ display: 'list-item' }}>
          <Text>{entry}</Text>
        </VStack>
      ))}
    </VStack>
  </VStack>;
}

function safeURL(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

function SourceCard({ item, edit }: { item: SourceVersion; edit?: () => void }) {
  const href = safeURL(item.url);
  return <Card role="article" variant="muted" padding={3}>
    <VStack gap={1.5} hAlign="start">
      <HStack gap={2} align="center" wrap="wrap">
        <Text weight="semibold">{item.title}</Text>
        <QuietDotTag dotColor={statusDot(item.status)} label={item.status} />
      </HStack>
      {item.locator && <Text type="supporting" color="secondary" size="xsm">{item.locator}</Text>}
      {item.notes && <Text type="supporting" color="secondary">{item.notes}</Text>}
      <HStack gap={2} align="center" wrap="wrap">
        {href && <Link href={href} target="_blank" rel="noopener noreferrer">Open source</Link>}
        {edit && <Button size="sm" label="Correct source" onClick={edit} />}
      </HStack>
    </VStack>
  </Card>;
}

function OutputPreview({ issue, output }: { issue: EditorialIssue; output: Output }) {
  const sections = renderEditorialOutput(issue, output).trim().split('\n\n');
  return <Card role="article" padding={5} maxWidth={860}>
    <VStack gap={3}>
      {sections.map((section, i) => {
        if (section.startsWith('### ')) return <Heading key={i} level={4}>{section.slice(4)}</Heading>;
        if (section.startsWith('## ')) return <VStack key={i} gap={2}>{i > 0 && <Divider />}<Heading level={2}>{section.slice(3)}</Heading></VStack>;
        if (section.startsWith('# ')) return <Heading key={i} level={2}>{section.slice(2)}</Heading>;
        if (section.startsWith('- ')) {
          return <VStack as="ul" key={i} gap={1} style={{ margin: 0, paddingLeft: 'var(--spacing-5)' }}>
            {section.split('\n').map((line, index) => (
              <VStack as="li" key={index} gap={0} style={{ display: 'list-item' }}>
                <Text>{line.slice(2)}</Text>
              </VStack>
            ))}
          </VStack>;
        }
        return <Text key={i}>{section}</Text>;
      })}
    </VStack>
  </Card>;
}

interface CueRow extends Record<string, unknown> {
  id: string;
  segment: Segment;
  cue: VisualCue;
}

export function EditorialView({ project, document, onProjectChange, onOpenSource, onStatus, readOnly, tab, onTabChange, onSelectDocument }: WorkspaceViewProps & {
  /** The editorial pane named in the address, e.g. claims. */
  tab?: string;
  onTabChange?: (tab: string) => void;
  /** Called when the writer opens another document here, so the address and shell follow it. */
  onSelectDocument?: (documentId: string) => void;
}) {
  const episodes = orderedEpisodes(project);
  const [selectedDocumentId, setSelectedState] = useState(document.id);
  const [segmentId, setSegmentId] = useState('');
  const [shownDocument, setShownDocument] = useState(document.id);
  if (shownDocument !== document.id) {
    setShownDocument(document.id);
    if (document.id !== selectedDocumentId) {
      setSelectedState(document.id);
      setSegmentId('');
    }
  }
  const setSelectedDocumentId = (id: string) => {
    setSelectedState(id);
    onSelectDocument?.(id);
  };
  const current = project.documents.find(item => item.id === selectedDocumentId) ?? document;
  const episode = episodes.find(item => item.id === current.episodeId);
  const [localPane, setLocalPane] = useState<PaneName>(() => PANES.find(item => paneSlug(item) === tab) ?? 'Segments');
  const pane = onTabChange ? PANES.find(item => paneSlug(item) === tab) ?? 'Segments' : localPane;
  const setPane = (next: PaneName) => {
    setLocalPane(next);
    onTabChange?.(paneSlug(next));
  };
  const [research, setResearch] = useState(true);
  const [focus, setFocus] = useState(false);
  const [form, setForm] = useState<FormState>();
  const [error, setError] = useState('');
  const [issueId, setIssueId] = useState('');
  const wideThreeCol = useMediaQuery('(min-width: 1120px)');
  const wideTwoCol = useMediaQuery('(min-width: 780px)');

  const store = useMemo(() => getEditorial(project), [project]);
  const draft = getEditorialDraft(store, current.id);
  const timing = segmentTimes(draft.segments);
  const runtime = editorialRuntime(draft.segments);
  const active = draft.segments.find(segment => segment.id === segmentId) ?? draft.segments[0];
  const activeIndex = active ? draft.segments.findIndex(segment => segment.id === active.id) : -1;
  const matchingIssues = store.issues.filter(issue => issue.source.documentId === current.id).slice().reverse();
  const selectedIssue = matchingIssues.find(issue => issue.id === issueId) ?? matchingIssues[0];
  const preview = previewEditorial(project, current);
  const activeClaims = preview.claims.filter(claim => active?.claimIds.includes(claim.id));
  const activeSources = preview.sources.filter(source => active?.evidenceIds.includes(source.id)
    || activeClaims.some(claim => claim.version.evidenceIds.includes(source.id)));
  const docLabel = project.kind === 'commercial' ? 'Commercial' : project.kind === 'documentary' ? 'Documentary' : 'Long-form editorial';
  const minutes = Math.round(runtime / 60);

  useEffect(() => {
    if (!focus) return;
    function exit(event: KeyboardEvent) {
      if (event.key === 'Escape') setFocus(false);
    }
    window.addEventListener('keydown', exit);
    return () => window.removeEventListener('keydown', exit);
  }, [focus]);

  function update(action: (value: Project) => Project, message: string): boolean {
    try {
      onProjectChange(action);
      setError('');
      onStatus(message);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The editorial record could not be saved.');
      return false;
    }
  }

  function go(next: PaneName) {
    setPane(next);
    setForm(undefined);
    setError('');
  }

  function issue() {
    if (update(value => issueEditorial(value, current.id), 'Four editorial outputs issued from the same revision.')) {
      setIssueId('');
      go('Issues');
    }
  }

  function exportOutput(source: EditorialIssue, kind: Output) {
    const suffix = source.number ? `issue-${source.number}` : 'working';
    downloadText(`${fileStem(source.documentTitle)}-${suffix}-${kind}.md`, renderEditorialOutput(source, kind));
    onStatus(`${OUTPUT_LABELS[kind]} exported.`);
  }

  function saveCue(id: string, cue: VisualCue, oldSegment?: string): boolean {
    return update(value => {
      const liveDraft = getEditorialDraft(getEditorial(value), current.id);
      const segment = liveDraft.segments.find(segment => segment.id === id);
      if (!segment || !cue.title) throw new Error('Enter a title and choose an episode segment.');
      let next = value;
      if (oldSegment && oldSegment !== id) {
        const previous = liveDraft.segments.find(segment => segment.id === oldSegment);
        if (previous) next = saveSegment(next, current.id, { ...previous, cues: previous.cues.filter(item => item.id !== cue.id) });
      }
      return saveSegment(next, current.id, { ...segment, cues: upsert(segment.cues, cue) });
    }, 'Visual cue saved.');
  }

  const close = () => setForm(undefined);
  const canEdit = !readOnly;
  const isSegmentPane = focus || pane === 'Segments';
  const cueRows: CueRow[] = draft.segments.flatMap(segment => segment.cues.map(cue => ({ id: cue.id, segment, cue })));

  const segmentGridTemplate = focus
    ? 'minmax(0, 1fr)'
    : wideThreeCol && research
      ? 'minmax(180px, 0.85fr) minmax(0, 2fr) minmax(200px, 0.95fr)'
      : wideTwoCol
        ? 'minmax(180px, 0.8fr) minmax(0, 2fr)'
        : 'minmax(0, 1fr)';

  return <VStack gap={5} id="main-content" className="swdr-page" aria-label="Editorial workspace">
    <PageHeader
      eyebrow={docLabel}
      title={current.title}
      subtitle={[docLabel, episode && episodeCode(episode), runtime > 0 && `${minutes}-minute outline`].filter(Boolean).join(' · ')}
      actions={<HStack gap={2} align="center" wrap="wrap">
        {project.documents.length > 1 && !focus && (
          <Choice
            label="Editorial document"
            isLabelHidden
            size="sm"
            width={236}
            value={current.id}
            onChange={id => { setSelectedDocumentId(id); setSegmentId(''); setIssueId(''); close(); }}
            options={project.documents.map(item => ({ value: item.id, label: item.title }))}
          />
        )}
        {!focus && (
          <ToggleButton size="sm" label="Research layout" isPressed={research} onPressedChange={setResearch}>
            Research layout
          </ToggleButton>
        )}
        <ToggleButton size="sm" label={focus ? 'Exit focus' : 'Focus'} icon={<Glyph icon={Expand} size="xsm" />} isPressed={focus} onPressedChange={setFocus}>
          {focus ? 'Exit focus' : 'Focus'}
        </ToggleButton>
        {canEdit && !focus && (
          <Button
            size="sm"
            variant="primary"
            label="Issue outputs"
            isDisabled={!draft.segments.length && !draft.brief}
            onClick={issue}
          />
        )}
      </HStack>}
    />

    {!focus && (
      <TabList value={pane} onChange={value => go(value as PaneName)} hasDivider aria-label="Editorial workspaces">
        {PANES.map(item => (
          <Tab
            key={item}
            value={item}
            label={item}
            endContent={item === 'Issues' && matchingIssues.length > 0 ? <Badge variant="neutral" label={String(matchingIssues.length)} /> : undefined}
          />
        ))}
      </TabList>
    )}

    <FormError>{error}</FormError>

    {isSegmentPane && (
      <Grid columns={1} gap={4} align="start" style={{ gridTemplateColumns: segmentGridTemplate }}>
        {!focus && (
          <Pane title="Episode segments" level={2} padding={4} label="Episode segments">
            <VStack as="ol" gap={2} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {draft.segments.map((segment, i) => (
                <VStack as="li" key={segment.id} gap={0} style={{ listStyle: 'none' }}>
                  <SelectableCard
                    label={segment.title}
                    isSelected={active?.id === segment.id}
                    onChange={() => { setSegmentId(segment.id); close(); }}
                    padding={3}
                    variant={active?.id === segment.id ? 'blue' : 'muted'}
                  >
                    <VStack gap={0.5} hAlign="start">
                      <Text weight="semibold" size="sm">{segment.title}</Text>
                      <Text type="supporting" color="secondary" size="xsm">
                        {durationLabel(segment.seconds)} · starts {durationLabel(timing[i].from)}
                      </Text>
                    </VStack>
                  </SelectableCard>
                </VStack>
              ))}
            </VStack>
            {canEdit && <Button size="sm" label="Add segment" icon={<Glyph icon={Plus} size="xsm" />} onClick={() => setForm({ kind: 'segment' })} />}
          </Pane>
        )}

        <Card padding={5} role="region" aria-label="Segment outline">
          <VStack gap={4}>
            {form?.kind === 'segment' && canEdit ? (
              <SegmentForm
                key={form.segment?.id ?? 'new'}
                project={project}
                segment={form.segment}
                close={close}
                save={segment => {
                  const saved = update(value => saveSegment(value, current.id, segment), 'Segment saved.');
                  if (saved) setSegmentId(segment.id);
                  return saved;
                }}
              />
            ) : active ? <>
              <PaneHeading
                title={active.title}
                description={`${durationLabel(active.seconds)} estimated · ${active.kind}`}
                level={2}
                actions={canEdit && !focus && <HStack gap={1.5} align="center">
                  <Button size="sm" label="Edit segment" onClick={() => setForm({ kind: 'segment', segment: active })} />
                  <IconButton
                    size="sm"
                    variant="secondary"
                    label="Move segment earlier"
                    icon={<Glyph icon={ArrowUp} size="xsm" />}
                    isDisabled={activeIndex <= 0}
                    onClick={() => update(value => reorderSegments(value, current.id, active.id, -1), 'Segment moved earlier.')}
                  />
                  <IconButton
                    size="sm"
                    variant="secondary"
                    label="Move segment later"
                    icon={<Glyph icon={ArrowDown} size="xsm" />}
                    isDisabled={activeIndex >= draft.segments.length - 1}
                    onClick={() => update(value => reorderSegments(value, current.id, active.id, 1), 'Segment moved later.')}
                  />
                </HStack>}
              />
              <Divider />
              {active.purpose && <VStack as="section" gap={1}>
                <Heading level={3}>Purpose</Heading>
                <Text>{active.purpose}</Text>
              </VStack>}
              <Bullets title="Key talking points" entries={active.points} />
              <Bullets title="Questions" entries={active.questions} />
              <Bullets title="Counterarguments" entries={active.counterarguments} />
              {activeClaims.length > 0 && <VStack as="section" gap={1.5}>
                <Heading level={3}>Linked claims</Heading>
                <VStack as="ul" gap={1.5} style={{ margin: 0, paddingLeft: 'var(--spacing-5)' }}>
                  {activeClaims.map(claim => (
                    <VStack as="li" key={claim.id} gap={0} style={{ display: 'list-item' }}>
                      <HStack gap={2} align="center" wrap="wrap">
                        <QuietDotTag dotColor={statusDot(claim.version.status)} label={claim.version.status} />
                        <Text>{claim.version.text}</Text>
                      </HStack>
                    </VStack>
                  ))}
                </VStack>
              </VStack>}
              {!focus && <>
                <Divider />
                <HStack gap={2} wrap="wrap">
                  <Button size="sm" variant="ghost" label={`${activeSources.length} linked source${activeSources.length === 1 ? '' : 's'}`} onClick={() => go('Sources')} />
                  <Button size="sm" variant="ghost" label={`${active.cues.length} visual cue${active.cues.length === 1 ? '' : 's'}`} onClick={() => go('Graphics')} />
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      label="Remove segment"
                      icon={<Glyph icon={Trash2} size="xsm" />}
                      onClick={() => {
                        if (window.confirm('Remove this segment from the working outline?')) {
                          update(value => removeSegment(value, current.id, active.id), 'Segment removed.');
                        }
                      }}
                    />
                  )}
                </HStack>
              </>}
            </> : (
              <Empty
                title="Start the episode outline"
                description="Add a segment with its runtime, talking points and evidence."
                action={canEdit && <Button variant="primary" label="Add first segment" onClick={() => setForm({ kind: 'segment' })} />}
              />
            )}
          </VStack>
        </Card>

        {research && !focus && (
          <Pane title="Research and evidence" level={2} padding={4} label="Research and evidence">
            <VStack gap={3}>
              {activeSources.map(source => <SourceCard key={source.id} item={source.version} />)}
              {!activeSources.length && <Text type="supporting" color="secondary">No evidence linked to this segment.</Text>}
              <Divider />
              <Heading level={3}>Graphics and cues</Heading>
              {active?.cues.map(cue => (
                <Card role="article" variant="muted" padding={3} key={cue.id}>
                  <VStack gap={0.5}>
                    <Text weight="semibold" size="sm">{cue.title}</Text>
                    <Text type="supporting" color="secondary" size="xsm">{cue.type} · {cue.status}</Text>
                  </VStack>
                </Card>
              ))}
              <HStack justify="start">
                <Button size="sm" label="Open graphics register" onClick={() => go('Graphics')} />
              </HStack>
            </VStack>
          </Pane>
        )}
      </Grid>
    )}

    {!focus && pane === 'Sources' && <VStack gap={4}>
      <HStack gap={2} wrap="wrap">
        {canEdit && <>
          <Button variant="primary" size="sm" label="Add source" icon={<Glyph icon={Plus} size="xsm" />} onClick={() => setForm({ kind: 'evidence' })} />
          <Button size="sm" label="Add shared claim" icon={<Glyph icon={Plus} size="xsm" />} onClick={() => setForm({ kind: 'claim' })} />
        </>}
        <Button size="sm" label="Download research preview" icon={<Glyph icon={Download} size="xsm" />} onClick={() => exportOutput(preview, 'research')} />
      </HStack>

      {form?.kind === 'evidence' && canEdit && (
        <EvidenceForm
          project={project}
          key={form.item?.id ?? 'new-source'}
          item={form.item}
          close={close}
          save={(source, id, correction) => update(value => saveEvidence(value, source, id, correction), 'Source version saved.')}
        />
      )}

      {form?.kind === 'claim' && canEdit && (
        <ClaimForm
          project={project}
          key={form.item?.id ?? 'new-claim'}
          item={form.item}
          close={close}
          save={(claim, id, correction) => update(value => saveClaim(value, claim, id, correction), 'Claim version saved.')}
        />
      )}

      <Split
        ratio={[1, 1]}
        breakpoint={880}
        main={
          <Pane title="Project evidence" level={2} padding={5}>
            <VStack gap={3}>
              {store.evidence.map(item => {
                const version = item.versions.at(-1);
                if (!version) return null;
                return <VStack key={item.id} gap={1.5}>
                  <SourceCard item={version} edit={canEdit ? () => setForm({ kind: 'evidence', item }) : undefined} />
                  {item.versions.length > 1 && (
                    <Collapsible defaultIsOpen={false} trigger={<Text type="supporting" color="secondary">Correction history ({item.versions.length})</Text>}>
                      <VStack as="ul" gap={1} style={{ margin: 0, paddingLeft: 'var(--spacing-5)' }}>
                        {item.versions.slice().reverse().map(entry => (
                          <VStack as="li" key={entry.revisionId} gap={0} style={{ display: 'list-item' }}>
                            <Text type="supporting" color="secondary">{entry.title} · {entry.correction || 'Original source'}</Text>
                          </VStack>
                        ))}
                      </VStack>
                    </Collapsible>
                  )}
                </VStack>;
              })}
              {!store.evidence.length && <Text type="supporting" color="secondary">Add evidence to cite it in segments and claims.</Text>}
            </VStack>
          </Pane>
        }
        side={
          <Pane title="Shared claims" level={2} padding={5}>
            <VStack gap={3}>
              {store.claims.map(item => {
                const version = item.versions.at(-1);
                if (!version) return null;
                const linked = store.evidence.filter(evidence => version.evidenceIds.includes(evidence.id));
                return <Card role="article" variant="muted" padding={3} key={item.id}>
                  <VStack gap={2} hAlign="start">
                    <Text weight="semibold">{version.text}</Text>
                    <HStack gap={2} align="center" wrap="wrap">
                      <QuietDotTag dotColor={statusDot(version.status)} label={version.status} />
                      <Text type="supporting" color="secondary" size="xsm">
                        {linked.map(source => source.versions.at(-1)?.title).filter(Boolean).join(', ') || 'No linked evidence'}
                      </Text>
                    </HStack>
                    {canEdit && <Button size="sm" label="Correct claim" onClick={() => setForm({ kind: 'claim', item })} />}
                    {item.versions.length > 1 && (
                      <Collapsible defaultIsOpen={false} trigger={<Text type="supporting" color="secondary">Correction history ({item.versions.length})</Text>}>
                        <VStack as="ul" gap={1} style={{ margin: 0, paddingLeft: 'var(--spacing-5)' }}>
                          {item.versions.slice().reverse().map(entry => (
                            <VStack as="li" key={entry.revisionId} gap={0} style={{ display: 'list-item' }}>
                              <Text type="supporting" color="secondary">{entry.text} · {entry.correction || 'Original claim'}</Text>
                            </VStack>
                          ))}
                        </VStack>
                      </Collapsible>
                    )}
                  </VStack>
                </Card>;
              })}
              {!store.claims.length && <Text type="supporting" color="secondary">A shared claim can be linked from more than one episode.</Text>}
            </VStack>
          </Pane>
        }
      />
    </VStack>}

    {!focus && pane === 'Claims' && <VStack gap={4}>
      {form?.kind === 'claim' && canEdit && (
        <ClaimForm
          project={project}
          key={form.item?.id ?? 'new-claim'}
          item={form.item}
          close={close}
          save={(claim, id, correction) => update(value => saveClaim(value, claim, id, correction), 'Claim version saved.')}
        />
      )}
      <ClaimBoard
        project={project}
        store={store}
        documentId={current.id}
        onOpen={onOpenSource}
        openSegment={(documentId, id) => { setSelectedDocumentId(documentId); setSegmentId(id); setIssueId(''); go('Segments'); }}
        correct={canEdit ? id => setForm({ kind: 'claim', item: store.claims.find(claim => claim.id === id) }) : undefined}
      />
    </VStack>}

    {!focus && (pane === 'Host guide' || pane === 'Producer rundown') && <VStack gap={4}>
      <HStack>
        <Button size="sm" label="Download working preview" icon={<Glyph icon={Download} size="xsm" />} onClick={() => exportOutput(preview, pane === 'Host guide' ? 'host' : 'rundown')} />
      </HStack>
      <OutputPreview issue={preview} output={pane === 'Host guide' ? 'host' : 'rundown'} />
    </VStack>}

    {!focus && pane === 'Graphics' && <VStack gap={4}>
      <HStack gap={2} wrap="wrap">
        {canEdit && (
          <Button variant="primary" size="sm" label="Add visual cue" icon={<Glyph icon={Plus} size="xsm" />} isDisabled={!draft.segments.length} onClick={() => setForm({ kind: 'cue', segmentId: active?.id })} />
        )}
        <Button size="sm" label="Download register preview" icon={<Glyph icon={Download} size="xsm" />} onClick={() => exportOutput(preview, 'graphics')} />
      </HStack>
      {form?.kind === 'cue' && canEdit && (
        <CueForm
          key={form.cue?.id ?? 'new-cue'}
          project={project}
          segments={draft.segments}
          segmentId={form.segmentId}
          cue={form.cue}
          close={close}
          save={(id, cue) => saveCue(id, cue, form.segmentId)}
        />
      )}
      <Pane title="Graphics and asset register" level={2} padding={5}>
        {cueRows.length > 0 ? (
          <Table<CueRow>
            density="compact"
            hasHover
            idKey="id"
            data={cueRows}
            columns={[
              {
                key: 'cue',
                header: 'Visual cue',
                width: proportional(3, { minWidth: 200 }),
                renderCell: ({ cue }) => <VStack gap={0.5}>
                  <Text weight="semibold">{cue.title}</Text>
                  {cue.specification && <Text type="supporting" color="secondary" size="xsm">{cue.specification}</Text>}
                </VStack>
              },
              { key: 'segment', header: 'Segment', width: proportional(2), renderCell: ({ segment }) => segment.title },
              { key: 'type', header: 'Type', width: pixel(110), renderCell: ({ cue }) => <QuietDotTag label={cue.type} /> },
              {
                key: 'status',
                header: 'Approval',
                width: pixel(120),
                renderCell: ({ cue }) => <QuietDotTag dotColor={statusDot(cue.status)} label={cue.status} />
              },
              {
                key: 'asset',
                header: 'Asset',
                width: proportional(2),
                renderCell: ({ cue }) => project.assets.find(asset => asset.id === cue.assetId)?.name || '—'
              },
              ...(canEdit ? [{
                key: 'edit',
                header: 'Edit',
                width: pixel(110),
                align: 'end' as const,
                renderCell: ({ segment, cue }: CueRow) => <Button size="sm" label="Edit cue" onClick={() => setForm({ kind: 'cue', segmentId: segment.id, cue })} />
              }] : [])
            ]}
          />
        ) : <Text type="supporting" color="secondary">No visual cues in this outline.</Text>}
      </Pane>
    </VStack>}

    {!focus && pane === 'Issues' && <Pane title="Issued outputs" level={2} padding={5}>
      {selectedIssue ? <VStack gap={4}>
        <Choice
          label="Editorial issue"
          width={320}
          value={selectedIssue.id}
          onChange={setIssueId}
          options={matchingIssues.map(item => ({ value: item.id, label: `Issue ${item.number} · ${new Date(item.issuedAt).toLocaleString('en-GB')}` }))}
        />
        {issueCorrections(store, selectedIssue).length > 0 && (
          <Banner
            status="warning"
            title="Reissue after source corrections"
            description={`${issueCorrections(store, selectedIssue).join(' · ')}. This issue remains available in its original version.`}
          />
        )}
        <HStack gap={3} align="center" wrap="wrap">
          <Text type="supporting" color="secondary">
            Editorial revision {selectedIssue.draft.revisionId} · {durationLabel(editorialRuntime(selectedIssue.draft.segments))}
          </Text>
          <SourceButton project={project} source={selectedIssue.source} onOpen={onOpenSource} label="Open retained script revision" />
        </HStack>
        <Grid columns={{ minWidth: 210, repeat: 'fit' }} gap={3}>
          {OUTPUT_KEYS.map(kind => (
            <Card role="article" variant="muted" padding={4} key={kind}>
              <VStack gap={3} hAlign="start">
                <Heading level={3}>{OUTPUT_LABELS[kind]}</Heading>
                <Button size="sm" label="Download" icon={<Glyph icon={Download} size="xsm" />} onClick={() => exportOutput(selectedIssue, kind)} />
              </VStack>
            </Card>
          ))}
        </Grid>
        <HStack>
          <Button
            size="sm"
            label="Download output manifest"
            onClick={() => {
              downloadText(`${fileStem(current.title)}-issue-${selectedIssue.number}-manifest.json`, JSON.stringify(issueManifest(selectedIssue), null, 2), 'application/json');
              onStatus('Output manifest exported.');
            }}
          />
        </HStack>
      </VStack> : <Text type="supporting" color="secondary">Issue the outline to freeze four outputs and their sources together.</Text>}
    </Pane>}

    {!focus && pane === 'Branded brief' && <VStack gap={4}>
      {form?.kind === 'brief' && canEdit ? (
        <BriefForm
          project={project}
          brief={draft.brief}
          close={close}
          save={brief => update(value => saveBrief(value, current.id, brief), 'Branded brief saved.')}
        />
      ) : (
        <Pane
          title={draft.brief?.client ?? 'Branded brief'}
          level={2}
          padding={5}
          actions={canEdit && <Button size="sm" label={draft.brief ? 'Edit brief' : 'Create brief'} onClick={() => setForm({ kind: 'brief' })} />}
        >
          {draft.brief ? <VStack gap={4}>
            <MetadataList columns={2}>
              <MetadataListItem label="Objective"><Text>{draft.brief.objective}</Text></MetadataListItem>
              <MetadataListItem label="Audience"><Text>{draft.brief.audience || '—'}</Text></MetadataListItem>
              <MetadataListItem label="Copy"><Text>{draft.brief.copy || '—'}</Text></MetadataListItem>
              <MetadataListItem label="Approval" icon={<Glyph icon={ClipboardCheck} size="xsm" color="accent" />}>
                <Text>{[draft.brief.approval, draft.brief.approver].filter(Boolean).join(' · ')}</Text>
              </MetadataListItem>
            </MetadataList>
            <Bullets title="Deliverables" entries={draft.brief.deliverables} />
            {draft.brief.avSource && (
              <HStack>
                <SourceButton project={project} source={draft.brief.avSource} onOpen={onOpenSource} label="Open retained AV version" />
              </HStack>
            )}
          </VStack> : <Text type="supporting" color="secondary">Connect client copy, deliverables and approvals to an AV revision.</Text>}
        </Pane>
      )}
    </VStack>}
  </VStack>;
}
