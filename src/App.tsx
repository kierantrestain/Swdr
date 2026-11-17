import { Home as HomeIcon, LoaderCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Home } from './Home';
import { ProjectView } from './ProjectView';
import type { ProjectDestination } from './ProjectView';
import { createDemoProjects, episodeLabel } from './demo';
import type { DocumentModel, Project, ProjectKind, SourceRef, WorkspaceViewProps } from './model';
import { createProject, resolveSource, useWorkspace } from './workspace';
import { AVView, OutlineView, WritingView } from './writing';
import { ReviewWorkspace, TeamWorkspace } from './workspace/team-ui';
import { ScriptTools } from './ScriptTools';

type Destination = 'home' | 'project' | 'team' | 'review' | ProjectDestination;
interface Route {
  view: Destination;
  projectId?: string;
  documentId?: string;
  revisionId?: string;
  sceneId?: string;
  blockId?: string;
  reviewKey?: string;
}
const recentKey = 'swdr.recent.v1';
const projectViews = new Set<Destination>(['project', 'write', 'outline', 'av', 'story', 'editorial', 'production', 'import']);
const deviceLabels = { loading: 'Opening local workspace', saving: 'Saving on this device…', saved: 'Saved on this device', error: 'Local save needs attention' };

function parseRoute(): Route {
  const [path, query = ''] = window.location.hash.slice(1).split('?');
  if (path.startsWith('review=')) return { view: 'review', reviewKey: path.slice('review='.length) };
  if (path === 'team' || (!path && window.location.pathname === '/team')) return { view: 'team' };
  if (path === 'import') return { view: 'import' };
  const [prefix, projectId, view, documentId] = path.split('/');
  if (prefix !== 'p' || !projectId || !projectViews.has(view as Destination)) return { view: 'home' };
  const params = new URLSearchParams(query);
  return { projectId, documentId, view: view as Destination, revisionId: params.get('rev') ?? undefined,
    sceneId: params.get('scene') ?? undefined, blockId: params.get('block') ?? undefined };
}

function encodeRoute(route: Route): string {
  if (route.view === 'review') return `#review=${route.reviewKey ?? ''}`;
  if (!route.projectId) return route.view === 'home' ? '#home' : `#${route.view}`;
  const params = new URLSearchParams();
  if (route.revisionId) params.set('rev', route.revisionId);
  if (route.sceneId) params.set('scene', route.sceneId);
  if (route.blockId) params.set('block', route.blockId);
  const query = params.size ? `?${params}` : '';
  return `#p/${route.projectId}/${route.view}${route.documentId ? `/${route.documentId}` : ''}${query}`;
}

function readRecent(): { projectId: string; documentId: string } | null {
  try { return JSON.parse(localStorage.getItem(recentKey) ?? 'null'); }
  catch { return null; }
}

function writeRecent(projectId: string, documentId: string) {
  try { localStorage.setItem(recentKey, JSON.stringify({ projectId, documentId })); }
  catch { /* The project stays in the durable workspace when preferences are unavailable. */ }
}

const destinationLabels: Partial<Record<Destination, string>> = {
  outline: 'Outline', story: 'Series workspace', editorial: 'Factual writing',
  production: 'Production', av: 'AV script', import: 'Import a draft', team: 'Private team'
};

