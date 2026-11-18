import { Theme } from '@astryxdesign/core/theme';
import { LoaderCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { themes, defaultThemeSlug } from './astryx-themes';
import { Home } from './Home';
import { ProjectView } from './ProjectView';
import { createDemoProjects } from './demo';
import type { Asset, DocumentModel, Project, ProjectKind, SourceRef, WorkspaceViewProps } from './model';
import { sourceFor } from './model';
import { createProject, resolveSource, snapshotDocument, useWorkspace } from './workspace';
import { AVView, OutlineView, WritingView } from './writing';
import { ReviewWorkspace, TeamWorkspace } from './workspace/team-ui';
import type { TeamRenderProps } from './workspace/team-ui';
import { ScriptTools } from './ScriptTools';
import { ProductionView } from './production';
import { EditorialView, SeriesView } from './story';
import { ExportActions, ImportView } from './interchange';
import { CommandMenu } from './shell/CommandMenu';
import type { CommandAction } from './shell/CommandMenu';
import { Shell } from './shell/Shell';
import type { ColorMode } from './shell/Shell';
import { ShortcutsDialog } from './shell/ShortcutsDialog';
import { useGlobalShortcuts } from './shell/shortcuts';
import { projectNavigation } from './shell/navigation';
import { documentForEpisode, encodeRoute, orderedEpisodes, parentRoute, parseRoute, scriptView } from './shell/routes';
import type { Destination, Route } from './shell/routes';
import './shell/shell.css';

const recentKey = 'swdr.recent.v1';
const sidebarKey = 'swdr.sidebar.v1';
const modeKey = 'swdr.appearance.v1';
const deviceLabels = { loading: 'Opening local workspace', saving: 'Saving on this device…', saved: 'Saved on this device', error: 'Local save needs attention' };

function readJson<T>(key: string, fallback: T): T {
  try { return (JSON.parse(localStorage.getItem(key) ?? 'null') as T | null) ?? fallback; }
  catch { return fallback; }
}

function writeJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* Preferences are optional; the workspace itself is stored in IndexedDB. */ }
}

function historyDepth(): number {
  const state = window.history.state as { swdrDepth?: number } | null;
  return typeof state?.swdrDepth === 'number' ? state.swdrDepth : 0;
}

