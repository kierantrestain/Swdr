import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Plus, X } from 'lucide-react';
import { newBlock, newDocument, newId, sceneList, sourceFor } from '../model';
import type { Beat, DocumentModel, SourceRef, WorkspaceViewProps } from '../model';

type Act = 1 | 2 | 3;
type BoardBeat = Beat & { act?: Act; source?: SourceRef };

const acts: { id: Act; title: string }[] = [
  { id: 1, title: 'Act I · Setup' },
  { id: 2, title: 'Act II · Pressure' },
  { id: 3, title: 'Act III · Consequence' }
];

interface OutlineProps extends WorkspaceViewProps {
  toolbarEnd?: ReactNode;
  saveLabel?: string;
  /** Called when the writer picks another episode here, so the app can open that episode's document. */
  onSelectDocument?: (documentId: string) => void;
}

function defaultAct(beat: BoardBeat, position: number, length: number): Act {
  if (beat.act) return beat.act;
  return position < Math.ceil(length / 3) ? 1 : position < Math.ceil(length * 2 / 3) ? 2 : 3;
}

export function OutlineView({ project, document, onProjectChange, onStatus, onOpenSource, readOnly, toolbarEnd, onSelectDocument }: OutlineProps) {
  const [episodeId, setEpisodeState] = useState(document.episodeId ?? '');
  const [shownDocument, setShownDocument] = useState(document.id);
  if (shownDocument !== document.id) {
    // The episode changed elsewhere (the shell's episode switcher or the address bar).
    setShownDocument(document.id);
    setEpisodeState(document.episodeId ?? '');
  }
  function setEpisodeId(id: string) {
    setEpisodeState(id);
    const next = project.documents.find(item => item.episodeId === id && item.kind !== 'av');
    if (next) onSelectDocument?.(next.id);
  }
  const [view, setView] = useState<'board' | 'list' | 'scenes'>('board');
  const [expanded, setExpanded] = useState('');
  const [dragging, setDragging] = useState('');
  const episode = project.episodes.find(item => item.id === episodeId);
  const seasons = useMemo(() => [...new Set(project.episodes.map(item => item.season))].sort((a, b) => a - b), [project.episodes]);
  const selected = episode ? project.documents.find(item => item.episodeId === episode.id && item.kind !== 'av') : document;
  const sceneRows = useMemo(() => selected ? sceneList(selected) : [], [selected]);
  const beats = useMemo(() => (selected?.beats ?? []).map((beat: BoardBeat, index, all) => ({
    ...beat, act: defaultAct(beat, index, all.length)
  })), [selected?.beats]);

  function edit(change: (working: DocumentModel) => DocumentModel) {
    if (readOnly || !selected) return;
    onProjectChange(current => ({ ...current, documents: current.documents.map(item => item.id === selected.id ? change(item) : item) }));
  }

  function updateBeat(id: string, patch: Partial<BoardBeat>) {
    edit(current => ({ ...current, beats: current.beats.map(beat => beat.id === id ? { ...beat, ...patch } : beat) }));
  }

  function addBeat(act: Act) {
    const beat: BoardBeat = { id: newId(), title: 'New beat', notes: '', act };
    edit(current => ({ ...current, beats: [...current.beats, beat] }));
    setExpanded(beat.id);
  }

  function moveBeat(id: string, act: Act, before?: string) {
    edit(current => {
      const existing = current.beats.find(beat => beat.id === id);
      if (!existing || id === before) return current;
      const mapped = current.beats.map((item, index, all) => ({ ...item, act: defaultAct(item, index, all.length) }));
      const rows = mapped.filter(beat => beat.id !== id);
      const at = before ? rows.findIndex(beat => beat.id === before) : rows.length;
      rows.splice(Math.max(0, at), 0, { ...existing, act });
      return { ...current, beats: rows };
    });
  }

  function stepBeat(beat: BoardBeat, offset: -1 | 1) {
    const act = beat.act ?? 1;
    const peers = beats.filter(item => item.act === act);
    const at = peers.findIndex(item => item.id === beat.id);
    if (at + offset < 0 || at + offset >= peers.length) return;
    const before = offset === -1 ? peers[at - 1].id : peers[at + 2]?.id;
    moveBeat(beat.id, act, before);
  }

  function createScene(beat: BoardBeat) {
    const block = newBlock('scene', 'INT. LOCATION – DAY');
    edit(current => ({
      ...current, blocks: [...current.blocks, block, newBlock('action', beat.notes)],
      beats: current.beats.map(item => item.id === beat.id ? {
        ...item, sceneId: block.sceneId, source: sourceFor(project, current, { sceneId: block.sceneId, blockId: block.id })
      } : item)
    }));
    onStatus('Scene created and linked to the beat.');
  }

  function openScript(sceneId?: string) {
    if (!selected) return;
    const scene = sceneRows.find(item => item.id === sceneId);
    onOpenSource(sourceFor(project, selected, { sceneId: scene?.id, blockId: scene?.blockId }));
  }

  return <section className="swdr-w-page swdr-outline" aria-label="Episode outline">
    <header className="swdr-w-pagehead">
      <div><h1>{episode ? 'Episode outline' : 'Outline'}</h1><p>{episode ? `Season ${episode.season} · Episode ${episode.number} · ${episode.title}` : selected?.title || project.title}</p></div>
      <div className="swdr-w-tools">
        {!!seasons.length && <>
          <select className="swdr-w-button" aria-label="Season" value={episode?.season ?? ''} onChange={event => {
            const wanted = Number(event.target.value);
            const first = project.episodes.filter(item => item.season === wanted).sort((a, b) => a.number - b.number)[0];
            setEpisodeId(first?.id ?? '');
          }}><option value="">Project</option>{seasons.map(season => <option key={season} value={season}>Season {season}</option>)}</select>
          {episode && <select className="swdr-w-button" aria-label="Episode" value={episode.id} onChange={event => setEpisodeId(event.target.value)}>
            {project.episodes.filter(item => item.season === episode.season).sort((a, b) => a.number - b.number).map(item => <option key={item.id} value={item.id}>{item.number}. {item.title}</option>)}
          </select>}
        </>}
        <div className="swdr-w-tools" role="group" aria-label="Outline view">
          {([['board', 'Beat board'], ['list', 'List'], ['scenes', 'Scenes']] as const).map(([key, label]) =>
            <button key={key} type="button" className={`swdr-w-button ${key === view ? 'swdr-w-current' : ''}`} aria-pressed={key === view} onClick={() => setView(key)}>{label}</button>)}
        </div>
        {selected && <button type="button" className="swdr-w-button" onClick={() => openScript()}>Open script</button>}
        {toolbarEnd}
      </div>
    </header>
    {!selected && <div className="swdr-w-empty">
      <p>This episode is ready for a script.</p>
      {!readOnly && <button type="button" className="swdr-w-button" onClick={() => {
        const next = newDocument(episode?.title ?? project.title, 'screenplay', episode?.id);
        onProjectChange(current => ({ ...current, documents: [...current.documents, next] }));
        onSelectDocument?.(next.id);
      }}>Create episode script</button>}
    </div>}
    {selected && view === 'scenes' && <div className="swdr-scene-cards">
      {sceneRows.length ? sceneRows.map((scene, index) => <button type="button" className="swdr-scene-card" key={scene.id} onClick={() => openScript(scene.id)}>
        <small>Scene {scene.number}</small><strong>{scene.heading || 'Untitled scene'}</strong>
        <span>{selected.blocks.slice(scene.index + 1, sceneRows[index + 1]?.index).find(block => block.kind === 'action')?.text ?? ''}</span>
      </button>) : <div className="swdr-w-empty">Create a scene from a beat or write a scene heading.</div>}
    </div>}
    {selected && view !== 'scenes' && <div className={`swdr-beat-board ${view === 'list' ? 'swdr-beat-list' : ''}`}>
      {acts.map(act => <section className="swdr-beat-act" key={act.id} onDragOver={event => event.preventDefault()} onDrop={event => {
        event.preventDefault();
        if (dragging) moveBeat(dragging, act.id);
        setDragging('');
      }}><h2>{act.title}</h2>
        {beats.filter(beat => beat.act === act.id).map(beat => {
          const link = sceneRows.find(item => item.id === beat.sceneId);
          const savedLink = (beat as BoardBeat).source;
          const editing = expanded === beat.id && !readOnly;
          return <article className="swdr-beat-card" key={beat.id} data-act={act.id} draggable={!readOnly && !editing}
            onDragStart={() => setDragging(beat.id)} onDragEnd={() => setDragging('')} onDragOver={event => event.preventDefault()} onDrop={event => {
              event.preventDefault();
              event.stopPropagation();
              if (dragging) moveBeat(dragging, act.id, beat.id);
              setDragging('');
            }}>
            {editing ? <>
              <label className="swdr-w-label">Beat title<input autoFocus value={beat.title} onChange={event => updateBeat(beat.id, { title: event.target.value })} /></label>
              <label className="swdr-w-label">Notes<textarea rows={3} value={beat.notes} onChange={event => updateBeat(beat.id, { notes: event.target.value })} /></label>
              <label className="swdr-w-label">Linked scene<select value={beat.sceneId ?? ''} onChange={event => {
                const scene = sceneRows.find(item => item.id === event.target.value);
                updateBeat(beat.id, {
                  sceneId: scene?.id,
                  source: scene ? sourceFor(project, selected, { sceneId: scene.id, blockId: scene.blockId }) : undefined
                });
              }}>
                <option value="">Select scene</option>{sceneRows.map(scene => <option key={scene.id} value={scene.id}>{scene.number}. {scene.heading}</option>)}
              </select></label>
              <label className="swdr-w-label">Act<select value={act.id} onChange={event => moveBeat(beat.id, Number(event.target.value) as Act)}>
                {acts.map(option => <option value={option.id} key={option.id}>{option.title}</option>)}
              </select></label>
              <div className="swdr-w-tools">
                {!link && <button className="swdr-w-button" type="button" onClick={() => createScene(beat)}>Create scene</button>}
                <button type="button" className="swdr-w-quiet" title="Move beat up" aria-label="Move beat up" onClick={() => stepBeat(beat, -1)}><ArrowUp size={15} /></button>
                <button type="button" className="swdr-w-quiet" title="Move beat down" aria-label="Move beat down" onClick={() => stepBeat(beat, 1)}><ArrowDown size={15} /></button>
                <button type="button" className="swdr-w-quiet" aria-label="Delete beat" onClick={() => {
                  edit(current => ({ ...current, beats: current.beats.filter(item => item.id !== beat.id) }));
                  setExpanded('');
                }}><X size={15} /></button>
                <button type="button" className="swdr-w-button" onClick={() => setExpanded('')}>Done</button>
              </div>
            </> : <>
              {readOnly ? <h3>{beat.title || 'Untitled beat'}</h3> : <button className="swdr-beat-edit" type="button" onClick={() => setExpanded(beat.id)}>
                <strong>{beat.title || 'Untitled beat'}</strong><GripVertical size={16} aria-hidden="true" />
              </button>}
              {beat.notes && <p>{beat.notes}</p>}
              {(link || savedLink) && <button type="button" className="swdr-w-link" onClick={() => savedLink ? onOpenSource(savedLink) : openScript(link?.id)}>{link ? `Scene ${link.number}` : 'Linked revision'}</button>}
            </>}
          </article>;
        })}
        {!readOnly && <button className="swdr-w-quiet swdr-beat-add" type="button" onClick={() => addBeat(act.id)}><Plus size={16} /> Add beat</button>}
      </section>)}
    </div>}
  </section>;
}
