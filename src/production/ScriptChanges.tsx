import { FilePenLine, GitCompareArrows } from 'lucide-react';
import { Dialog, displayDate } from './components';
import { eighthsLabel, orderedDays } from './model';
import type { ProductionPlan, ScriptChange } from './model';

/** A compact flag on a strip or breakdown scene whose script changed after release. */
export function ScriptChangeBadge({ change, onOpen }: { change: ScriptChange; onOpen: () => void }) {
  return <button type="button" className="production-change-badge" onClick={onOpen}
    aria-label={`Review script change for scene ${change.number}`}>
    <FilePenLine size={13} aria-hidden="true" /> {change.status === 'removed' ? 'Cut in draft' : 'Script changed'}
  </button>;
}

/** Summary banner shown above the stripboard or breakdown while the draft is ahead of production. */
export function ScriptChangeBanner({ changes, release, onOpen }: { changes: ScriptChange[]; release: string; onOpen: () => void }) {
  if (!changes.length) return null;
  const count = changes.length;
  return <div className="production-change-banner" role="status">
    <FilePenLine size={18} aria-hidden="true" />
    <div>
      <strong>Script changed since {release}</strong>
      <span>{count} {count === 1 ? 'scene' : 'scenes'} in production {count === 1 ? 'has' : 'have'} edits in the writing draft: {changes.map(change => change.number).join(', ')}.</span>
    </div>
    <button type="button" className="production-button" onClick={onOpen}>Review script changes</button>
  </div>;
}

function stripSummary(plan: ProductionPlan, sceneId: string): string {
  const days = orderedDays(plan);
  const placements = plan.strips.filter(strip => strip.sceneId === sceneId).flatMap(strip => {
    const index = days.findIndex(day => day.id === strip.dayId);
    return index < 0 ? [] : [`Day ${index + 1} · ${displayDate(days[index].date)} at ${strip.startTime}`];
  });
  return placements.length ? placements.join('; ') : 'Not scheduled';
}

/** Lists what changed for each affected scene and hands off to the release review. */
export function ScriptChangeDialog({ plan, changes, focus, release, onClose, onReview }: {
  plan: ProductionPlan;
  changes: ScriptChange[];
  focus?: string;
  release: string;
  onClose: () => void;
  onReview?: () => void;
}) {
  const ordered = focus ? [...changes].sort((a, b) => Number(b.sceneId === focus) - Number(a.sceneId === focus)) : changes;
  return <Dialog title="Script changes since release" onClose={onClose}>
    <p className="production-muted">
      Production still uses {release}. Issue the current writing draft to confirm how each scene&rsquo;s breakdown, shots and strips carry forward.
    </p>
    <ul className="production-change-list">
      {ordered.map(change => {
        const tags = plan.tags.filter(tag => tag.sceneId === change.sceneId).length;
        const shots = plan.shots.filter(shot => shot.sceneId === change.sceneId).length;
        return <li key={change.sceneId} className={change.sceneId === focus ? 'is-focus' : undefined}>
          <div className="production-change-heading">
            <strong>{change.number} · {change.heading || 'Untitled scene'}</strong>
            <span className={`production-change-state is-${change.status}`}>{change.status === 'removed' ? 'Removed from draft' : 'Edited'}</span>
          </div>
          <dl>
            {change.headingAfter !== undefined && <><dt>Heading</dt><dd>{change.headingAfter || 'Untitled scene'}</dd></>}
            {change.eighthsAfter !== undefined && <><dt>Est. length</dt><dd>
              {change.eighthsAfter === change.eighthsBefore ? `${eighthsLabel(change.eighthsAfter)} pages (unchanged)` : `${eighthsLabel(change.eighthsBefore)} → ${eighthsLabel(change.eighthsAfter)} pages`}
            </dd></>}
            {change.charactersAdded.length > 0 && <><dt>New speaking roles</dt><dd>{change.charactersAdded.join(', ')}</dd></>}
            {change.charactersRemoved.length > 0 && <><dt>No longer speaking</dt><dd>{change.charactersRemoved.join(', ')}</dd></>}
            <dt>Schedule</dt><dd>{stripSummary(plan, change.sceneId)}</dd>
            <dt>Linked work</dt><dd>{tags} breakdown {tags === 1 ? 'tag' : 'tags'} · {shots} {shots === 1 ? 'shot' : 'shots'}</dd>
          </dl>
        </li>;
      })}
    </ul>
    <div className="production-actions production-right">
      <button type="button" className="production-button" onClick={onClose}>Close</button>
      {onReview && <button type="button" className="production-button production-primary" onClick={() => { onClose(); onReview(); }}>
        <GitCompareArrows size={16} /> Issue draft and review links
      </button>}
    </div>
  </Dialog>;
}
