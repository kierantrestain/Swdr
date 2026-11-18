import { Download, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { newId } from '../model';
import type { DocumentModel, Episode, Project, WorkspaceViewProps } from '../model';
import { ArcTimeline } from './ArcTimeline';
import { RelationshipWeb } from './RelationshipWeb';
import { downloadText, episodeCode, fields, fileStem, orderedEpisodes, sourceText } from './source';
import { canonStates, cellKey, flashbacks, relationshipHistory, storyChecks, storyMap } from './series-analysis';
import { initialSource, SourceButton, SourceFields } from './StoryControls';
import { StoryMap } from './StoryMap';
import { CanonBadge, PointRows, stateTag, typeLabels } from './StoryParts';
import type { CanonLookup } from './StoryParts';
import {
  approveCanon, continuityConflicts, getStory, KNOWLEDGE, knowledgeStates, queryStory,
  RELATIONSHIPS, relationshipStates, reviewException, saveCharacter, saveStoryPoint, sceneMatrix, sortStory, STORY_KINDS
} from './series-model';
import type { Character, KnowledgeState, RelationshipState, StoryKind, StoryPoint, StoryState } from './series-model';

const panes = ['Relationship web', 'Story map', 'Event ledger', 'Characters', 'Scene matrix', 'Arcs and continuity'] as const;
const dossierPanes = ['Overview', 'Interactions', 'Knowledge', 'Relationships', 'Scenes'] as const;
type View = (typeof panes)[number];
type DossierPane = (typeof dossierPanes)[number];

interface EditorProps {
  project: Project;
  document: DocumentModel;
  close: () => void;
}

function valueOf(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim();
}

function CharacterForm({ project, document, character, save, close }: EditorProps & {
  character?: Character;
  save: (character: Character) => boolean;
}) {
  const [source, setSource] = useState(character?.source ?? initialSource(project, document));
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (source && save({
      id: character?.id ?? newId(), name: valueOf(form, 'name'), role: valueOf(form, 'role'),
      motivation: valueOf(form, 'motivation'), conflict: valueOf(form, 'conflict'),
      aliases: fields(valueOf(form, 'aliases')), source
    })) close();
  }
  return <form className="swdr-story-card swdr-story-form" onSubmit={submit}>
    <h2>{character ? 'Edit character' : 'Add character'}</h2>
    <div className="swdr-story-field-row">
      <label>Name<input name="name" required defaultValue={character?.name} /></label>
      <label>Role<input name="role" defaultValue={character?.role} /></label>
    </div>
    <label>Core motivation<textarea name="motivation" rows={2} defaultValue={character?.motivation} /></label>
    <label>Conflict<textarea name="conflict" rows={2} defaultValue={character?.conflict} /></label>
    <label>Aliases, one per line<textarea name="aliases" rows={2} defaultValue={character?.aliases.join('\n')} /></label>
    <SourceFields project={project} value={source} onChange={setSource} />
    <div className="actions"><button type="submit" className="primary" disabled={!source}>Save character</button><button type="button" onClick={close}>Cancel</button></div>
  </form>;
}

