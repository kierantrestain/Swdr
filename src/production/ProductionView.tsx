import { Download, FileCheck2, GitCompareArrows, Sparkles } from 'lucide-react';
import { Banner } from '@astryxdesign/core/Banner';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { sourceFor } from '../model';
import type { Project, WorkspaceViewProps } from '../model';
import { summaryMessage, syncBreakdown } from './autobreakdown';
import type { BreakdownSummary } from './autobreakdown';
import { Breakdown } from './Breakdown';
import { CallSheets } from './CallSheets';
import { Dialog, Empty, SourceButton, downloadText } from './components';
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
import './production.css';

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

  function releaseDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return;
    const label = String(new FormData(event.currentTarget).get('label') ?? '');
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
  const openRevisions = () => { setReleasePanel(true); setTarget(''); setError(''); };
  const paneProps: PaneProps | undefined = plan && snapshot ? {
    project, plan, snapshot, source: sourceFor(project, snapshot.document), readOnly, update, updateProject, onOpenSource, onProjectChange, onStatus, issueOutput,
    syncScript: snapshot.document.kind === 'av' ? undefined : () => { syncScript(); },
    changes: scriptChanges(project, plan, document), reviewScript: readOnly ? undefined : openRevisions
  } : undefined;

  return <div id="main-content" className="swdr-page production-workspace" aria-label="Production workspace">
    <PageHeader className="production-hero" title={title}
      subtitle={<>
        <span>{episode ? `S${episode.season}E${String(episode.number).padStart(2, '0')} · ${episode.title}` : document.title}</span>
        {snapshot && <><span aria-hidden="true"> · </span><SourceButton source={sourceFor(project, snapshot.document)} onOpenSource={onOpenSource}>{snapshot.label}</SourceButton></>}
      </>}
      actions={paneProps && pane === 'Stripboard' && <>
        <button type="button" className="production-button" onClick={() => chooseReport('Day out of days')}>Day out of days</button>
        {!readOnly && <button type="button" className="production-button production-primary" disabled={!plan?.strips.length} onClick={() =>
          plan && issueOutput('schedule', 'swdr-schedule.csv', scheduleCsv(project, plan))
        }><Download size={16} /> Export schedule</button>}
      </>} />
    {!paneProps && <section className="production-card production-release">
      <div className="production-release-icon"><FileCheck2 size={25} aria-hidden="true" /></div>
      <h2>Release a script for production</h2>
      <p>Breakdown, shots and schedules reference an issued snapshot of the script. Issuing reads every scene, speaking role and location from it, with page counts from the page layout.</p>
      {!readOnly && <div className="production-actions">
        <button type="button" className="production-button production-primary" onClick={() => { setReleasePanel(true); setError(''); }}>Issue writing draft</button>
        {issued.length > 0 && <button type="button" className="production-button" onClick={() => syncScript(
          current => startProduction(current, document.id, issued[0].id), 'Issued script linked to production.'
        )}>Use {issued[0].label}</button>}
      </div>}
      {plan && <Empty>The active production snapshot is missing. Restore its project archive to recover the source.</Empty>}
    </section>}
    {paneProps && <>
      <div className="production-workspace-tabs">
        <nav aria-label="Production tools" className="production-actions">
          {PANES.map(label => <button key={label} type="button" className="production-tab" aria-current={pane === label ? 'page' : undefined} onClick={() => { setPane(label); setError(''); }}>
            {label}
          </button>)}
        </nav>
        {!readOnly && <button type="button" className="production-button production-compact" onClick={openRevisions}>
          <GitCompareArrows size={16} /> Script revisions{paneProps.changes.length > 0 && <span className="production-count" aria-hidden="true">{paneProps.changes.length}</span>}
        </button>}
      </div>
      {synced && <section className="production-synced" aria-label="Breakdown summary"><BreakdownBanner summary={synced} onDismiss={() => setSynced(undefined)} /></section>}
      {!synced && !readOnly && needsBreakdown && <section className="production-callout" aria-label="Build breakdown from script">
        <Sparkles size={20} aria-hidden="true" />
        <div><strong>Build the breakdown from the script</strong>
          <p>Read every speaking role, location and scene length from {snapshot?.label} so the stripboard, cast list and call sheets start filled in.</p></div>
        <button type="button" className="production-button production-primary" onClick={() => paneProps.syncScript?.()}>Build breakdown from script</button>
      </section>}
      {pane === 'Stripboard' && <Stripboard {...paneProps} />}
      {pane === 'Breakdown' && <Breakdown {...paneProps} />}
      {pane === 'Shots & storyboard' && <Shots {...paneProps} />}
      {pane === 'Sides' && <Sides {...paneProps} />}
      {pane === 'Call sheets' && <CallSheets {...paneProps} />}
      {pane === 'Reports' && <Reports {...paneProps} section={reportSection} onSectionChange={chooseReport} />}
    </>}
    {error && !releasePanel && !review && <p role="alert" className="production-form-error production-workspace-error">{error}</p>}
    {releasePanel && <Dialog title={plan ? 'Production script revisions' : 'Issue writing draft'} onClose={() => { setReleasePanel(false); setError(''); }}>
      {paneProps && otherReleases.length > 0 && <div className="production-inset">
        <label className="production-field">Incoming released script<select value={target} onChange={event => setTarget(event.target.value)}>
          <option value="">Choose a revision</option>
          {otherReleases.map(item => <option key={item.id} value={item.id}>{item.label} · {item.createdAt.slice(0, 10)}</option>)}
        </select></label>
        <button type="button" className="production-button" disabled={!target} onClick={() => {
          try {
            setReview(previewRevision(project, paneProps.plan, target));
            setReleasePanel(false);
            setError('');
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'The incoming revision could not be previewed.');
          }
        }}>Review incoming revision</button>
      </div>}
      <form className="production-form" onSubmit={releaseDraft}>
        <p className="production-muted">{plan ? 'Issue the latest writing draft to review which links carry forward.' : 'The issued writing draft becomes a frozen source for this production plan.'}</p>
        <label>Release label<input name="label" required defaultValue={`Shooting Draft ${issued.length + 1}`} autoFocus /></label>
        {error && <p role="alert" className="production-form-error">{error}</p>}
        <div className="production-actions production-right">
          <button type="submit" className="production-button production-primary">{plan ? 'Issue and review' : 'Issue script'}</button>
        </div>
      </form>
    </Dialog>}
    {review && <RevisionPanel
      key={review.snapshot.id} preview={review} error={error} onClose={() => { setReview(undefined); setError(''); }}
      onApply={choices => {
        if (changeProject(current => applyRevision(current, document.id, review.snapshot.id, review.previousSnapshotId, choices), 'Production revision applied.')) setReview(undefined);
      }}
    />}
  </div>;
}

function BreakdownBanner({ summary, onDismiss }: { summary: BreakdownSummary; onDismiss: () => void }) {
  const flagged = [...summary.removedCast, ...summary.removedLocations];
  return <Banner status="success" title="Breakdown built from the script" isDismissable onDismiss={onDismiss} dismissLabel="Dismiss breakdown summary"
    description={`${summary.scenes} scenes over ${summary.pages} pages · ${summary.cast} speaking roles${summary.addedCast.length ? ` (${summary.addedCast.length} added)` : ''} · ${summary.locations} locations${summary.addedLocations.length ? ` (${summary.addedLocations.length} added)` : ''} · ${summary.tagsAdded} cast tags added${flagged.length ? ` · No longer in the script: ${flagged.join(', ')}` : ''}`}
    collapsible={false} />;
}
