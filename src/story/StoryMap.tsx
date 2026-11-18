import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Episode, Project, WorkspaceViewProps } from '../model';
import { episodeCode } from './source';
import { cellKey, episodePositions, episodeRecords, storyMap } from './series-analysis';
import type { Character, StoryPoint, StoryState } from './series-model';
import { PointRows, relationshipStyle } from './StoryParts';
import type { CanonLookup } from './StoryParts';

function level(count: number): number {
  return count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 5 ? 3 : 4;
}

function describe(points: StoryPoint[]): string {
  const interactions = points.filter(point => point.kind === 'interaction').length;
  const turns = points.filter(point => point.kind === 'relationship').map(point => point.relationship);
  const parts = [`${points.length} record${points.length === 1 ? '' : 's'}`];
  if (interactions) parts.push(`${interactions} interaction${interactions === 1 ? '' : 's'}`);
  if (turns.length) parts.push(`relationship ${turns.join(', ')}`);
  if (points.some(point => point.kind === 'arc')) parts.push('arc milestone');
  if (points.some(point => point.knowledge === 'Unresolved' || point.knowledge === 'Believes')) parts.push('open question');
  return parts.join(', ');
}

interface Selection { episodeId: string; characterId?: string }

export function StoryMap({ project, data, episodes, cutoff, onOpen, onDossier, states }: {
  project: Project; data: StoryState; episodes: Episode[]; cutoff: number;
  onOpen: WorkspaceViewProps['onOpenSource']; onDossier: (id: string) => void; states: CanonLookup;
}) {
  const [selection, setSelection] = useState<Selection>();
  const [cursor, setCursor] = useState({ row: 0, column: 0 });
  const positions = episodePositions(project);
  const cells = storyMap(project, data);
  const byEpisode = episodeRecords(project, data.points);
  const future = (episode: Episode) => (positions.get(episode.id) ?? 0) > cutoff;
  const seasons = [...new Set(episodes.map(episode => episode.season))];
  const characters = [...data.characters].sort((a, b) => {
    const total = (person: Character) => episodes.reduce((sum, episode) => sum + (cells.get(cellKey(person.id, episode.id))?.length ?? 0), 0);
    return total(b) - total(a);
  });
  const revealed = episodes.filter(episode => !future(episode));
  const selectedEpisode = selection && episodes.find(episode => episode.id === selection.episodeId);
  const selectedPerson = selection?.characterId ? data.characters.find(person => person.id === selection.characterId) : undefined;
  const selectedRows = !selection ? [] : selection.characterId
    ? cells.get(cellKey(selection.characterId, selection.episodeId)) ?? []
    : byEpisode.get(selection.episodeId) ?? [];
  const records = revealed.reduce((sum, episode) => sum + (byEpisode.get(episode.id)?.length ?? 0), 0);

  function move(event: KeyboardEvent<HTMLTableElement>) {
    const steps: Record<string, [number, number]> = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
    let target: { row: number; column: number } | undefined;
    if (steps[event.key]) {
      const [dr, dc] = steps[event.key];
      target = { row: Math.min(characters.length - 1, Math.max(0, cursor.row + dr)), column: Math.min(revealed.length - 1, Math.max(0, cursor.column + dc)) };
    } else if (event.key === 'Home') target = { row: cursor.row, column: 0 };
    else if (event.key === 'End') target = { row: cursor.row, column: revealed.length - 1 };
    if (!target) return;
    event.preventDefault();
    setCursor(target);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-cell="${target.row}:${target.column}"]`)?.focus();
  }

  return <section className="swdr-story-card swdr-story-map" aria-labelledby="swdr-story-map-title">
    <div className="swdr-story-card-head">
      <div><h2 id="swdr-story-map-title">Story map</h2>
        <p className="swdr-story-muted">{characters.length} characters · {revealed.length} of {episodes.length} episodes revealed · {records} records. Select a cell for the exact scenes.</p></div>
      <div className="swdr-story-map-key" aria-label="Story map key">
        <span><i className="swdr-story-map-swatch level-1" />1</span><span><i className="swdr-story-map-swatch level-2" />2–3</span>
        <span><i className="swdr-story-map-swatch level-3" />4–5</span><span><i className="swdr-story-map-swatch level-4" />6+ records</span>
        <span><i className="swdr-story-map-turn" />Relationship turn</span><span><i className="swdr-story-map-arc" />Arc milestone</span>
        <span><i className="swdr-story-map-open" />Open question</span>
      </div>
    </div>
    {characters.length ? <div className="swdr-story-map-scroll">
      <table onKeyDown={move} aria-label="Characters by episode. Use arrow keys to move between cells.">
        <thead>
          <tr><th rowSpan={2} scope="col" className="swdr-story-map-corner">Character</th>
            {seasons.map(season => <th key={season} scope="colgroup" colSpan={episodes.filter(episode => episode.season === season).length} className="swdr-story-map-season">Season {season}</th>)}
            <th rowSpan={2} scope="col" className="swdr-story-map-total">Total</th></tr>
          <tr>{episodes.map(episode => <th key={episode.id} scope="col" className={`${future(episode) ? 'is-future' : ''}${episode.number === 1 ? ' starts-season' : ''}`}>
            {future(episode) ? <span title={`${episodeCode(episode)} · not yet revealed`}>{episode.number}</span>
              : <button type="button" className={selection && !selection.characterId && selection.episodeId === episode.id ? 'is-selected' : ''}
                title={`${episodeCode(episode)} · ${episode.title}`} aria-label={`${episodeCode(episode)} ${episode.title}: show every record`}
                onClick={() => setSelection({ episodeId: episode.id })}>{episode.number}</button>}
          </th>)}</tr>
        </thead>
        <tbody>
          <tr className="swdr-story-map-events"><th scope="row">Major events</th>
            {episodes.map(episode => {
              const events = (byEpisode.get(episode.id) ?? []).filter(point => point.kind === 'event');
              return <td key={episode.id} className={`${future(episode) ? 'is-future' : ''}${episode.number === 1 ? ' starts-season' : ''}`}
                title={events.map(event => event.title).join('\n')}>
                {!future(episode) && events.slice(0, 3).map(event => <i key={event.id} aria-hidden="true" />)}
                {!future(episode) && events.length > 0 && <span className="sr-only">{events.length} event{events.length === 1 ? '' : 's'}: {events.map(event => event.title).join('; ')}</span>}
              </td>;
            })}<td className="swdr-story-map-total">{revealed.reduce((sum, episode) => sum + (byEpisode.get(episode.id) ?? []).filter(point => point.kind === 'event').length, 0)}</td></tr>
          {characters.map((person, row) => {
            let total = 0;
            return <tr key={person.id}>
              <th scope="row"><button type="button" className="quiet" onClick={() => onDossier(person.id)} aria-label={`Open ${person.name} dossier`}>
                <strong>{person.name}</strong><small>{person.role}</small></button></th>
              {episodes.map(episode => {
                if (future(episode)) return <td key={episode.id} className={`is-future${episode.number === 1 ? ' starts-season' : ''}`} aria-label={`${episodeCode(episode)} not yet revealed`} />;
                const column = revealed.indexOf(episode);
                const points = cells.get(cellKey(person.id, episode.id)) ?? [];
                total += points.length;
                const turn = points.filter(point => point.kind === 'relationship').at(-1);
                const draft = points.some(point => states?.get(point.id) && states.get(point.id) !== 'approved');
                const selected = selection?.characterId === person.id && selection.episodeId === episode.id;
                const intro = person.source.episodeId === episode.id;
                return <td key={episode.id} className={episode.number === 1 ? 'starts-season' : undefined}>
                  <button type="button" data-cell={`${row}:${column}`} tabIndex={cursor.row === row && cursor.column === column ? 0 : -1}
                    className={`swdr-story-map-cell level-${level(points.length)}${selected ? ' is-selected' : ''}${draft ? ' is-draft' : ''}${intro ? ' is-intro' : ''}`}
                    aria-pressed={selected} aria-label={`${person.name} in ${episodeCode(episode)} ${episode.title}: ${points.length ? describe(points) : 'no records'}${intro ? ', introduced' : ''}${draft ? ', includes draft records not in canon' : ''}`}
                    onFocus={() => setCursor({ row, column })}
                    onClick={() => setSelection({ episodeId: episode.id, characterId: person.id })}>
                    {points.length > 0 && <span aria-hidden="true">{points.length}</span>}
                    {turn?.relationship && <i className="swdr-story-map-turn" aria-hidden="true" style={{ background: relationshipStyle[turn.relationship].stroke }} />}
                    {points.some(point => point.kind === 'arc') && <i className="swdr-story-map-arc" aria-hidden="true" />}
                    {points.some(point => point.knowledge === 'Unresolved' || point.knowledge === 'Believes') && <i className="swdr-story-map-open" aria-hidden="true" />}
                  </button>
                </td>;
              })}
              <td className="swdr-story-map-total">{total}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div> : <p className="swdr-story-muted">No characters in this view.</p>}
    <div className="swdr-story-map-detail" aria-live="polite">
      {selectedEpisode ? <>
        <div className="swdr-story-card-head">
          <div><h3>{selectedPerson ? `${selectedPerson.name} · ${episodeCode(selectedEpisode)}` : `${episodeCode(selectedEpisode)} · every record`}</h3>
            <p className="swdr-story-muted">{selectedEpisode.title}{selectedPerson && selectedPerson.source.episodeId === selectedEpisode.id ? ' · introduced in this episode' : ''}</p></div>
          {selectedPerson && <button type="button" onClick={() => onDossier(selectedPerson.id)}>Open {selectedPerson.name.split(' ')[0]}’s dossier</button>}
        </div>
        <PointRows rows={selectedRows} project={project} onOpen={onOpen} showKind people={data.characters} states={states}
          empty={selectedPerson ? `${selectedPerson.name} has no records in this episode.` : 'No records in this episode.'} />
      </> : <p className="swdr-story-muted">Choose a character and episode to list the interactions, turns and reveals behind it, each linked to its exact script line.</p>}
    </div>
  </section>;
}