export function App() {
  const { projects, ready, status, error, saveProject, updateProject, retrySave } = useWorkspace();
  const [route, setRoute] = useState(parseRoute);
  const [focus, setFocus] = useState(false);
  const [message, setMessage] = useState('');
  const [recent, setRecent] = useState(readRecent);
  const active = projects.find(project => project.id === route.projectId && !project.archivedAt);
  const head = active?.documents.find(document => document.id === route.documentId) ?? (!route.documentId ? active?.documents[0] : undefined);
  const saved = route.revisionId && active?.snapshots.find(snapshot => snapshot.document.id === route.documentId && snapshot.document.revisionId === route.revisionId);
  const document = saved ? saved.document : head;
  const episode = active?.episodes.find(item => item.id === document?.episodeId);
  const historical = Boolean(saved);

  useEffect(() => {
    function onHistory() {
      setRoute(parseRoute());
      setFocus(false);
    }
    window.addEventListener('hashchange', onHistory);
    window.addEventListener('popstate', onHistory);
    return () => {
      window.removeEventListener('hashchange', onHistory);
      window.removeEventListener('popstate', onHistory);
    };
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 3700);
    return () => clearTimeout(timer);
  }, [message]);

  const go = useCallback((next: Route) => {
    setRoute(next);
    setFocus(false);
    const encoded = encodeRoute(next);
    if (location.hash !== encoded) window.history.pushState({}, '', encoded);
    window.scrollTo({ top: 0 });
  }, []);

  function openProject(project: Project, view: Destination = 'project', selected?: DocumentModel) {
    const opening = selected ?? project.documents[0];
    if (opening && (view === 'write' || view === 'av' || view === 'editorial')) {
      writeRecent(project.id, opening.id);
      setRecent({ projectId: project.id, documentId: opening.id });
    }
    go({ projectId: project.id, documentId: opening?.id, view });
  }

  function resume(project: Project, document: DocumentModel) {
    openProject(project, document.kind === 'av' ? 'av' : project.kind === 'documentary' && document.episodeId ? 'editorial' : 'write', document);
  }

  function create(title: string, kind: ProjectKind, synopsis: string) {
    const project = saveProject(createProject(title, kind, synopsis));
    openProject(project, kind === 'commercial' ? 'av' : kind === 'documentary' ? 'editorial' : 'write');
  }

  function openSource(source: SourceRef) {
    const project = projects.find(item => item.id === source.projectId && !item.archivedAt);
    const document = project && resolveSource(project, source);
    if (!project || !document) { setMessage('That source is unavailable in this workspace.'); return; }
    go({ view: document.kind === 'av' ? 'av' : 'write', projectId: project.id, documentId: document.id,
      revisionId: document.revisionId, sceneId: source.sceneId, blockId: source.blockId });
  }

  function loadDemo() {
    const examples = createDemoProjects();
    examples.forEach(saveProject);
    const series = examples[examples.length - 1];
    setRecent({ projectId: series.id, documentId: series.documents[0].id });
    writeRecent(series.id, series.documents[0].id);
    setMessage('Demo projects opened in your local workspace.');
  }

  const recentProject = projects.find(project => project.id === recent?.projectId && !project.archivedAt)
    ?? projects.find(project => !project.archivedAt);
  const recentDocument = recentProject?.documents.find(document => document.id === recent?.documentId) ?? recentProject?.documents[0];

  const shared = active && document ? {
    project: active,
    document,
    onProjectChange: (update: Parameters<WorkspaceViewProps['onProjectChange']>[0]) => {
      if (!historical) updateProject(active.id, update);
    },
    onDocumentChange: (update: Parameters<WorkspaceViewProps['onDocumentChange']>[0]) => {
      if (!historical) updateProject(active.id, project => ({ ...project, documents: project.documents.map(current => current.id === document.id
        ? typeof update === 'function' ? update(current) : update
        : current) }));
    },
    onOpenSource: openSource,
    onStatus: setMessage,
    readOnly: historical
  } satisfies WorkspaceViewProps : undefined;

  const target = useMemo(() => active?.id && document?.id && route.revisionId ? {
    projectId: active.id, documentId: document.id, episodeId: document.episodeId,
    revisionId: route.revisionId, sceneId: route.sceneId, blockId: route.blockId
  } : undefined, [active?.id, document?.episodeId, document?.id, route]);
  const hasRequestedRevision = !target || (active && Boolean(resolveSource(active, target)));
  const goHome = () => go({ view: 'home' });

  return <div className={`app${focus ? ' is-focused' : ''}`}>
    <a href="#main-content" className="skip-link" onClick={event => {
      const main = window.document.getElementById('main-content');
      if (main) { event.preventDefault(); main.tabIndex = -1; main.focus(); }
    }}>Skip to content</a>
    {!focus && route.view !== 'team' && route.view !== 'review' && <header className="top-bar">
      {route.view === 'home' ? <>
        <span className="wordmark" aria-label="SWDR">SWDR</span>
        <span className="top-caption">Writing workspace</span>
      </> : <>
        <button type="button" className="home-button" onClick={() => go({ view: 'home' })}><HomeIcon size={16} /> Home</button>
        <span className="top-rule" />
        {active ? <button type="button" className="project-breadcrumb" onClick={() => openProject(active, 'project', head)}>{active.title}</button>
          : <span className="project-breadcrumb">SWDR</span>}
        <span className="top-caption top-context">{[episodeLabel(episode), destinationLabels[route.view]].filter(Boolean).join(' · ')}</span>
      </>}
    </header>}
    {route.view === 'review' ? <ReviewWorkspace reviewKey={route.reviewKey ?? ''} onHome={goHome} />
      : route.view === 'team' ? <TeamWorkspace localProjects={projects.filter(project => !project.archivedAt)} onHome={goHome}
        renderWorkspace={view => view.document.kind === 'av' ? <AVView key={view.document.id} {...view} />
          : <div className="team-script-stage" id="main-content"><WritingView key={view.document.id} {...view} target={view.selectedSource} /></div>} />
      : !ready ? <main className="swdr-page" id="main-content">
      <div className="empty-block">{error ? <><h1>Workspace unavailable</h1><p>{error}</p><button onClick={() => location.reload()}>Try again</button></>
        : <p><LoaderCircle size={15} className="spinner" /> Opening local workspace</p>}</div>
    </main> : route.view === 'home' ? <Home projects={projects} recent={recentProject && recentDocument ? { project: recentProject, document: recentDocument } : undefined}
      open={openProject} resume={resume} create={create} importScript={() => go({ view: 'import' })} loadDemo={loadDemo}
      restoreArchived={id => { updateProject(id, project => ({ ...project, archivedAt: undefined })); setMessage('Project restored.'); }}
      openTeam={() => go({ view: 'team' })} />
      : route.view === 'project' && active ? <ProjectView key={active.id} project={active} open={(view, doc) => openProject(active, view, doc ?? head)}
        update={update => { updateProject(active.id, update); }}
        archive={() => { updateProject(active.id, project => ({ ...project, archivedAt: new Date().toISOString() })); go({ view: 'home' }); setMessage('Project moved to the archive.'); }} />
      : route.view === 'write' && shared && hasRequestedRevision ? <div className="script-stage" id="main-content">
        <WritingView key={shared.document.id} {...shared} saveLabel={deviceLabels[status]} target={target} onFocusChange={setFocus}
          onOpenOutline={() => openProject(shared.project, 'outline', shared.document)}
          toolbarEnd={<ScriptTools {...shared} />} />
      </div>
      : route.view === 'outline' && shared ? <OutlineView key={shared.document.id} {...shared}
        toolbarEnd={<button onClick={() => resume(shared.project, shared.document)}>Open script</button>} />
      : route.view === 'av' && shared && hasRequestedRevision ? <AVView key={shared.document.id} {...shared} saveLabel={deviceLabels[status]} />
      : <main className="swdr-page" id="main-content"><div className="empty-block">
        <p>{!hasRequestedRevision ? 'This exact source revision is unavailable.' : route.projectId && !active ? 'The project is unavailable on this device.' : 'Open a manuscript from your projects.'}</p>
      </div></main>}
    {error && ready && <aside className="save-error" role="alert">{error}<button onClick={retrySave}>Retry save</button></aside>}
    {message && <div className="status-toast" role="status">{message}</div>}
  </div>;
}

