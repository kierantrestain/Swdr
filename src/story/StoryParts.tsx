import type { Project, WorkspaceViewProps } from '../model';
import type { CanonState } from './series-analysis';
import type { Character, RelationshipState, StoryKind, StoryPoint } from './series-model';
import { SourceButton } from './StoryControls';

export const typeLabels: Record<StoryKind, string> = {
  event: 'Event', appearance: 'Appearance', interaction: 'Interaction',
  relationship: 'Relationship state', knowledge: 'Knowledge', arc: 'Arc milestone'
};

/** Stroke colour and dash pattern so relationship types stay distinct without relying on colour alone. */
export const relationshipStyle: Record<RelationshipState, { stroke: string; dash?: string; width: number }> = {
  Trust: { stroke: '#3f6f8a', width: 2.4 },
  Alliance: { stroke: '#3d7558', width: 3.2 },
  Romance: { stroke: '#9a4f7c', width: 2.4, dash: '14 4 2 4' },
  Conflict: { stroke: '#a14d38', width: 2.8 },
  Betrayal: { stroke: '#7d2c2c', width: 2.8, dash: '10 6' },
  Pressure: { stroke: '#7b7440', width: 2.4, dash: '3 5' },
  Distance: { stroke: '#8a9096', width: 2.2, dash: '1 7' }
};

export type CanonLookup = Map<string, CanonState> | undefined;

export function CanonBadge({ id, states }: { id: string; states: CanonLookup }) {
  const state = states?.get(id);
  if (!state || state === 'approved') return null;
  return <small className={`swdr-story-canon is-${state}`} title="Working draft only. Approve canon to confirm it.">
    {state === 'draft' ? 'Draft · not in canon' : 'Changed since canon'}
  </small>;
}

export function stateTag(point: StoryPoint, showKind = false) {
  const label = point.knowledge ?? point.relationship ?? (showKind ? typeLabels[point.kind] : undefined);
  if (!label) return null;
  return <small className={`swdr-story-tag state-${(point.knowledge ?? point.relationship ?? point.kind).toLowerCase()}`}>{label}</small>;
}

export function PointRows({ rows, project, onOpen, onEdit, empty, showKind = false, states, people, flags }: {
  rows: StoryPoint[]; project: Project; onOpen: WorkspaceViewProps['onOpenSource']; onEdit?: (point: StoryPoint) => void;
  empty: string; showKind?: boolean; states?: CanonLookup; people?: Character[]; flags?: Map<string, string>;
}) {
  if (!rows.length) return <p className="swdr-story-muted">{empty}</p>;
  return <ul className="swdr-story-rows">
    {rows.map(point => {
      const names = people && point.participants.map(id => people.find(person => person.id === id)?.name).filter(Boolean);
      return <li key={point.id}>
        <div>
          <span className="swdr-story-row-tags">{stateTag(point, showKind)}{flags?.get(point.id) && <small className="swdr-story-tag state-flag">{flags.get(point.id)}</small>}
            <CanonBadge id={point.id} states={states} /></span>
          <strong>{point.title}</strong>
          {(point.detail || !!names?.length) && <p>{[names?.join(' · '), point.detail].filter(Boolean).join(' — ')}</p>}
        </div>
        <div className="actions"><SourceButton project={project} source={point.source} onOpen={onOpen} />
          {onEdit && <button type="button" className="quiet" onClick={() => onEdit(point)}>Edit</button>}</div>
      </li>;
    })}
  </ul>;
}
