import { useState } from 'react';
import type { Episode, Project, WorkspaceViewProps } from '../model';
import { episodeCode } from './source';
import { episodePositions } from './series-analysis';
import { sortStory } from './series-model';
import type { StoryPoint, StoryState } from './series-model';
import { PointRows } from './StoryParts';
import type { CanonLookup } from './StoryParts';

interface Thread { id: string; title: string; start: number; end: number; open: boolean; records: StoryPoint[] }

export function ArcTimeline({ project, data, episodes, onOpen, onEdit, states }: {
  project: Project; data: StoryState; episodes: Episode[]; onOpen: WorkspaceViewProps['onOpenSource'];
  onEdit?: (point: StoryPoint) => void; states: CanonLookup;
}) {
  const [selected, setSelected] = useState<{ title: string; records: StoryPoint[] }>();
  const positions = episodePositions(project);
  const column = new Map(episodes.map((episode, index) => [positions.get(episode.id) ?? -1, index]));
  const columnOf = (point: StoryPoint) => column.get(positions.get(point.source.episodeId ?? '') ?? -2);
  const count = episodes.length;
  const rows = data.characters.map(person => {
    const own = sortStory(project, data.points.filter(point => point.participants.includes(person.id)), 'reveal');
    const milestones = own.filter(point => point.kind === 'arc' && columnOf(point) !== undefined);
    const facts = new Map<string, StoryPoint[]>();
    for (const point of own.filter(item => item.kind === 'knowledge' && item.factKey)) {
      const key = point.factKey!.trim().toLowerCase();
      facts.set(key, [...(facts.get(key) ?? []), point]);
    }
    const threads: Thread[] = [];
    for (const [key, records] of facts) {
      const first = records.findIndex(point => point.knowledge === 'Unresolved' || point.knowledge === 'Believes');
      if (first < 0) continue;
      const answer = records.slice(first + 1).find(point => point.knowledge === 'Confirmed' || point.knowledge === 'Refuted');
      const start = columnOf(records[first]);
      if (start === undefined) continue;
      const end = answer ? columnOf(answer) ?? count - 1 : count - 1;
      threads.push({ id: `${person.id}:${key}`, title: records[first].title, start, end: Math.max(start, end), open: !answer,
        records: records.slice(first, answer ? records.indexOf(answer) + 1 : undefined) });
    }
    return { person, milestones, threads, present: new Set(own.map(columnOf).filter((value): value is number => value !== undefined)) };
  });
  const lanes = rows.filter(row => row.milestones.length || row.threads.length);
  const quiet = rows.filter(row => !row.milestones.length && !row.threads.length);
  const template = { gridTemplateColumns: `repeat(${Math.max(1, count)}, minmax(0, 1fr))` };
  const openCount = lanes.reduce((sum, row) => sum + row.threads.filter(thread => thread.open).length, 0);

  return <section className="swdr-story-card swdr-story-arcs" aria-labelledby="swdr-story-arcs-title">
    <div className="swdr-story-card-head">
      <div><h2 id="swdr-story-arcs-title">Arc timeline</h2>
        <p className="swdr-story-muted">Arc milestones and story questions by reveal episode · {openCount} question{openCount === 1 ? '' : 's'} still open</p></div>
      <div className="swdr-story-map-key"><span><i className="swdr-story-arc-key milestone" />Milestone</span>
        <span><i className="swdr-story-arc-key open" />Open question</span><span><i className="swdr-story-arc-key resolved" />Answered</span></div>
    </div>
    {lanes.length && count ? <div className="swdr-story-arc-scroll"><div className="swdr-story-arc-grid">
      <div className="swdr-story-arc-name" aria-hidden="true" />
      <div className="swdr-story-arc-axis" style={template} aria-hidden="true">{episodes.map(episode =>
        <span key={episode.id} className={episode.number === 1 ? 'starts-season' : undefined} title={`${episodeCode(episode)} · ${episode.title}`}>
          {episode.number === 1 && <b>S{episode.season}</b>}{episode.number}</span>)}</div>
      {lanes.map(({ person, milestones, threads, present }) => <div className="swdr-story-arc-row" key={person.id} role="group" aria-label={`${person.name} arc`}>
        <div className="swdr-story-arc-name"><strong>{person.name}</strong><small>{person.role}</small></div>
        <div className="swdr-story-arc-lane" style={template}>
          <div className="swdr-story-arc-presence" style={{ ...template, gridColumn: `1 / ${count + 1}` }} aria-hidden="true">
            {episodes.map((episode, index) => <i key={episode.id} className={present.has(index) ? 'is-present' : undefined} />)}</div>
          {threads.map(thread => <button type="button" key={thread.id} className={`swdr-story-arc-thread${thread.open ? ' is-open' : ''}`}
            style={{ gridColumn: `${thread.start + 1} / ${thread.end + 2}` }} title={thread.title}
            aria-label={`${thread.open ? 'Open question' : 'Answered question'}: ${thread.title}, from ${episodeCode(episodes[thread.start])}${thread.open ? '' : ` to ${episodeCode(episodes[thread.end])}`}`}
            onClick={() => setSelected({ title: thread.title, records: thread.records })}>
            <span>{thread.open ? '? ' : '✓ '}{thread.title}</span></button>)}
          {milestones.map(point => {
            const start = columnOf(point)!;
            const atEnd = count > 4 && start > count - 4;
            const columns = atEnd ? `${start - 2} / ${start + 2}` : `${start + 1} / ${Math.min(count, start + 4) + 1}`;
            return <button type="button" key={point.id} className={`swdr-story-arc-milestone${atEnd ? ' is-end' : ''}${states?.get(point.id) && states.get(point.id) !== 'approved' ? ' is-draft' : ''}`}
              style={{ gridColumn: columns }} title={point.title}
              aria-label={`${person.name} arc milestone in ${episodeCode(episodes[start])}: ${point.title}`}
              onClick={() => setSelected({ title: `${person.name} · ${point.title}`, records: [point] })}>
              <i aria-hidden="true" /><span>{point.title}</span></button>;
          })}
        </div>
      </div>)}
    </div></div> : <p className="swdr-story-muted">Record arc milestones or open questions to build the timeline.</p>}
    {quiet.length > 0 && <p className="swdr-story-muted swdr-story-arc-quiet">No arc milestones yet: {quiet.map(row => row.person.name).join(', ')}</p>}
    {selected && <div className="swdr-story-map-detail" aria-live="polite">
      <h3>{selected.title}</h3>
      <PointRows rows={selected.records} project={project} onOpen={onOpen} onEdit={onEdit} showKind states={states} empty="No records." />
    </div>}
  </section>;
}