function PointForm({ project, document, data, point, save, close }: EditorProps & {
  data: StoryState;
  point?: StoryPoint;
  save: (point: StoryPoint) => boolean;
}) {
  const [kind, setKind] = useState<StoryKind>(point?.kind ?? 'event');
  const [source, setSource] = useState(point?.source ?? initialSource(project, document));
  const [people, setPeople] = useState(point?.participants ?? []);
  const episodes = orderedEpisodes(project);
  const reveal = episodes.findIndex(episode => episode.id === source?.episodeId);
  const characterOptions = data.characters.filter(person => episodes.findIndex(episode => episode.id === person.source.episodeId) <= reveal);
  const events = data.points.filter(event => event.kind === 'event' && event.id !== point?.id);
  const minPeople = kind === 'event' ? 0 : kind === 'relationship' || kind === 'interaction' ? 2 : 1;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (source && save({
      id: point?.id ?? newId(), kind, title: valueOf(form, 'title'), detail: valueOf(form, 'detail'), source,
      storyOrder: Number(form.get('storyOrder')),
      participants: people.filter(id => characterOptions.some(person => person.id === id)),
      relationship: kind === 'relationship' ? valueOf(form, 'relationship') as RelationshipState : undefined,
      knowledge: kind === 'knowledge' ? valueOf(form, 'knowledge') as KnowledgeState : undefined,
      factKey: kind === 'knowledge' ? valueOf(form, 'factKey') : undefined,
      causeId: kind === 'event' || kind === 'arc' ? valueOf(form, 'causeId') || undefined : undefined
    })) close();
  }
  return <form className="swdr-story-card swdr-story-form" onSubmit={submit}>
    <h2>{point ? 'Edit story record' : 'Add story record'}</h2>
    <div className="swdr-story-field-row">
      <label>Record type<select value={kind} onChange={event => setKind(event.currentTarget.value as StoryKind)}>
        {STORY_KINDS.map(item => <option key={item} value={item}>{typeLabels[item]}</option>)}
      </select></label>
      <label>Story time order<input name="storyOrder" aria-describedby="swdr-story-time-help" type="number" required defaultValue={point?.storyOrder ?? 1} /></label>
    </div>
    <p id="swdr-story-time-help" className="swdr-story-muted">Use a lower order for a flashback. The script line controls when the audience learns it.</p>
    <label>{kind === 'knowledge' ? 'Fact or open question' : 'Title'}<input name="title" required defaultValue={point?.title} /></label>
    <label>Detail<textarea name="detail" rows={2} defaultValue={point?.detail} /></label>
    <SourceFields project={project} value={source} onChange={setSource} />
    {characterOptions.length > 0 && <fieldset>
      <legend>Characters{minPeople ? ` · Select ${minPeople}` : ''}</legend>
      <div className="swdr-story-checks">{characterOptions.map(person => <label key={person.id}>
        <input type="checkbox" checked={people.includes(person.id)} onChange={event => {
          setPeople(event.currentTarget.checked ? [...people, person.id] : people.filter(id => id !== person.id));
        }} />{person.name}
      </label>)}</div>
    </fieldset>}
    {kind === 'relationship' && <label>Relationship state<select name="relationship" defaultValue={point?.relationship}>
      {RELATIONSHIPS.map(state => <option key={state}>{state}</option>)}
    </select></label>}
    {kind === 'knowledge' && <div className="swdr-story-field-row">
      <label>Shared fact key<input name="factKey" required defaultValue={point?.factKey} placeholder="e.g. timetable-date" /></label>
      <label>State of knowledge<select name="knowledge" defaultValue={point?.knowledge}>{KNOWLEDGE.map(state => <option key={state}>{state}</option>)}</select></label>
    </div>}
    {(kind === 'event' || kind === 'arc') && events.length > 0 && <label>Caused by<select name="causeId" defaultValue={point?.causeId ?? ''}>
      <option value="">No recorded cause</option>{events.map(event => <option key={event.id} value={event.id}>{event.title}</option>)}
    </select></label>}
    <div className="actions"><button type="submit" className="primary" disabled={!source}>Save record</button><button type="button" onClick={close}>Cancel</button></div>
  </form>;
}

function Chronology({ project, events, flags }: { project: Project; events: StoryPoint[]; flags: Map<string, string> }) {
  if (events.length < 2) return null;
  const reveal = sortStory(project, events, 'reveal');
  const story = sortStory(project, events, 'story');
  const x = (index: number) => 20 + index * (960 / (events.length - 1));
  const storyIndex = new Map(story.map((point, index) => [point.id, index]));
  return <figure className="swdr-story-chronology">
    <figcaption>Reveal order · episode and line</figcaption>
    <svg viewBox="0 0 1000 120" preserveAspectRatio="none" role="img"
      aria-label={`${events.length} events. ${flags.size} revealed out of story order.`}>
      <line x1="20" x2="980" y1="22" y2="22" className="axis" vectorEffect="non-scaling-stroke" />
      <line x1="20" x2="980" y1="98" y2="98" className="axis" vectorEffect="non-scaling-stroke" />
      {reveal.map((point, index) => {
        const target = storyIndex.get(point.id) ?? index;
        const out = flags.has(point.id);
        return <g key={point.id} className={out ? 'is-flashback' : undefined}>
          <title>{point.title}</title>
          <path d={`M ${x(index)} 22 C ${x(index)} 60, ${x(target)} 60, ${x(target)} 98`} vectorEffect="non-scaling-stroke" />
          <circle cx={x(index)} cy="22" r="4.5" vectorEffect="non-scaling-stroke" />
          <circle cx={x(target)} cy="98" r="4.5" vectorEffect="non-scaling-stroke" />
        </g>;
      })}
    </svg>
    <span>Story time · chronology{flags.size > 0 && <b> · highlighted lines cross back in time</b>}</span>
  </figure>;
}

