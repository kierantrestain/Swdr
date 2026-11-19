import { X } from 'lucide-react';
import { useState } from 'react';
import type { Project, WorkspaceViewProps } from '../model';
import { episodeCode, orderedEpisodes } from './source';
import { pairKey, relationshipHistory } from './series-analysis';
import { RELATIONSHIPS, sortStory } from './series-model';
import type { Character, RelationshipState, StoryPoint } from './series-model';
import { CanonBadge, PointRows, relationshipStyle, stateTag } from './StoryParts';
import type { CanonLookup } from './StoryParts';
import { SourceButton } from './StoryControls';

const WIDTH = 1000;
const HEIGHT = 560;

interface Placed { person: Character; x: number; y: number }

function ring(people: Character[], rx: number, ry: number, offset = -Math.PI / 2): Placed[] {
  return people.map((person, index) => {
    const angle = offset + (index / Math.max(1, people.length)) * Math.PI * 2;
    return { person, x: WIDTH / 2 + Math.cos(angle) * rx, y: HEIGHT / 2 + Math.sin(angle) * ry };
  });
}

const pct = (value: number, total: number) => `${(value / total) * 100}%`;

/**
 * Focus layout: the selected character in the centre and their links on a wide ellipse, held inside the canvas so
 * every card stays whole and each edge keeps a clear run between the centre card and its neighbour.
 */
function focusRing(people: Character[]): Placed[] {
  const offset = people.length === 2 ? Math.PI : -Math.PI * .75;
  return ring(people, 510, 270, offset).map(item => ({
    ...item,
    x: Math.min(WIDTH - 140, Math.max(140, item.x)),
    y: Math.min(HEIGHT - 90, Math.max(90, item.y))
  }));
}

