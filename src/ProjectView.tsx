import { BookOpen, Clapperboard, ClipboardList, FileText, LayoutGrid, Mic, Plus, Rows3, Upload } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { DocumentKind, DocumentModel, Project } from './model';
import { newDocument, newId } from './model';
import { PROJECT_LABELS } from './Home';
import { episodeLabel } from './demo';

export type ProjectDestination = 'write' | 'outline' | 'av' | 'story' | 'editorial' | 'production' | 'import';

interface Props {
  project: Project;
  open: (destination: ProjectDestination, document?: DocumentModel) => void;
  update: (update: (project: Project) => Project) => void;
  archive: () => void;
}

export function ProjectView({ project, open, update, archive }: Props) {
  const [form, setForm] = useState<'episode' | 'document'>();
  const [season, setSeason] = useState(1);
  const [search, setSearch] = useState('');
  const filtered = project.documents.filter(document => document.title.toLowerCase().includes(search.trim().toLowerCase()))
    .slice().sort((a, b) => {
      const ae = project.episodes.find(episode => episode.id === a.episodeId);
      const be = project.episodes.find(episode => episode.id === b.episodeId);
      return ae && be ? ae.season - be.season || ae.number - be.number : 0;
    });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const title = String(values.get('title') ?? '').trim();
    if (!title) return;
    const nextSeason = Math.max(1, season);
    const number = Math.max(0, ...project.episodes.filter(episode => episode.season === nextSeason).map(episode => episode.number)) + 1;
    const episode = form === 'episode' ? { id: newId(), season: nextSeason, number, title, synopsis: '' } : undefined;
    const kind = (values.get('kind') as DocumentKind | null) ?? 'screenplay';
    const document = newDocument(title, kind, episode?.id);
    update(current => ({ ...current, episodes: episode ? [...current.episodes, episode] : current.episodes, documents: [...current.documents, document] }));
    setForm(undefined);
    open(project.kind === 'documentary' && episode ? 'editorial' : kind === 'av' ? 'av' : 'write', document);
  }

  return <main className="swdr-page" id="main-content">
    <div className="page-heading">
      <div><h1>{project.title}</h1><p>{PROJECT_LABELS[project.kind]}{project.synopsis && ` · ${project.synopsis}`}</p></div>
      <div className="actions">
        <button onClick={() => open('import')}><Upload size={16} /> Import draft</button>
        {(project.kind === 'series' || project.kind === 'documentary') && <button onClick={() => setForm('episode')}><Plus size={16} /> New episode</button>}
        <button className="primary" onClick={() => setForm('document')}><Plus size={16} /> New document</button>
      </div>
    </div>
    {form && <form className="inline-form" onSubmit={submit}>
      <label>{form === 'episode' ? 'Episode title' : 'Document title'}<input name="title" required autoFocus maxLength={180} /></label>
      {form === 'episode' && <label>Season<input type="number" min="1" value={season} required onChange={event => setSeason(event.currentTarget.valueAsNumber || 1)} /></label>}
      <label>Format<select name="kind" defaultValue={project.kind === 'commercial' ? 'av' : project.kind === 'stage' ? 'stageplay' : 'screenplay'}>
        <option value="screenplay">Screenplay</option><option value="stageplay">Stageplay</option><option value="av">AV script</option>
      </select></label>
      <button type="button" onClick={() => setForm(undefined)}>Cancel</button><button className="primary">Create</button>
    </form>}
    <div className="workspace-grid project-workspaces">
      <button className="workspace-card" onClick={() => open(project.kind === 'commercial' ? 'av' : 'write')}><FileText size={20} /><strong>Write</strong><span>Open the current manuscript.</span></button>
      <button className="workspace-card" onClick={() => open('outline')}><LayoutGrid size={20} /><strong>Outline</strong><span>Build beats and jump to scenes.</span></button>
      <button className="workspace-card" onClick={() => open('story')}><BookOpen size={20} /><strong>Series Intelligence</strong><span>Characters, canon and the event ledger.</span></button>
      <button className="workspace-card" onClick={() => open('editorial')}><Mic size={20} /><strong>Editorial</strong><span>Segments, evidence and producer outputs.</span></button>
      <button className="workspace-card" onClick={() => open('production')}><Clapperboard size={20} /><strong>Production</strong><span>From released script to shooting schedule.</span></button>
    </div>
    <div className="section-heading">
      <h2>{project.episodes.length ? 'Scripts and episodes' : 'Documents'}</h2>
      {project.documents.length > 4 && <input aria-label="Filter documents" placeholder="Find a document" value={search} onChange={event => setSearch(event.currentTarget.value)} />}
    </div>
    <div className="project-list">
      {filtered.map(document => {
        const episode = project.episodes.find(item => item.id === document.episodeId);
        const destination = project.kind === 'documentary' && episode ? 'editorial' : document.kind === 'av' ? 'av' : 'write';
        return <article className="document-row" key={document.id}>
          <span className="document-icon">{document.kind === 'av' ? <Rows3 size={18} /> : <ClipboardList size={18} />}</span>
          <div className="project-name"><h3>{document.title}</h3><p>{episodeLabel(episode) || (document.kind === 'av' ? 'AV script' : document.kind)}</p></div>
          {project.kind === 'documentary' && episode && <button onClick={() => open('write', document)}>Script</button>}
          <button onClick={() => open(destination, document)} aria-label={`Open ${document.title}`}>Open</button>
        </article>;
      })}
      {!filtered.length && <p className="empty-row">No matching documents.</p>}
    </div>
    <button className="quiet archive-button" onClick={archive}>Archive project</button>
  </main>;
}
