import { Download, FileCheck2, GitCompareArrows } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { sourceFor } from '../model';
import type { Project, WorkspaceViewProps } from '../model';
import { Breakdown } from './Breakdown';
import { CallSheets } from './CallSheets';
import { Dialog, Empty, SourceButton, downloadText } from './components';
import type { PaneProps } from './components';
import { Reports } from './Reports';
import { RevisionPanel } from './RevisionPanel';
import { Shots } from './Shots';
import { Sides } from './Sides';
import { Stripboard } from './Stripboard';
import {
  applyRevision, getProductionPlan, issueProductionOutput, issueScriptSnapshot, previewRevision, releasedScript,
  scheduleCsv, scriptChanges, setProductionPlan, startProduction
} from './model';
import type { ProductionOutput, RevisionPreview } from './model';
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
  const [releasePanel, setReleasePanel] = useState(false);
  const [target, setTarget] = useState('');
  const [review, setReview] = useState<RevisionPreview>();
  const [error, setError] = useState('');
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
    if (changeProject(current => {
      const active = getProductionPlan(current, document.id);
      if (active?.activeSnapshotId !== plan?.activeSnapshotId) throw new Error('The production baseline changed. Review the current production plan.');
      const release = issueScriptSnapshot(current, document, label);
      const next = { ...current, snapshots: [...current.snapshots, release] };
      if (!active) return startProduction(next, document.id, release.id);
      preview = previewRevision(next, active, release.id);
      return next;
    }, plan ? 'Script issued. Review the production links.' : 'Script issued for production.')) {
      setReleasePanel(false);
      setReview(preview);
    }
  }

  const openRevisions = () => { setReleasePanel(true); setTarget(''); setError(''); };
  const paneProps: PaneProps | undefined = plan && snapshot ? {
    project, plan, snapshot, source: sourceFor(project, snapshot.document), readOnly, update, onOpenSource, onProjectChange, onStatus, issueOutput,
    changes: scriptChanges(project, plan, document), reviewScript: readOnly ? undefined : openRevisions
  } : undefined;

  return <div id="main-content" className="swdr-page production-workspace" aria-label="Production workspace">
    <header className="production-hero">
      <div>
        <h1>{TITLES[pane]}</h1>
        <div className="production-hero-subtitle">
          <span>{episode ? `S${episode.season}E${String(episode.number).padStart(2, '0')} · ${episode.title}` : document.title}</span>
          {snapshot && <><span aria-hidden="true"> · </span><SourceButton source={sourceFor(project, snapshot.document)} onOpenSource={onOpenSource}>{snapshot.label}</SourceButton></>}
        </div>
      </div>
      {paneProps && pane === 'Stripboard' && <div className="production-actions">
        <button type="button" className="production-button" onClick={() => setPane('Reports')}>Day out of days</button>
        {!readOnly && <button type="button" className="production-button production-primary" disabled={!plan?.strips.length} onClick={() =>
          plan && issueOutput('schedule', 'swdr-schedule.csv', scheduleCsv(project, plan))
        }><Download size={16} /> Export schedule</button>}
      </div>}
    </header>
    {!paneProps && <section className="production-card production-release">
      <div className="production-release-icon"><FileCheck2 size={25} aria-hidden="true" /></div>
      <h2>Release a script for production</h2>
      <p>Breakdown, shots and schedules reference an issued snapshot of the script.</p>
      {!readOnly && <div className="production-actions">
        <button type="button" className="production-button production-primary" onClick={() => { setReleasePanel(true); setError(''); }}>Issue writing draft</button>
        {issued.length > 0 && <button type="button" className="production-button" onClick={() => changeProject(
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
      {pane === 'Stripboard' && <Stripboard {...paneProps} />}
      {pane === 'Breakdown' && <Breakdown {...paneProps} />}
      {pane === 'Shots & storyboard' && <Shots {...paneProps} />}
      {pane === 'Sides' && <Sides {...paneProps} />}
      {pane === 'Call sheets' && <CallSheets {...paneProps} />}
      {pane === 'Reports' && <Reports key={tab === 'budget' ? 'budget' : 'reports'} {...paneProps} startAt={tab === 'budget' ? 'Budget' : undefined} />}
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