function Dossier({ project, person, data, states, active, setActive, onOpen, onEdit, episodes, canon }: {
  project: Project; person: Character; data: StoryState; states: StoryPoint[]; active: DossierPane; episodes: Episode[];
  setActive: (value: DossierPane) => void; onOpen: WorkspaceViewProps['onOpenSource']; onEdit?: (point: StoryPoint) => void; canon: CanonLookup;
}) {
  const points = sortStory(project, data.points.filter(point => point.participants.includes(person.id)), 'reveal');
  const history = [...relationshipHistory(project, data.points).entries()].filter(([key]) => key.split('/').includes(person.id));
  const cells = storyMap(project, { ...data, points });
  const name = (id: string) => data.characters.find(item => item.id === id)?.name ?? 'Character';
  const code = (point: StoryPoint) => {
    const episode = orderedEpisodes(project).find(item => item.id === point.source.episodeId);
    return episode ? episodeCode(episode) : 'Script';
  };
  const sections: [DossierPane, string, StoryPoint[]][] = [
    ['Interactions', 'Key interactions', points.filter(point => point.kind === 'interaction').reverse()],
    ['Knowledge', 'Knowledge and open threads', knowledgeStates(project, points)],
    ['Relationships', 'Relationship states', states.filter(point => point.participants.includes(person.id))],
    ['Scenes', 'Recorded appearances', points.filter(point => point.kind === 'appearance')]
  ];
  const arc = points.filter(point => point.kind === 'arc');
  return <>
    <div className="swdr-story-tabs" aria-label="Character dossier">{dossierPanes.map(pane =>
      <button key={pane} className={active === pane ? 'selected' : 'quiet'} aria-pressed={active === pane} onClick={() => setActive(pane)}>{pane}</button>)}</div>
    <div className="swdr-story-dossier">
      <aside className="swdr-story-card"><h2>Character</h2>
        <dl className="swdr-story-facts">
          <dt>Introduction</dt><dd><SourceButton project={project} source={person.source} onOpen={onOpen} /></dd>
          {person.motivation && <><dt>Core motivation</dt><dd>{person.motivation}</dd></>}
          {person.conflict && <><dt>Conflict</dt><dd>{person.conflict}</dd></>}
          {!!person.aliases.length && <><dt>Aliases</dt><dd>{person.aliases.join(', ')}</dd></>}
          <dt>Canon status</dt><dd>{canon?.get(person.id) && canon.get(person.id) !== 'approved' ? <CanonBadge id={person.id} states={canon} /> : 'Approved canon'}</dd>
        </dl>
        <h3>Episode presence</h3>
        <div className="swdr-story-presence" role="list" aria-label={`${person.name} by episode`}>
          {episodes.map(episode => {
            const count = cells.get(cellKey(person.id, episode.id))?.length ?? 0;
            return <span role="listitem" key={episode.id} className={`level-${Math.min(4, count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 5 ? 3 : 4)}${episode.number === 1 ? ' starts-season' : ''}`}
              title={`${episodeCode(episode)} · ${count} record${count === 1 ? '' : 's'}`} aria-label={`${episodeCode(episode)}: ${count} record${count === 1 ? '' : 's'}`} />;
          })}
        </div>
      </aside>
      <section className="swdr-story-card swdr-story-dossier-body">
        {active === 'Overview' && <div><h2>Character arc</h2>
          <div className="swdr-story-milestones">{arc.map(point => <div key={point.id}>
            <SourceButton project={project} source={point.source} onOpen={onOpen} /><strong>{point.title}</strong><CanonBadge id={point.id} states={canon} />
          </div>)}</div>
          {!arc.length && <p className="swdr-story-muted">Record an arc milestone to build this timeline.</p>}
        </div>}
        {sections.filter(([key]) => key === active || active === 'Overview' && (key === 'Interactions' || key === 'Knowledge')).map(([key, title, rows]) =>
          <section className="swdr-story-dossier-section" key={key}><h2>{title}</h2>
            {key === 'Relationships' ? <ul className="swdr-story-rows swdr-story-history">{history.map(([key, turns]) => {
              const other = key.split('/').find(id => id !== person.id) ?? '';
              return <li key={key}><div><strong>{name(other)}</strong>
                <ol className="swdr-story-chain" aria-label={`Relationship with ${name(other)} over time`}>{turns.map(({ point }) => <li key={point.id}>
                  {stateTag(point)}<SourceButton project={project} source={point.source} onOpen={onOpen} label={code(point)} />
                  <CanonBadge id={point.id} states={canon} /></li>)}</ol>
                <p>{turns.at(-1)?.point.title}</p></div></li>;
            })}{!history.length && <li><p className="swdr-story-muted">No matching story records.</p></li>}</ul>
              : <PointRows rows={rows} project={project} onOpen={onOpen} onEdit={onEdit} states={canon}
                people={key === 'Interactions' ? data.characters.filter(item => item.id !== person.id) : undefined} empty="No matching story records." />}
          </section>)}
        {active === 'Overview' && <button onClick={() => setActive('Scenes')}>View all appearances</button>}
      </section>
    </div>
  </>;
}