export function App() {
  const { projects, ready, status, error, saveProject, updateProject, retrySave } = useWorkspace();
  const [route, setRoute] = useState(() => parseRoute());
  const [focus, setFocus] = useState(false);
  const [message, setMessage] = useState('');
  const [recent, setRecent] = useState(() => readJson<{ projectId: string; documentId: string } | null>(recentKey, null));
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [sidebar, setSidebar] = useState(() => readJson(sidebarKey, { writing: true, other: false }));
  const [mode, setMode] = useState<ColorMode>(() => readJson<ColorMode>(modeKey, 'light'));
  const active = projects.find(project => project.id === route.projectId && !project.archivedAt);
  const head = active?.documents.find(document => document.id === route.documentId) ?? (!route.documentId ? active?.documents[0] : undefined);
  const saved = route.revisionId && active?.snapshots.find(snapshot => snapshot.document.id === route.documentId && snapshot.document.revisionId === route.revisionId);
  const document = saved ? saved.document : head;
  const episode = active?.episodes.find(item => item.id === document?.episodeId);
  const historical = Boolean(saved);
  const writing = route.view === 'write' || route.view === 'av';

  useEffect(() => {
    if (!window.history.state || typeof (window.history.state as { swdrDepth?: number }).swdrDepth !== 'number') {
      window.history.replaceState({ ...(window.history.state ?? {}), swdrDepth: 0 }, '');
    }
    function onHistory() {
      // A link followed by the browser itself (or a typed hash) adds an entry without a depth.
      const state = window.history.state as { swdrDepth?: number } | null;
      if (typeof state?.swdrDepth !== 'number') window.history.replaceState({ swdrDepth: 1 }, '');
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

  useEffect(() => { writeJson(modeKey, mode); }, [mode]);

  const go = useCallback((next: Route, options: { replace?: boolean } = {}) => {
    setRoute(next);
    setFocus(false);
    const encoded = encodeRoute(next);
    if (options.replace) window.history.replaceState({ swdrDepth: historyDepth() }, '', encoded);
    else if (location.hash !== encoded) window.history.pushState({ swdrDepth: historyDepth() + 1 }, '', encoded);
    if (!options.replace) {
      window.scrollTo({ top: 0 });
      window.document.querySelector('main')?.scrollTo?.({ top: 0 });
    }
  }, []);

  const back = useCallback(() => {
    if (historyDepth() > 0) window.history.back();
    else go(parentRoute(route));
  }, [go, route]);

  const remember = useCallback((project: Project, view: Destination, opening?: DocumentModel) => {
    if (opening && (view === 'write' || view === 'av' || view === 'editorial')) {
      writeJson(recentKey, { projectId: project.id, documentId: opening.id });
      setRecent({ projectId: project.id, documentId: opening.id });
    }
  }, []);

  const navigate = useCallback((next: Route) => {
    const project = projects.find(item => item.id === next.projectId);
    const opening = project?.documents.find(item => item.id === next.documentId);
    if (project) remember(project, next.view, opening);
    go(next);
  }, [go, projects, remember]);

  function openProject(project: Project, view: Destination = 'project', selected?: DocumentModel) {
    const opening = selected ?? project.documents[0];
    remember(project, view, opening);
    go({ projectId: project.id, documentId: opening?.id, view });
  }

  function resume(project: Project, document: DocumentModel) {
    openProject(project, document.kind === 'av' ? 'av' : project.kind === 'documentary' && document.episodeId ? 'editorial' : 'write', document);
  }

  function create(title: string, kind: ProjectKind, synopsis: string) {
    const project = saveProject(createProject(title, kind, synopsis));
    openProject(project, kind === 'commercial' ? 'av' : kind === 'documentary' ? 'editorial' : 'write');
  }

  const openSource = useCallback((source: SourceRef) => {
    const project = projects.find(item => item.id === source.projectId && !item.archivedAt);
    const document = project && resolveSource(project, source);
    if (!project || !document) { setMessage('That source is unavailable in this workspace.'); return; }
    go({ view: document.kind === 'av' ? 'av' : 'write', projectId: project.id, documentId: document.id,
      revisionId: document.revisionId, sceneId: source.sceneId, blockId: source.blockId, shotId: source.shotId });
  }, [go, projects]);

  /** Swap the open document for another episode's, keeping the section and tab. */
  const switchEpisode = useCallback((episodeId: string) => {
    if (!active) return;
    const target = documentForEpisode(active, episodeId, head);
    if (!target) { setMessage('That episode has no document yet.'); return; }
    const view: Destination = route.view === 'write' || route.view === 'av' ? scriptView(active, target)
      : route.view === 'import' ? 'project' : route.view;
    remember(active, view, target);
    go({ view, projectId: active.id, documentId: target.id, tab: route.tab });
  }, [active, go, head, remember, route.tab, route.view]);

  const stepEpisode = useCallback((step: -1 | 1) => {
    if (!active || !active.episodes.length) return;
    const episodes = orderedEpisodes(active);
    const index = episodes.findIndex(item => item.id === document?.episodeId);
    for (let next = index + step; next >= 0 && next < episodes.length; next += step) {
      if (documentForEpisode(active, episodes[next].id)) { switchEpisode(episodes[next].id); return; }
    }
    setMessage(step < 0 ? 'This is the first episode.' : 'This is the last episode.');
  }, [active, document?.episodeId, switchEpisode]);

  const openScene = useCallback((sceneId: string, blockId: string) => {
    if (active && head) openSource(sourceFor(active, head, { sceneId, blockId }));
  }, [active, head, openSource]);

  const setTab = useCallback((tab: string) => {
    setRoute(current => {
      const next = { ...current, tab };
      window.history.replaceState({ swdrDepth: historyDepth() }, '', encodeRoute(next));
      return next;
    });
  }, []);

  const selectDocument = useCallback((documentId: string) => {
    if (!active || documentId === route.documentId) return;
    go({ ...route, documentId, revisionId: undefined, sceneId: undefined, blockId: undefined, shotId: undefined }, { replace: true });
  }, [active, go, route]);

  const collapsed = writing ? sidebar.writing : sidebar.other;
  const setCollapsed = useCallback((value: boolean) => {
    setSidebar(current => {
      const next = writing ? { ...current, writing: value } : { ...current, other: value };
      writeJson(sidebarKey, next);
      return next;
    });
  }, [writing]);

  useGlobalShortcuts({
    palette: () => setPalette(open => !open),
    help: () => setShortcuts(true),
    sidebar: () => setCollapsed(!collapsed),
    episode: stepEpisode,
    go: target => {
      if (target === 'home') { go({ view: 'home' }); return; }
      if (target === 'team') { go({ view: 'team' }); return; }
      if (!active) { if (target === 'import') go({ view: 'import' }); return; }
      const entry = projectNavigation(active, head).flatMap(group => group.entries)
        .find(item => item.id === target || (target === 'script' && item.id === 'script'));
      if (entry) navigate(entry.route);
      else setMessage('That workspace is not part of this project.');
    }
  }, !focus);

  function commitIntake(imported: DocumentModel, file: Asset, previous?: DocumentModel, related: Asset[] = [], batch?: { remaining: number }) {
    const track = (project: Project, replace: boolean): Project => {
      const priorSources = Array.isArray(project.modules.imports) ? project.modules.imports : [];
      const assets = new Map(project.assets.map(asset => [asset.id, asset]));
      for (const asset of [file, ...related]) assets.set(asset.id, asset);
      const previousRevision = previous?.revisionId;
      return { ...project, assets: [...assets.values()],
        documents: replace ? project.documents.map(item => item.id === imported.id ? imported : item) : [...project.documents, imported],
        modules: { ...project.modules, imports: [...priorSources, { documentId: imported.id, revisionId: imported.revisionId,
          assetId: file.id, previousRevision, receivedAt: new Date().toISOString() }] }
      };
    };
    let updated: Project | undefined;
    if (active) {
      updated = updateProject(active.id, current => {
        if (!previous) return track(current, false);
        const working = current.documents.find(item => item.id === previous.id);
        if (working?.revisionId !== previous.revisionId || imported.id !== working.id || imported.episodeId !== working.episodeId) {
          throw new Error('The active draft changed after import review. Reopen the source and review the match again.');
        }
        return track(snapshotDocument(current, working.id, 'Before import', 'stash'), true);
      });
    } else {
      if (previous) throw new Error('Choose the source project before replacing its draft.');
      const base = createProject(imported.title, imported.kind === 'av' ? 'commercial' : imported.kind === 'stageplay' ? 'stage' : 'film');
      updated = saveProject(track({ ...base, documents: [] }, false));
    }
    if (!updated) throw new Error('The destination project is unavailable.');
    if (!batch?.remaining) resume(updated, imported);
  }

  function restoreArchive(project: Project, batch?: { remaining: number }) {
    if (projects.some(item => item.id === project.id)) throw new Error('This archive is already present in this workspace. Open it in a fresh browser profile to verify a separate restore.');
    const updated = saveProject(project);
    if (!batch?.remaining && !updated.archivedAt) openProject(updated);
  }

  function loadDemo() {
    const examples = createDemoProjects();
    examples.forEach(saveProject);
    const series = examples[examples.length - 1];
    setRecent({ projectId: series.id, documentId: series.documents[0].id });
    writeJson(recentKey, { projectId: series.id, documentId: series.documents[0].id });
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
    revisionId: route.revisionId, sceneId: route.sceneId, blockId: route.blockId, shotId: route.shotId
  } : undefined, [active?.id, document?.episodeId, document?.id, route]);
  const hasRequestedRevision = !target || (active && Boolean(resolveSource(active, target)));
  const goHome = () => go({ view: 'home' });

  const actions = useMemo<CommandAction[]>(() => [
    { id: 'action-home', label: 'All projects', auxiliaryData: { group: 'Actions', keys: 'g h', run: () => go({ view: 'home' }) } },
    { id: 'action-import', label: 'Import a script or project archive', auxiliaryData: { group: 'Actions', run: () => go(active ? { view: 'import', projectId: active.id, documentId: head?.id } : { view: 'import' }) } },
    { id: 'action-shortcuts', label: 'Keyboard shortcuts', auxiliaryData: { group: 'Actions', keys: '?', run: () => setShortcuts(true) } },
    { id: 'action-sidebar', label: collapsed ? 'Show the project sidebar' : 'Hide the project sidebar', auxiliaryData: { group: 'Actions', keys: 'mod+\\', run: () => setCollapsed(!collapsed) } },
    { id: 'action-appearance', label: mode === 'dark' ? 'Use light appearance' : 'Use dark appearance', auxiliaryData: { group: 'Actions', run: () => setMode(mode === 'dark' ? 'light' : 'dark') } },
    { id: 'action-team', label: 'Private team workspace', auxiliaryData: { group: 'Actions', keys: 'g t', run: () => go({ view: 'team' }) } }
  ], [active, collapsed, go, head?.id, mode, setCollapsed]);

  const isProjectView = route.view !== 'home' && route.view !== 'team' && route.view !== 'review';
  let page: React.ReactNode;
  if (route.view === 'review') page = <ReviewWorkspace reviewKey={route.reviewKey ?? ''} onHome={goHome} />;
  else if (route.view === 'team') page = <TeamWorkspace localProjects={projects.filter(project => !project.archivedAt)} onHome={goHome}
    renderWorkspace={view => <TeamDocument view={view} key={view.project.id} />} />;
  else if (!ready) page = <div className="swdr-page" id="main-content">
    <div className="empty-block">{error ? <><h1>Workspace unavailable</h1><p>{error}</p><button onClick={() => location.reload()}>Try again</button></>
      : <p><LoaderCircle size={15} className="spinner" /> Opening local workspace</p>}</div>
  </div>;
  else if (route.view === 'home') page = <Home projects={projects} recent={recentProject && recentDocument ? { project: recentProject, document: recentDocument } : undefined}
    open={openProject} resume={resume} create={create} importScript={() => go({ view: 'import' })} loadDemo={loadDemo}
    restoreArchived={id => { updateProject(id, project => ({ ...project, archivedAt: undefined })); setMessage('Project restored.'); }}
    openTeam={() => go({ view: 'team' })} openPalette={() => setPalette(true)} />;
  else if (route.view === 'project' && active) page = <ProjectView key={active.id} project={active} current={head}
    open={(view, doc) => openProject(active, view, doc ?? head)}
    update={update => { updateProject(active.id, update); }}
    archive={() => { updateProject(active.id, project => ({ ...project, archivedAt: new Date().toISOString() })); go({ view: 'home' }); setMessage('Project moved to the archive.'); }} />;
  else if (route.view === 'import') page = <ImportView project={active} document={head} onImportDocument={commitIntake} onRestoreProject={restoreArchive}
    onStatus={setMessage} onCancel={() => active ? openProject(active, 'project', head) : goHome()} />;
  else if (route.view === 'write' && shared && hasRequestedRevision) page = <div className="script-stage" id="main-content">
    <WritingView key={shared.document.id} {...shared} saveLabel={deviceLabels[status]} target={target} onFocusChange={setFocus}
      onOpenOutline={() => openProject(shared.project, 'outline', shared.document)}
      toolbarEnd={<><ScriptTools {...shared} /><ExportActions {...shared} /></>} />
  </div>;
  else if (route.view === 'outline' && shared) page = <OutlineView key={shared.project.id} {...shared} onSelectDocument={selectDocument} />;
  else if (route.view === 'av' && shared && hasRequestedRevision) page = <AVView key={shared.document.id} {...shared} saveLabel={deviceLabels[status]} target={target} toolbarEnd={<ExportActions {...shared} />} />;
  else if (route.view === 'production' && shared) page = <ProductionView key={shared.document.id} {...shared} tab={route.tab} onTabChange={setTab} />;
  else if (route.view === 'story' && shared) page = <SeriesView key={shared.document.id} {...shared} tab={route.tab} onTabChange={setTab} />;
  else if (route.view === 'editorial' && shared) page = <EditorialView key={shared.project.id} {...shared} tab={route.tab} onTabChange={setTab} onSelectDocument={selectDocument} />;
  else page = <div className="swdr-page" id="main-content"><div className="empty-block">
    <p>{!hasRequestedRevision ? 'This exact source revision is unavailable.' : route.projectId && !active ? 'The project is unavailable on this device.' : 'Open a manuscript from your projects.'}</p>
  </div></div>;
  // The manuscript stays paper-white in every appearance (writing.css); its chrome follows the theme.

  return <Theme theme={themes[defaultThemeSlug]} mode={mode}>
    <div className={`app${focus ? ' is-focused' : ''}`} data-view={route.view}>
      {route.view === 'team' || route.view === 'review' ? page : <Shell
        route={route} project={isProjectView ? active : undefined} document={head} episode={episode} navigate={navigate} onBack={back}
        onPalette={() => setPalette(true)} onShortcuts={() => setShortcuts(true)} switchEpisode={switchEpisode} stepEpisode={stepEpisode}
        sidebarCollapsed={collapsed} onSidebarCollapsedChange={setCollapsed} mode={mode} onModeChange={setMode}>
        {page}
      </Shell>}
      {palette && <CommandMenu isOpen={palette} onOpenChange={setPalette} projects={projects} project={isProjectView ? active : undefined} document={head}
        navigate={navigate} openScene={openScene} switchEpisode={switchEpisode} actions={actions} />}
      {shortcuts && <ShortcutsDialog isOpen={shortcuts} onOpenChange={setShortcuts} />}
      {error && ready && <aside className="save-error" role="alert">{error}<button onClick={retrySave}>Retry save</button></aside>}
      {message && <div className="status-toast" role="status">{message}</div>}
    </div>
  </Theme>;
}


type TeamView = 'write' | 'outline' | 'story' | 'editorial' | 'production';
const teamDestinations: { id: TeamView; label: string }[] = [
  { id: 'write', label: 'Write' }, { id: 'outline', label: 'Outline' }, { id: 'story', label: 'Series Intelligence' },
  { id: 'editorial', label: 'Editorial' }, { id: 'production', label: 'Production' }
];

function TeamDocument({ view }: { view: TeamRenderProps }) {
  const [mode, setMode] = useState<TeamView>('write');
  const fullScope = view.grant.episodeIds === null;
  const currentMode = fullScope || mode === 'outline' ? mode : 'write';
  const props = { ...view, onOpenSource: (source: SourceRef) => { setMode('write'); view.onOpenSource(source); } };
  const canExport = view.grant.role === 'owner' || view.grant.role === 'editor';
  const exporter = canExport ? <ExportActions {...view} includeProject={fullScope} /> : <></>;

  return <>
    <nav className="team-workspaces-nav" aria-label="Project workspaces">
      {teamDestinations.slice(0, fullScope ? teamDestinations.length : 2).map(destination =>
        <button key={destination.id} type="button" aria-pressed={destination.id === currentMode} className="selectable"
          onClick={() => setMode(destination.id)}>{destination.label}</button>)}
    </nav>
    {currentMode === 'outline' ? <OutlineView key={view.document.id} {...props} />
      : currentMode === 'story' ? <SeriesView {...props} />
      : currentMode === 'editorial' ? <EditorialView key={view.document.id} {...props} />
      : currentMode === 'production' ? <ProductionView key={view.document.id} {...props} />
      : view.document.kind === 'av' ? <AVView key={view.document.id} {...props} target={view.selectedSource} toolbarEnd={exporter} />
      : <div className="team-script-stage" id="main-content"><WritingView key={view.document.id} {...props}
        target={view.selectedSource} toolbarEnd={exporter} onOpenOutline={() => setMode('outline')} /></div>}
  </>;
}
