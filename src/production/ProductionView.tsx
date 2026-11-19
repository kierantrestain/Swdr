import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { HStack } from '@astryxdesign/core/HStack';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { Download, FileCheck2, GitCompareArrows, Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { sourceFor } from '../model';
import type { Project, WorkspaceViewProps } from '../model';
import { summaryMessage, syncBreakdown } from './autobreakdown';
import type { BreakdownSummary } from './autobreakdown';
import { Breakdown } from './Breakdown';
import { CallSheets } from './CallSheets';
import { Choice, Dialog, Empty, FormError, Glyph, Pane, SourceButton, downloadText } from './components';
import type { PaneProps } from './components';
import { Reports } from './Reports';
import type { ReportSection } from './Reports';
import { RevisionPanel } from './RevisionPanel';
import { Shots } from './Shots';
import { Sides } from './Sides';
import { Stripboard } from './Stripboard';
import {
  applyRevision, getProductionPlan, issueProductionOutput, issueScriptSnapshot, previewRevision, releasedScript,
  scheduleCsv, scriptChanges, setProductionPlan, startProduction
} from './model';
import type { ProductionOutput, RevisionPreview } from './model';
import { PageHeader } from '../shell/PageHeader';
import './print.css';

const PANES = ['Stripboard', 'Breakdown', 'Shots & storyboard', 'Sides', 'Call sheets', 'Reports'] as const;
type Pane = (typeof PANES)[number];
const TITLES: Record<Pane, string> = {
  Stripboard: 'Shooting stripboard', Breakdown: 'Script breakdown', 'Shots & storyboard': 'Shots and storyboard',
  Sides: 'Shooting sides', 'Call sheets': 'Call sheets', Reports: 'Production reports'
};

const SLUGS: Record<Pane, string> = {
  Stripboard: 'schedule', Breakdown: 'breakdown', 'Shots & storyboard': 'shots', Sides: 'sides', 'Call sheets': 'call-sheets', Reports: 'reports'
};

interface ProductionProps extends WorkspaceViewProps {
  /** The pane named in the address (schedule, breakdown, shots, sides, call-sheets, reports or budget). */
  tab?: string;
  onTabChange?: (tab: string) => void;
}

function paneFor(tab?: string): Pane {
  if (tab === 'budget') return 'Reports';
  return PANES.find(pane => SLUGS[pane] === tab) ?? 'Stripboard';
}

export function ProductionView(props: ProductionProps) {
  return <ProductionDocument key={props.document.id} {...props} />;
}

function ProductionDocument({ project, document, readOnly, onProjectChange, onOpenSource, onStatus, tab, onTabChange }: ProductionProps) {
  const plan = getProductionPlan(project, document.id);
  const snapshot = plan && releasedScript(project, document.id, plan.activeSnapshotId);
  const [localPane, setLocalPane] = useState<Pane>(() => paneFor(tab));
  const pane = onTabChange ? paneFor(tab) : localPane;
  const setPane = (next: Pane) => {
    setLocalPane(next);
    onTabChange?.(SLUGS[next]);
  };
  const [reportSection, setReportSection] = useState<ReportSection>(() => tab === 'budget' ? 'Budget' : 'Day out of days');
  const [seenTab, setSeenTab] = useState(tab);
  if (tab !== seenTab) {
    // The sidebar and address can open the budget directly; leaving it returns to the first report.
    setSeenTab(tab);
    if (tab === 'budget') setReportSection('Budget');
    else if (reportSection === 'Budget') setReportSection('Day out of days');
  }
  const chooseReport = (next: ReportSection) => {
    setReportSection(next);
    setLocalPane('Reports');
    onTabChange?.(next === 'Budget' ? 'budget' : SLUGS.Reports);
  };
  const title = pane === 'Reports' && reportSection === 'Budget' ? 'Budget' : TITLES[pane];
  const [releasePanel, setReleasePanel] = useState(false);
  const [releaseLabel, setReleaseLabel] = useState('');
  const [target, setTarget] = useState('');
  const [review, setReview] = useState<RevisionPreview>();
  const [error, setError] = useState('');
  const [synced, setSynced] = useState<BreakdownSummary>();
  const issued = project.snapshots.filter(item => item.kind === 'issued' && item.document.id === document.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const otherReleases = issued.filter(item => item.id !== snapshot?.id);
  const episode = project.episodes.find(item => item.id === document.episodeId);

  function changeProject(change: (project: Project) => Project, message: string): boolean {
    if (readOnly) return false;
    try {
      let applied = false;
      onProjectChange(current => {
        if (current.id !== project.id) return current;
        const next = change(current);
        applied = true;
        return next;
      });
      if (!applied) throw new Error('This project is currently unavailable for editing.');
      setError('');
      onStatus(message);
      return true;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'The production operation could not be completed.';
      setError(message);
      onStatus(message);
      return false;
    }
  }

  const update: PaneProps['update'] = (change, message = 'Production saved.') => changeProject(current => {
    const active = getProductionPlan(current, document.id);
    if (!active || active.activeSnapshotId !== plan?.activeSnapshotId) throw new Error('The production baseline changed. Reopen this panel.');
    return setProductionPlan(current, change(active, current));
  }, message);

  const updateProject: PaneProps['updateProject'] = (change, message = 'Production saved.') => changeProject(current => {
    const active = getProductionPlan(current, document.id);
    if (!active || active.activeSnapshotId !== plan?.activeSnapshotId) throw new Error('The production baseline changed. Reopen this panel.');
    return change(current, active);
  }, message);

  /** Builds cast, locations, scene tags and page eighths from the issued script, then reports what it found. */
  function syncScript(start?: (current: Project) => Project, startMessage?: string) {
    let summary: BreakdownSummary | undefined;
    const done = changeProject(current => {
      const started = start ? start(current) : current;
      const active = getProductionPlan(started, document.id);
      if (!active || (!start && active.activeSnapshotId !== plan?.activeSnapshotId)) throw new Error('The production baseline changed. Reopen this panel.');
      const snapshotKind = releasedScript(started, document.id, active.activeSnapshotId)?.document.kind;
      if (snapshotKind === 'av') return started;
      const result = syncBreakdown(started, active);
      summary = result.summary;
      return setProductionPlan(started, result.plan);
    }, startMessage ?? 'Breakdown built from the script.');
    if (done && summary) {
      setSynced(summary);
      onStatus(summaryMessage(summary));
    }
    return done;
  }

  function issueOutput(kind: ProductionOutput['kind'], filename: string, content: string) {
    if (!plan || readOnly) return;
    if (update((current, currentProject) => ({
      ...current, outputs: [...current.outputs, issueProductionOutput(currentProject, current, kind, filename, content)]
    }), 'Export issued.')) downloadText(filename, content);
  }

  function releaseDraft(event: FormEvent) {
    event.preventDefault();
    if (readOnly) return;
    const label = releaseLabel.trim();
    if (!label) { setError('Name this release, such as Shooting Draft 2.'); return; }
    let preview: RevisionPreview | undefined;
    let built: BreakdownSummary | undefined;
    if (changeProject(current => {
      const active = getProductionPlan(current, document.id);
      if (active?.activeSnapshotId !== plan?.activeSnapshotId) throw new Error('The production baseline changed. Review the current production plan.');
      const release = issueScriptSnapshot(current, document, label);
      const next = { ...current, snapshots: [...current.snapshots, release] };
      if (!active) {
        const started = startProduction(next, document.id, release.id);
        const startedPlan = getProductionPlan(started, document.id)!;
        if (release.document.kind === 'av') return started;
        const result = syncBreakdown(started, startedPlan);
        built = result.summary;
        return setProductionPlan(started, result.plan);
      }
      preview = previewRevision(next, active, release.id);
      return next;
    }, plan ? 'Script issued. Review the production links.' : 'Script issued for production. Cast, locations and page counts were read from the script.')) {
      setReleasePanel(false);
      setReview(preview);
      if (built) setSynced(built);
    }
  }

  const needsBreakdown = Boolean(plan && snapshot && snapshot.document.kind !== 'av' && !plan.breakdownSyncedAt &&
    !plan.people.some(person => person.type === 'Cast') && !plan.locations.length && plan.scenes.length);
  const openRelease = () => { setReleaseLabel(`Shooting Draft ${issued.length + 1}`); setReleasePanel(true); setError(''); };
  const openRevisions = () => { setTarget(''); openRelease(); };
  const paneProps: PaneProps | undefined = plan && snapshot ? {
    project, plan, snapshot, source: sourceFor(project, snapshot.document), readOnly, update, updateProject, onOpenSource, onProjectChange, onStatus, issueOutput,
    syncScript: snapshot.document.kind === 'av' ? undefined : () => { syncScript(); },
    changes: scriptChanges(project, plan, document), reviewScript: readOnly ? undefined : openRevisions
  } : undefined;

  const tabs = <TabList value={pane} onChange={value => { setPane(value as Pane); setError(''); }} hasDivider aria-label="Production tools">
    {PANES.map(label => <Tab key={label} value={label} label={label} />)}
  </TabList>;

  return <VStack gap={5} id="main-content" className="swdr-page" aria-label="Production workspace">
    <PageHeader title={title}
      subtitle={<>
        <Text type="inherit" color="inherit">{episode ? `S${episode.season}E${String(episode.number).padStart(2, '0')} · ${episode.title}` : document.title}</Text>
        {snapshot && <><Text type="inherit" color="inherit" aria-hidden="true"> · </Text><SourceButton source={sourceFor(project, snapshot.document)} onOpenSource={onOpenSource}>{snapshot.label}</SourceButton></>}
      </>}
      actions={paneProps && pane === 'Stripboard' && <>
        <Button label="Day out of days" onClick={() => chooseReport('Day out of days')} />
        {!readOnly && <Button label="Export schedule" variant="primary" icon={<Glyph icon={Download} />} isDisabled={!plan?.strips.length}
          onClick={() => plan && issueOutput('schedule', 'swdr-schedule.csv', scheduleCsv(project, plan))} />}
      </>} />
    {!paneProps && <Pane level={2} title="Release a script for production"
      description="Breakdown, shots and schedules reference an issued snapshot of the script. Issuing reads every scene, speaking role and location from it, with page counts from the page layout.">
      {!readOnly && <HStack gap={2} wrap="wrap">
        <Button label="Issue writing draft" variant="primary" icon={<Glyph icon={FileCheck2} />} onClick={() => { openRelease(); }} />
        {issued.length > 0 && <Button label={`Use ${issued[0].label}`} onClick={() => syncScript(
          current => startProduction(current, document.id, issued[0].id), 'Issued script linked to production.'
        )} />}
      </HStack>}
      {plan && <Empty>The active production snapshot is missing. Restore its project archive to recover the source.</Empty>}
    </Pane>}
    {paneProps && <>
      <HStack gap={3} justify="between" align="end" wrap="wrap">
        {tabs}
        {!readOnly && <Button label="Script revisions" icon={<Glyph icon={GitCompareArrows} />} onClick={openRevisions}
          endContent={paneProps.changes.length > 0 ? <Badge variant="purple" label={String(paneProps.changes.length)} aria-hidden="true" /> : undefined} />}
      </HStack>
      {synced && <BreakdownBanner summary={synced} onDismiss={() => setSynced(undefined)} />}
      {!synced && !readOnly && needsBreakdown && <Banner status="info" icon={<Glyph icon={Sparkles} />} title="Build the breakdown from the script"
        aria-label="Build breakdown from script"
        description={`Read every speaking role, location and scene length from ${snapshot?.label} so the stripboard, cast list and call sheets start filled in.`}
        endContent={<Button label="Build breakdown from script" variant="primary" onClick={() => paneProps.syncScript?.()} />} />}
      {pane === 'Stripboard' && <Stripboard {...paneProps} />}
      {pane === 'Breakdown' && <Breakdown {...paneProps} />}
      {pane === 'Shots & storyboard' && <Shots {...paneProps} />}
      {pane === 'Sides' && <Sides {...paneProps} />}
      {pane === 'Call sheets' && <CallSheets {...paneProps} />}
      {pane === 'Reports' && <Reports {...paneProps} section={reportSection} onSectionChange={chooseReport} />}
    </>}
    {!releasePanel && !review && <FormError>{error}</FormError>}
    {releasePanel && <Dialog title={plan ? 'Production script revisions' : 'Issue writing draft'} width={520} onClose={() => { setReleasePanel(false); setError(''); }}>
      {paneProps && otherReleases.length > 0 && <Card variant="muted" padding={4}>
        <VStack gap={3}>
          <Choice label="Incoming released script" value={target} onChange={setTarget} placeholder="Choose a revision"
            options={otherReleases.map(item => ({ value: item.id, label: `${item.label} · ${item.createdAt.slice(0, 10)}` }))} />
          <HStack><Button label="Review incoming revision" isDisabled={!target} onClick={() => {
            try {
              setReview(previewRevision(project, paneProps.plan, target));
              setReleasePanel(false);
              setError('');
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : 'The incoming revision could not be previewed.');
            }
          }} /></HStack>
        </VStack>
      </Card>}
      <VStack as="form" gap={4} onSubmit={releaseDraft}>
        <Text type="supporting" color="secondary">{plan ? 'Issue the latest writing draft to review which links carry forward.' : 'The issued writing draft becomes a frozen source for this production plan.'}</Text>
        <TextInput label="Release label" value={releaseLabel} onChange={setReleaseLabel} isRequired />
        <FormError>{error}</FormError>
        <HStack justify="end"><Button type="submit" variant="primary" label={plan ? 'Issue and review' : 'Issue script'} /></HStack>
      </VStack>
    </Dialog>}
    {review && <RevisionPanel
      key={review.snapshot.id} preview={review} error={error} onClose={() => { setReview(undefined); setError(''); }}
      onApply={choices => {
        if (changeProject(current => applyRevision(current, document.id, review.snapshot.id, review.previousSnapshotId, choices), 'Production revision applied.')) setReview(undefined);
      }}
    />}
  </VStack>;
}

function BreakdownBanner({ summary, onDismiss }: { summary: BreakdownSummary; onDismiss: () => void }) {
  const flagged = [...summary.removedCast, ...summary.removedLocations];
  return <Banner status="success" title="Breakdown built from the script" isDismissable onDismiss={onDismiss} dismissLabel="Dismiss breakdown summary"
    description={`${summary.scenes} scenes over ${summary.pages} pages · ${summary.cast} speaking roles${summary.addedCast.length ? ` (${summary.addedCast.length} added)` : ''} · ${summary.locations} locations${summary.addedLocations.length ? ` (${summary.addedLocations.length} added)` : ''} · ${summary.tagsAdded} cast tags added${flagged.length ? ` · No longer in the script: ${flagged.join(', ')}` : ''}`}
    collapsible={false} />;
}