function Section({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return <section className="swdr-story-card"><div className="swdr-story-card-head"><h2>{title}</h2>{actions}</div>{children}</section>;
}

export function SeriesView({ project, document, onProjectChange, onOpenSource, onStatus, readOnly }: WorkspaceViewProps) {
  const episodes = orderedEpisodes(project);
  const current = episodes.find(item => item.id === document.episodeId);
  const [season, setSeason] = useState(current?.season ?? 0);
  const [exact, setExact] = useState('');
  const [asOf, setAsOf] = useState(current?.id ?? '');
  const [version, setVersion] = useState('');
  const [view, setView] = useState<View>('Relationship web');
  const [focusedPerson, setFocusedPerson] = useState('');
  const [dossier, setDossier] = useState(false);
  const [dossierPane, setDossierPane] = useState<DossierPane>('Overview');
  const [order, setOrder] = useState<'reveal' | 'story'>('reveal');
  const [form, setForm] = useState<{ kind: 'character'; item?: Character } | { kind: 'point'; item?: StoryPoint }>();
  const [error, setError] = useState('');
  const store = useMemo(() => getStory(project), [project]);
  const canon = version === 'draft' ? undefined : store.canon.find(item => item.id === version) ?? store.canon.at(-1);
  const scope = { season: season || undefined, episodeId: exact || undefined, asOfId: asOf || undefined };
  const data = queryStory(project, canon?.data ?? store.draft, scope);
  const editable = !readOnly && !canon;
  const person = data.characters.find(item => item.id === focusedPerson) ?? data.characters[0];
  const edges = relationshipStates(project, data.points);
  const eventRows = sortStory(project, data.points.filter(point => point.kind === 'event'), order);
  const interactions = sortStory(project, data.points.filter(point => point.kind === 'interaction' && point.participants.includes(person?.id ?? '')), 'reveal').reverse();
  const selectPerson = (id: string) => setFocusedPerson(id);
  const episodeOf = (item: Character) => {
    const episode = episodes.find(entry => entry.id === item.source.episodeId);
    return episode ? episodeCode(episode) : 'in script';
  };
  const setEditPoint = editable ? (point: StoryPoint) => setForm({ kind: 'point', item: point }) : undefined;
  const displayDossier = dossier && person;
  const canonLookup: CanonLookup = canon ? undefined : canonStates(store);
  const cutoffIndex = asOf ? episodes.findIndex(item => item.id === asOf) : episodes.length - 1;
  const scopeEpisodes = episodes.filter(item => (!season || item.season === season) && (!exact || item.id === exact));
  const revealedEpisodes = scopeEpisodes.filter(item => episodes.indexOf(item) <= cutoffIndex);
  const flashbackFlags = new Map([...flashbacks(project, data.points)].map(id => [id, 'Revealed out of order'] as const));
  const conflicts = continuityConflicts(data.points);
  const checks = storyChecks(project, data, revealedEpisodes);
  const draftCount = canonLookup ? [...canonLookup.values()].filter(state => state !== 'approved').length : 0;

  function change(action: (p: Project) => Project, message: string): boolean {
    try {
      onProjectChange(action);
      setError('');
      onStatus(message);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The story record could not be saved.');
      return false;
    }
  }

  function openDossier() {
    setDossierPane('Overview');
    setDossier(true);
  }

  function exportVisible() {
    const content = { projectId: project.id, scope, canonId: canon?.id, data };
    downloadText(`${fileStem(project.title)}-visible-story.json`, JSON.stringify(content, null, 2), 'application/json');
    onStatus('Visible story records exported.');
  }

  return <main className="swdr-page swdr-story-page" id="main-content">
    <header className="page-heading swdr-story-heading">
      <div>
        <h1>{displayDossier ? person.name : 'Series Intelligence'}</h1>
        <p>{displayDossier ? [person.role, 'Character dossier'].filter(Boolean).join(' · ') : `${canon ? 'Approved canon' : 'Working draft'} · ${project.title}`}</p>
        {!canon && draftCount > 0 && <p className="swdr-story-draft-note"><span className="swdr-story-canon is-draft">Draft</span>{draftCount} record{draftCount === 1 ? '' : 's'} not yet approved as canon. Draft records carry a dashed outline.</p>}
      </div>
      <div className="actions swdr-story-filters">
        <select aria-label="Season" value={season} onChange={event => { setSeason(Number(event.currentTarget.value)); setExact(''); setAsOf(''); }}>
          <option value={0}>All seasons</option>{[...new Set(episodes.map(item => item.season))].map(key => <option key={key} value={key}>Season {key}</option>)}
        </select>
        <select aria-label="As of episode" value={asOf} onChange={event => { setAsOf(event.currentTarget.value); setExact(''); }}>
          <option value="">Latest in scope</option>{episodes.filter(item => !season || item.season === season).map(item =>
            <option key={item.id} value={item.id}>As of {episodeCode(item)}</option>)}
        </select>
        {displayDossier && <button onClick={() => { setDossier(false); setView('Relationship web'); }}>Relationship web</button>}
      </div>
    </header>
    <div className="swdr-story-navigation">
      {!displayDossier && <nav className="swdr-story-tabs" aria-label="Series workspaces">{panes.map(pane =>
        <button key={pane} className={view === pane ? 'selected' : 'quiet'} aria-pressed={view === pane} onClick={() => setView(pane)}>{pane}</button>)}</nav>}
      <div className="swdr-story-secondary actions">
        <select aria-label="Episode filter" value={exact} onChange={event => setExact(event.currentTarget.value)}>
          <option value="">All visible episodes</option>{episodes.filter((item, index) => (!season || item.season === season) && (!asOf || index <= episodes.findIndex(episode => episode.id === asOf)))
            .map(item => <option key={item.id} value={item.id}>{episodeCode(item)} · {item.title}</option>)}
        </select>
        <select aria-label="Canon or draft" value={canon?.id ?? 'draft'} onChange={event => { setVersion(event.currentTarget.value); setForm(undefined); }}>
          <option value="draft">Working draft</option>{store.canon.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <button onClick={exportVisible}><Download size={15} /> Export visible story</button>
        {editable && <>
          <button onClick={() => setForm({ kind: 'character', item: displayDossier ? person : undefined })}><Plus size={15} />{displayDossier ? 'Edit character' : 'Add character'}</button>
          <button onClick={() => setForm({ kind: 'point' })}><Plus size={15} /> Add record</button>
          <button className="primary" disabled={!store.draft.points.length && !store.draft.characters.length} onClick={() => {
            if (change(approveCanon, 'Approved canon snapshot saved.')) setVersion('');
          }}>Approve canon</button>
        </>}
      </div>
    </div>
    {error && <p className="swdr-story-error" role="alert">{error}</p>}
    {form?.kind === 'character' && <CharacterForm key={form.item?.id ?? 'new-character'} project={project} document={document} character={form.item}
      close={() => setForm(undefined)} save={character => {
        const saved = change(p => saveCharacter(p, character), 'Character saved.');
        if (saved) setFocusedPerson(character.id);
        return saved;
      }} />}
    {form?.kind === 'point' && <PointForm key={form.item?.id ?? 'new-record'} project={project} document={document} data={store.draft}
      point={form.item} close={() => setForm(undefined)} save={point => change(p => saveStoryPoint(p, point), 'Story record saved.')} />}
    {displayDossier ? <Dossier project={project} person={person} data={data} states={edges} active={dossierPane} episodes={revealedEpisodes}
      setActive={setDossierPane} onOpen={onOpenSource} onEdit={setEditPoint} canon={canonLookup} /> : <>
      {view === 'Relationship web' && <>
        <RelationshipWeb project={project} person={person} characters={data.characters} edges={edges} interactions={interactions}
          points={data.points} select={selectPerson} dossier={openDossier} onOpen={onOpenSource} states={canonLookup} />
        <section className="swdr-story-major">
          <div className="swdr-story-card-head"><h2>Major events</h2>
            <div className="actions"><button className={order === 'reveal' ? 'selected' : ''} onClick={() => setOrder('reveal')}>Reveal order</button>
              <button className={order === 'story' ? 'selected' : ''} onClick={() => setOrder('story')}>Story time</button></div>
          </div>
          <div className="swdr-story-event-cards">{eventRows.slice(0, 8).map(point => <article className="swdr-story-card" key={point.id}>
            <SourceButton project={project} source={point.source} onOpen={onOpenSource} /><h3>{point.title}</h3>
            {flashbackFlags.has(point.id) && <small className="swdr-story-tag state-flag">Revealed out of order</small>}<CanonBadge id={point.id} states={canonLookup} />
          </article>)}</div>
          {!eventRows.length && <p className="swdr-story-muted">No events in this view.</p>}
        </section>
      </>}
      {view === 'Event ledger' && <Section title="Event ledger" actions={<div className="actions">
        <button className={order === 'reveal' ? 'selected' : ''} onClick={() => setOrder('reveal')}>Reveal order</button>
        <button className={order === 'story' ? 'selected' : ''} onClick={() => setOrder('story')}>Story time</button>
      </div>}>
        <p className="swdr-story-muted">{order === 'reveal' ? 'Ordered by the episode and line where the audience learns each event.' : 'Ordered by when each event happens in the world of the story.'}
          {flashbackFlags.size > 0 && ` ${flashbackFlags.size} event${flashbackFlags.size === 1 ? ' is' : 's are'} revealed out of story order.`}</p>
        <Chronology project={project} events={eventRows} flags={flashbackFlags} />
        <PointRows rows={eventRows} project={project} onOpen={onOpenSource} onEdit={setEditPoint} empty="No events in this view."
          flags={flashbackFlags} states={canonLookup} people={data.characters} />
      </Section>}
      {view === 'Story map' && <StoryMap project={project} data={data} episodes={scopeEpisodes} cutoff={cutoffIndex} onOpen={onOpenSource}
        states={canonLookup} onDossier={id => { selectPerson(id); openDossier(); }} />}
      {view === 'Characters' && <Section title="Characters">
        <div className="swdr-story-event-cards">{data.characters.map(item => <article className="swdr-story-person-card" key={item.id}>
          <h3>{item.name}</h3><p>{item.role}</p>
          <p className="swdr-story-person-meta">Introduced {episodeOf(item)} · {data.points.filter(point => point.participants.includes(item.id)).length} records</p>
          <CanonBadge id={item.id} states={canonLookup} />
          <button onClick={() => { selectPerson(item.id); openDossier(); }}>Open dossier</button>
        </article>)}</div>
        {!data.characters.length && <p className="swdr-story-muted">No characters in this view.</p>}
      </Section>}
      {view === 'Scene matrix' && <Section title="Scene and interaction matrix">
        <div className="swdr-story-table"><table><thead><tr><th>Scene source</th><th>Appearances</th><th>Co-presence</th><th>Recorded interactions</th></tr></thead>
          <tbody>{sceneMatrix(data.points).map(row => {
            const names = row.appearances.map(id => data.characters.find(item => item.id === id)?.name ?? 'Character');
            return <tr key={`${row.source.documentId}:${row.source.revisionId}:${row.source.sceneId}`}>
              <td><SourceButton project={project} source={row.source} onOpen={onOpenSource} /></td>
              <td>{names.join(', ') || '—'}</td><td>{names.length > 1 ? `${names.length} characters in the scene` : '—'}</td>
              <td>{row.interactions.map(point => <div key={point.id}>{point.title} <SourceButton project={project} source={point.source} onOpen={onOpenSource} /></div>)}</td>
            </tr>;
          })}</tbody></table></div>
        {!sceneMatrix(data.points).length && <p className="swdr-story-muted">Record appearances or interactions to populate the matrix.</p>}
      </Section>}
      {view === 'Arcs and continuity' && <div className="swdr-story-stack">
        <ArcTimeline project={project} data={data} episodes={revealedEpisodes} onOpen={onOpenSource} onEdit={setEditPoint} states={canonLookup} />
        <div className="swdr-story-two-up">
          <Section title="Cause and effect">
            {eventRows.filter(point => point.causeId).map(point => {
              const cause = data.points.find(event => event.id === point.causeId);
              return cause && <div className="swdr-story-cause" key={point.id}><span>{cause.title}</span><span aria-label="leads to">→</span><strong>{point.title}</strong>
                <SourceButton project={project} source={point.source} onOpen={onOpenSource} /></div>;
            })}
            {!eventRows.some(point => point.causeId) && <p className="swdr-story-muted">No cause-and-effect links in this view.</p>}
          </Section>
          <Section title="Continuity review">
            <h3>Conflicts in recorded canon</h3>
            {conflicts.map(problem => {
              const exception = data.exceptions.find(item => item.id === problem.id);
              return <article className="swdr-story-conflict" key={problem.id}>
                <h3>{problem.title}</h3>
                {problem.records.map(point => <p key={point.id}>{sourceText(project, point.source) || point.title} <SourceButton project={project} source={point.source} onOpen={onOpenSource} /></p>)}
                {exception && <p><strong>Reviewed exception</strong> · {exception.reason}</p>}
                {editable && <form className="actions" onSubmit={event => {
                  event.preventDefault();
                  const reason = valueOf(new FormData(event.currentTarget), 'reason');
                  change(p => reviewException(p, problem.id, reason, problem.records.map(point => point.id)), 'Continuity exception reviewed.');
                }}><input name="reason" aria-label="Exception reason" placeholder="Why this is intentional" required defaultValue={exception?.reason} />
                  <button type="submit">Save review</button></form>}
              </article>;
            })}
            {!conflicts.length && <p className="swdr-story-muted">No continuity conflicts in this view.</p>}
            <div className="swdr-story-suggest-head"><h3>Suggested checks</h3><small className="swdr-story-canon is-suggestion">Generated · not canon</small></div>
            <p className="swdr-story-muted">Prompts computed from the records in this view. They never change a record or approved canon.</p>
            <ul className="swdr-story-checks-list">{checks.map(check => <li key={check.id} className={`is-${check.kind}`}>
              <strong>{check.title}</strong><p>{check.detail}</p>
              <div className="actions">{check.records.map(point => <SourceButton key={point.id} project={project} source={point.source} onOpen={onOpenSource} />)}</div>
            </li>)}</ul>
            {!checks.length && <p className="swdr-story-muted">No suggested checks in this view.</p>}
          </Section>
        </div>
      </div>}
    </>}
  </main>;
}