export function RelationshipWeb({ project, person, characters, edges, points, interactions, select, dossier, onOpen, states }: {
  project: Project; person?: Character; characters: Character[]; edges: StoryPoint[]; points: StoryPoint[]; interactions: StoryPoint[];
  select: (id: string) => void; dossier: () => void; onOpen: WorkspaceViewProps['onOpenSource']; states: CanonLookup;
}) {
  const [category, setCategory] = useState<RelationshipState | ''>('');
  const [mode, setMode] = useState<'focus' | 'cast'>('focus');
  const [pair, setPair] = useState('');
  const shown = edges.filter(edge => !category || category === edge.relationship);
  const history = relationshipHistory(project, points);
  const episodes = orderedEpisodes(project);
  const code = (point: StoryPoint) => {
    const episode = episodes.find(item => item.id === point.source.episodeId);
    return episode ? episodeCode(episode) : '';
  };
  const linkCount = (id: string) => shown.filter(edge => edge.participants.includes(id)).length;

  const neighbours = person ? characters.filter(item => item.id !== person.id
    && shown.some(edge => edge.participants.includes(person.id) && edge.participants.includes(item.id))) : [];
  const placed: Placed[] = !person ? [] : mode === 'focus'
    ? [{ person, x: WIDTH / 2, y: HEIGHT / 2 }, ...focusRing(neighbours)]
    : ring(characters, 400, 215);
  const at = new Map(placed.map(item => [item.person.id, item]));
  const visibleEdges = shown.filter(edge => edge.participants.every(id => at.has(id))
    && (mode === 'cast' || edge.participants.includes(person?.id ?? '')));
  const active = (edge: StoryPoint) => !person || edge.participants.includes(person.id);
  const unlinked = person ? characters.length - 1 - neighbours.length : 0;
  const selectedTurns = pair ? history.get(pair) ?? [] : [];
  const pairPeople = pair ? pair.split('/').map(id => characters.find(item => item.id === id)).filter((item): item is Character => Boolean(item)) : [];
  const pairInteractions = pair ? sortStory(project, points.filter(point => point.kind === 'interaction' && pairKey(point.participants) === pair), 'reveal') : [];
  const used = new Set(visibleEdges.map(edge => edge.relationship));

  return <div className="swdr-story-web-layout">
    <section className="swdr-story-card">
      <div className="swdr-story-card-head"><h2>Relationship web</h2><div className="actions">
        <div className="swdr-story-segmented" role="group" aria-label="Web layout">
          <button type="button" aria-pressed={mode === 'focus'} className={mode === 'focus' ? 'selected' : 'quiet'} onClick={() => setMode('focus')}>Focus</button>
          <button type="button" aria-pressed={mode === 'cast'} className={mode === 'cast' ? 'selected' : 'quiet'} onClick={() => setMode('cast')}>Whole cast</button>
        </div>
        {person && characters.length > 1 && <select aria-label="Selected character" value={person.id} onChange={event => select(event.currentTarget.value)}>
          {characters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>}
        <select aria-label="Relationship type" value={category} onChange={event => setCategory(event.currentTarget.value as RelationshipState | '')}>
          <option value="">All relationships</option>{RELATIONSHIPS.map(state => <option key={state}>{state}</option>)}
        </select>
      </div></div>
      {person ? <>
        <div className={`swdr-story-graph is-${mode}`} role="group" aria-label={mode === 'focus' ? `Relationship web for ${person.name}` : 'Relationship web for the whole cast'}>
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
            {visibleEdges.map(edge => {
              const [a, b] = edge.participants.map(id => at.get(id)!);
              const style = relationshipStyle[edge.relationship ?? 'Trust'];
              const selected = pair === pairKey(edge.participants);
              return <line key={edge.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={style.stroke} strokeDasharray={style.dash}
                strokeWidth={style.width + (selected ? 2 : 0)} strokeLinecap="round" vectorEffect="non-scaling-stroke"
                opacity={active(edge) ? 1 : .22} />;
            })}
          </svg>
          {visibleEdges.filter(active).map(edge => {
            const [a, b] = edge.participants.map(id => at.get(id)!);
            const key = pairKey(edge.participants);
            const turns = history.get(key)?.length ?? 1;
            return <button type="button" key={`label-${edge.id}`} className={`swdr-story-edge-state state-${edge.relationship?.toLowerCase()}${pair === key ? ' is-selected' : ''}`}
              style={{ left: pct((a.x + b.x) / 2, WIDTH), top: pct((a.y + b.y) / 2, HEIGHT) }} aria-pressed={pair === key}
              aria-label={`${a.person.name} and ${b.person.name}: ${edge.relationship}. Show relationship history`}
              onClick={() => setPair(pair === key ? '' : key)}>
              {edge.relationship}{turns > 1 && <span aria-hidden="true"> · {turns}</span>}
            </button>;
          })}
          {placed.map(({ person: item, x, y }) => {
            const centre = mode === 'focus' && item.id === person.id;
            return <button type="button" key={item.id} className={`swdr-story-node${centre ? ' is-centre' : ''}${mode === 'cast' && item.id === person.id ? ' is-selected' : ''}`}
              style={{ left: pct(x, WIDTH), top: pct(y, HEIGHT) }}
              aria-label={centre ? `Open dossier for ${item.name}` : undefined} aria-pressed={mode === 'cast' ? item.id === person.id : undefined}
              onClick={() => { if (centre) dossier(); else { select(item.id); setPair(''); } }}>
              <strong>{item.name}</strong><span>{item.role || 'Character'}{mode === 'cast' && ` · ${linkCount(item.id)} link${linkCount(item.id) === 1 ? '' : 's'}`}</span>
              <CanonBadge id={item.id} states={states} />
            </button>;
          })}
        </div>
        <div className="swdr-story-legend" aria-label="Relationship key">
          {RELATIONSHIPS.filter(state => used.has(state)).map(state => <span key={state}>
            <svg width="30" height="10" aria-hidden="true"><line x1="1" y1="5" x2="29" y2="5" stroke={relationshipStyle[state].stroke}
              strokeWidth={relationshipStyle[state].width} strokeDasharray={relationshipStyle[state].dash} strokeLinecap="round" /></svg>{state}
          </span>)}
          {mode === 'focus' && unlinked > 0 && <span className="swdr-story-muted">{unlinked} other character{unlinked === 1 ? '' : 's'} not linked to {person.name.split(' ')[0]}</span>}
        </div>
        {!visibleEdges.length && <p className="swdr-story-muted">No relationships in this view.</p>}
        {!!visibleEdges.length && <details className="swdr-story-graph-list"><summary>Relationship sources</summary>
          <ul className="swdr-story-rows">{visibleEdges.filter(active).map(edge => {
            const other = characters.find(item => item.id !== person.id && edge.participants.includes(item.id));
            return <li key={edge.id}><div><strong>{mode === 'cast' ? edge.participants.map(id => at.get(id)?.person.name).join(' & ') : other?.name}</strong>
              <p>{edge.relationship} · {edge.title}</p></div>
              <SourceButton project={project} source={edge.source} onOpen={onOpen} /></li>;
          })}</ul>
        </details>}
      </> : <p className="swdr-story-muted">Add a character and connect two characters to see their relationship web.</p>}
    </section>
    {pairPeople.length === 2 ? <aside className="swdr-story-card swdr-story-character-summary" aria-label="Relationship history">
      <div className="swdr-story-card-head"><h2>{pairPeople.map(item => item.name.split(' ')[0]).join(' & ')}</h2>
        <button type="button" className="quiet" aria-label="Close relationship history" onClick={() => setPair('')}><X size={16} /></button></div>
      <p className="swdr-story-muted">Relationship over {selectedTurns.length} recorded turn{selectedTurns.length === 1 ? '' : 's'}</p>
      <ol className="swdr-story-turns">{selectedTurns.map(({ point, previous }) => <li key={point.id}>
        <span className="swdr-story-turn-mark" style={{ borderColor: relationshipStyle[point.relationship ?? 'Trust'].stroke }} aria-hidden="true" />
        <div><small>{code(point)}{previous && previous !== point.relationship ? ` · from ${previous}` : ''}</small>
          <span className="swdr-story-row-tags">{stateTag(point)}<CanonBadge id={point.id} states={states} /></span>
          <strong>{point.title}</strong>
          <SourceButton project={project} source={point.source} onOpen={onOpen} /></div>
      </li>)}</ol>
      <section><h3>Interactions between them</h3>
        <PointRows rows={pairInteractions} project={project} onOpen={onOpen} states={states} empty="No recorded interactions between them in this view." /></section>
    </aside> : <aside className="swdr-story-card swdr-story-character-summary">
      <h2>{person?.name ?? 'Characters'}</h2>
      <p className="swdr-story-muted">{person?.role || 'No character selected'}</p>
      {person && <>
        {person.motivation && <section><h3>Current motivation</h3><p>{person.motivation}</p></section>}
        <section><h3>Recent interactions</h3><PointRows rows={interactions.slice(0, 2)} project={project} onOpen={onOpen} states={states} empty="No recorded interactions in this view." /></section>
        <button className="primary" onClick={dossier}>Open character dossier</button>
      </>}
    </aside>}
  </div>;
}
