import { ArrowDownToLine, ArrowRight, ArrowUpRight, ChevronRight, FileText, FolderOpen, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { PROJECT_KINDS } from './model';
import type { DocumentModel, Project, ProjectKind } from './model';
import { episodeLabel } from './demo';

export const PROJECT_LABELS: Record<ProjectKind, string> = {
  film: 'Film', series: 'Television', stage: 'Stage', documentary: 'Documentary', commercial: 'Commercial / AV'
};

const TEMPLATES: Record<ProjectKind, string> = {
  film: 'A page-accurate screenplay for a feature or short.',
  series: 'Episodes, outline, screenplay and a connected story bible.',
  stage: 'A stage manuscript with acts, cues and dialogue.',
  documentary: 'An episode plan with segments, sources and production outputs.',
  commercial: 'Timed video and audio for a spot or branded brief.'
};

interface HomeProps {
  projects: Project[];
  recent?: { project: Project; document: DocumentModel };
  open: (project: Project) => void;
  resume: (project: Project, document: DocumentModel) => void;
  create: (title: string, kind: ProjectKind, synopsis: string) => void;
  importScript: () => void;
  loadDemo: () => void;
  restoreArchived: (id: string) => void;
  openTeam: () => void;
}

function projectDetail(project: Project): string {
  if (project.episodes.length) {
    const seasons = new Set(project.episodes.map(episode => episode.season)).size;
    return `${seasons} season${seasons === 1 ? '' : 's'} · ${project.episodes.length} episode${project.episodes.length === 1 ? '' : 's'}`;
  }
  return project.synopsis || `${project.documents.length} document${project.documents.length === 1 ? '' : 's'}`;
}

function formatEdited(date: string): string {
  const updated = new Date(date);
  if (Number.isNaN(updated.getTime())) return 'Saved on this device';
  const today = new Date();
  if (today.toDateString() === updated.toDateString()) return 'Edited today';
  today.setDate(today.getDate() - 1);
  if (today.toDateString() === updated.toDateString()) return 'Edited yesterday';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(updated);
}

function ManuscriptPreview({ document }: { document: DocumentModel }) {
  const lines = document.kind === 'av' ? document.avRows.slice(0, 3).map(row => row.video) : document.blocks.filter(block => block.text).slice(0, 6);
  return <div className="home-preview" aria-hidden="true">
    <div className="home-preview-sheet">
      <div className="home-preview-page">1.</div>
      {lines.length ? lines.map((line, index) => typeof line === 'string'
        ? <p key={index}>{line.split('\n')[0]}</p>
        : <p key={line.id} className={`preview-${line.kind}`}>{line.text}</p>
      ) : <p className="preview-scene">{document.title}</p>}
    </div>
  </div>;
}

export function Home({ projects, recent, open, resume, create, importScript, loadDemo, restoreArchived, openTeam }: HomeProps) {
  const [tab, setTab] = useState<'recent' | 'all' | 'templates' | 'archive'>('recent');
  const [query, setQuery] = useState('');
  const [newKind, setNewKind] = useState<ProjectKind>();
  const projectDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = projectDialog.current;
    if (newKind && dialog && !dialog.open) dialog.showModal();
  }, [newKind]);
  const live = projects.filter(project => !project.archivedAt);
  const visible = (tab === 'archive' ? projects.filter(project => project.archivedAt) : tab === 'recent' ? live.slice(0, 6) : live)
    .filter(project => `${project.title} ${project.synopsis} ${PROJECT_LABELS[project.kind]}`.toLowerCase().includes(query.trim().toLowerCase()));

  function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get('title') ?? '').trim();
    if (!title) return;
    create(title, data.get('kind') as ProjectKind, String(data.get('synopsis') ?? '').trim());
    setNewKind(undefined);
  }

  return <main className="swdr-page home-page" id="main-content">
    <div className="page-heading home-heading">
      <div><h1>Projects</h1><p>Open a draft or start a new project.</p></div>
      <div className="actions">
        <button type="button" onClick={importScript}><ArrowDownToLine size={16} /> Import script</button>
        <button type="button" className="primary" onClick={() => setNewKind('film')}>New project</button>
      </div>
    </div>
    {newKind && <dialog ref={projectDialog} className="project-dialog" aria-labelledby="new-project-title" onCancel={() => setNewKind(undefined)}>
      <form className="dialog" onSubmit={submitProject}>
        <h2 id="new-project-title">New project</h2>
        <label>Title<input name="title" required autoFocus maxLength={180} placeholder="Project title" /></label>
        <label>Format<select name="kind" value={newKind} onChange={event => setNewKind(event.currentTarget.value as ProjectKind)}>
          {PROJECT_KINDS.map(kind => <option key={kind} value={kind}>{PROJECT_LABELS[kind]}</option>)}
        </select></label>
        <label>Synopsis <small>Optional</small><textarea name="synopsis" rows={3} maxLength={2000} /></label>
        <div className="actions"><button type="button" onClick={() => setNewKind(undefined)}>Cancel</button><button className="primary">Create project</button></div>
      </form>
    </dialog>}
    {recent && <section className="continue-panel" aria-labelledby="continue-title">
      <div className="continue-main">
        <p className="continue-label">Continue writing</p>
        <h2 id="continue-title">{recent.project.title}</h2>
        <p className="continue-subtitle">{episodeLabel(recent.project.episodes.find(episode => episode.id === recent.document.episodeId)) || recent.document.title}</p>
        <div className="actions">
          <button className="primary" onClick={() => resume(recent.project, recent.document)}>Resume {recent.document.kind === 'av' ? 'AV script' : recent.document.kind}</button>
          <button onClick={() => open(recent.project)}>Open project <ArrowRight size={15} /></button>
        </div>
      </div>
      <ManuscriptPreview document={recent.document} />
    </section>}
    <section className="library" aria-labelledby="library-heading">
      <div className="section-heading">
        <h2 id="library-heading">Project library</h2>
        <div className="actions" aria-label="Filter project library">
          {(['recent', 'all', 'templates', ...(projects.some(project => project.archivedAt) ? ['archive'] : [])] as typeof tab[]).map(key =>
            <button key={key} aria-pressed={tab === key} className={tab === key ? 'selected' : ''} onClick={() => { setTab(key); setQuery(''); }}>
              {{ recent: 'Recent', all: 'All projects', templates: 'Templates', archive: 'Archive' }[key]}
            </button>)}
        </div>
      </div>
      {tab === 'all' && live.length > 0 && <label className="search-field"><Search size={16} /><input aria-label="Search projects" placeholder="Search projects" value={query} onChange={event => setQuery(event.currentTarget.value)} /></label>}
      {tab === 'templates' ? <div className="workspace-grid">
        {PROJECT_KINDS.map(kind => <button className="workspace-card" key={kind} onClick={() => setNewKind(kind)}>
          <FileText size={20} /><strong>{PROJECT_LABELS[kind]}</strong><span>{TEMPLATES[kind]}</span><ChevronRight className="card-arrow" size={18} />
        </button>)}
      </div> : visible.length ? <div className="project-list">
        {visible.map(project => <article key={project.id} className="project-row">
          <div className={`project-icon project-icon-${project.kind}`} aria-hidden="true">{project.title.slice(0, 1).toUpperCase()}</div>
          <div className="project-name"><h3>{project.title}</h3><p>{projectDetail(project)}</p></div>
          <div className="row-meta">{PROJECT_LABELS[project.kind]}</div><div className="row-meta">{formatEdited(project.updatedAt)}</div>
          {project.archivedAt ? <button onClick={() => restoreArchived(project.id)}>Restore project</button>
            : <button aria-label={`Open project ${project.title}`} onClick={() => open(project)}>Open project</button>}
        </article>)}
      </div> : <div className="empty-block">
        <FolderOpen size={24} /><h3>{query ? 'No matching projects' : 'Your workspace is ready'}</h3>
        {!query && <><p>Create a project, import a script or explore the demo.</p><button onClick={loadDemo}><Sparkles size={15} /> Load demo projects</button></>}
      </div>}
    </section>
    <footer className="home-footer">
      <span><ShieldCheck size={16} /> Local workspace</span>
      <button className="quiet" onClick={openTeam}>Private team workspace <ArrowUpRight size={15} /></button>
    </footer>
  </main>;
}
