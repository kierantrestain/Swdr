import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import type { Project, WorkspaceViewProps } from '../model';
import { CLAIM_LANES, claimBoard } from './editorial-model';
import type { ClaimLane, EditorialStore } from './editorial-model';
import { SourceButton } from './StoryControls';
import { sourceText } from './source';

const laneNotes: Record<ClaimLane, string> = {
  Unsourced: 'No evidence linked yet',
  Sourced: 'Evidence linked · verification pending',
  Verified: 'Cleared for the host to say',
  Disputed: 'Claim or a linked source is contested'
};

function safeURL(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

export function ClaimBoard({ project, store, documentId, onOpen, openSegment, correct }: {
  project: Project; store: EditorialStore; documentId: string; onOpen: WorkspaceViewProps['onOpenSource'];
  openSegment: (documentId: string, segmentId: string) => void; correct?: (claimId: string) => void;
}) {
  const [scope, setScope] = useState<'episode' | 'series'>('series');
  const all = claimBoard(project, store);
  const cards = scope === 'series' ? all : all.filter(card => card.uses.some(use => use.documentId === documentId)
    || card.version.scriptLine?.documentId === documentId);
  const asset = (id?: string) => id ? project.assets.find(item => item.id === id) : undefined;
  return <section className="swdr-claim-board" aria-labelledby="swdr-claim-board-title">
    <div className="swdr-story-card-head">
      <div><h2 id="swdr-claim-board-title">Claim verification</h2>
        <p className="swdr-story-muted">{CLAIM_LANES.map(lane => `${cards.filter(card => card.lane === lane).length} ${lane.toLowerCase()}`).join(' · ')}</p></div>
      <div className="swdr-story-segmented" role="group" aria-label="Claim scope">
        <button type="button" aria-pressed={scope === 'episode'} className={scope === 'episode' ? 'selected' : 'quiet'} onClick={() => setScope('episode')}>This episode</button>
        <button type="button" aria-pressed={scope === 'series'} className={scope === 'series' ? 'selected' : 'quiet'} onClick={() => setScope('series')}>Whole series</button>
      </div>
    </div>
    <div className="swdr-claim-lanes">
      {CLAIM_LANES.map(lane => {
        const entries = cards.filter(card => card.lane === lane);
        return <section key={lane} className={`swdr-claim-lane lane-${lane.toLowerCase()}`} aria-label={`${lane} claims`}>
          <header><h3>{lane}</h3><span>{entries.length}</span><p>{laneNotes[lane]}</p></header>
          {entries.map(card => {
            const usedEpisodes = new Set(card.uses.map(use => use.documentId)).size;
            return <article className="swdr-claim-card" key={card.id} aria-label={card.version.text}>
              <p className="swdr-claim-text">{card.version.text}</p>
              <small className="swdr-story-muted">Marked {card.version.status}{card.corrections ? ` · ${card.corrections} correction${card.corrections === 1 ? '' : 's'}` : ''}</small>
              {card.warnings.length > 0 && <ul className="swdr-claim-warnings">{card.warnings.map(warning =>
                <li key={warning}><AlertTriangle size={13} aria-hidden="true" />{warning}</li>)}</ul>}
              <h4>Evidence</h4>
              {card.sources.length ? <ul className="swdr-claim-sources">{card.sources.map(({ id, version }) => {
                const href = safeURL(version.url);
                const file = asset(version.assetId);
                return <li key={id}><span className={`swdr-claim-dot is-${version.status.replace(/\s+/g, '-').toLowerCase()}`} aria-hidden="true" />
                  <div><strong>{version.title}</strong><small>{[version.status, version.locator].filter(Boolean).join(' · ')}</small>
                    {href && <a href={href} target="_blank" rel="noopener noreferrer">Open source</a>}
                    {!href && file && <a href={file.dataUrl} download={file.name}>Open {file.name}</a>}</div></li>;
              })}</ul> : <p className="swdr-story-muted">No linked evidence.</p>}
              {card.version.scriptLine && <>
                <h4>Script line</h4>
                <blockquote>{sourceText(project, card.version.scriptLine) || 'Linked line'}</blockquote>
                <SourceButton project={project} source={card.version.scriptLine} onOpen={onOpen} />
              </>}
              <h4>Used in {usedEpisodes} episode{usedEpisodes === 1 ? '' : 's'}</h4>
              <div className="swdr-claim-uses">{card.uses.slice(0, 4).map(use =>
                <button type="button" className="quiet" key={`${use.documentId}:${use.segmentId}`} onClick={() => openSegment(use.documentId, use.segmentId)}
                  aria-label={`Open ${use.segmentTitle} in ${use.episode}`}>{use.episode} · {use.segmentTitle}</button>)}
                {card.uses.length > 4 && <span className="swdr-story-muted">+{card.uses.length - 4} more segments</span>}</div>
              {correct && <button type="button" onClick={() => correct(card.id)}>Correct claim</button>}
            </article>;
          })}
          {!entries.length && <p className="swdr-story-muted">None</p>}
        </section>;
      })}
    </div>
  </section>;
}
