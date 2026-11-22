import type { DocumentModel, Project } from '../model';
import { isStoryProject, storyWorkspaceTitle } from '../story/story-profile';
export { episodeCode, orderedEpisodes } from '../story/source';

/** Every view that belongs to an open project. */
export type ProjectSection = 'project' | 'write' | 'outline' | 'av' | 'story' | 'editorial' | 'production' | 'creator' | 'media' | 'import';
export type Destination = 'home' | 'team' | 'review' | ProjectSection;

export interface Route {
  view: Destination;
  projectId?: string;
  documentId?: string;
  revisionId?: string;
  sceneId?: string;
  blockId?: string;
  shotId?: string;
  reviewKey?: string;
  /** The workspace tab inside a section (production pane, story view, editorial pane). */
  tab?: string;
  /** Optional character dossier id opened inside Story/Series Intelligence. */
  character?: string;
}

const projectViews = new Set<Destination>(['project', 'write', 'outline', 'av', 'story', 'editorial', 'production', 'creator', 'media', 'import']);

export function parseRoute(location: Pick<Location, 'hash' | 'pathname'> = window.location): Route {
  const [path, query = ''] = location.hash.slice(1).split('?');
  if (path.startsWith('review=')) return { view: 'review', reviewKey: path.slice('review='.length) };
  if (path === 'team' || (!path && location.pathname === '/team')) return { view: 'team' };
  if (path === 'import') {
    const params = new URLSearchParams(query);
    return { view: 'import', tab: params.get('tab') ?? undefined };
  }
  const [prefix, projectId, view, documentId] = path.split('/');
  if (prefix !== 'p' || !projectId || !projectViews.has(view as Destination)) return { view: 'home' };
  const params = new URLSearchParams(query);
  return {
    projectId, documentId: documentId || undefined, view: view as Destination, revisionId: params.get('rev') ?? undefined,
    sceneId: params.get('scene') ?? undefined, blockId: params.get('block') ?? undefined, shotId: params.get('shot') ?? undefined,
    tab: params.get('tab') ?? undefined, character: params.get('character') ?? undefined
  };
}

export function encodeRoute(route: Route): string {
  if (route.view === 'review') return `#review=${route.reviewKey ?? ''}`;
  if (!route.projectId) {
    if (route.view === 'home') return '#home';
    const params = new URLSearchParams();
    if (route.tab) params.set('tab', route.tab);
    return `#${route.view}${params.size ? `?${params}` : ''}`;
  }
  const params = new URLSearchParams();
  if (route.revisionId) params.set('rev', route.revisionId);
  if (route.sceneId) params.set('scene', route.sceneId);
  if (route.blockId) params.set('block', route.blockId);
  if (route.shotId) params.set('shot', route.shotId);
  if (route.tab) params.set('tab', route.tab);
  if (route.character) params.set('character', route.character);
  const query = params.size ? `?${params}` : '';
  return `#p/${route.projectId}/${route.view}${route.documentId ? `/${route.documentId}` : ''}${query}`;
}

export const SECTION_LABELS: Record<Destination, string> = {
  home: 'Projects', team: 'Team', review: 'Review', project: 'Overview', write: 'Script', outline: 'Outline',
  av: 'AV script', story: 'Series Intelligence', editorial: 'Editorial', production: 'Production', creator: 'Creator studio', media: 'Files & media', import: 'Import'
};

/** Medium-native title for the Story Intelligence workspace (Series / Film / Stage / Story Intelligence). */
export function storyLabel(project?: Pick<Project, 'kind'>): string {
  return project ? storyWorkspaceTitle(project.kind) : SECTION_LABELS.story;
}

/** Production panes, in the order the workspace shows them, with their URL slugs. */
export const PRODUCTION_TABS = [
  { slug: 'schedule', pane: 'Stripboard', label: 'Schedule' },
  { slug: 'breakdown', pane: 'Breakdown', label: 'Breakdown' },
  { slug: 'shots', pane: 'Shots & storyboard', label: 'Shots & storyboard' },
  { slug: 'sides', pane: 'Sides', label: 'Sides' },
  { slug: 'call-sheets', pane: 'Call sheets', label: 'Call sheets' },
  { slug: 'reports', pane: 'Reports', label: 'Reports' },
  { slug: 'budget', pane: 'Reports', label: 'Budget' }
] as const;

export function slugify(label: string): string {
  return label.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** The working document that represents an episode: prefer the same format as the one open. */
export function documentForEpisode(project: Project, episodeId: string, prefer?: DocumentModel): DocumentModel | undefined {
  const candidates = project.documents.filter(document => document.episodeId === episodeId);
  return candidates.find(document => prefer && document.kind === prefer.kind) ?? candidates.find(document => document.kind !== 'av') ?? candidates[0];
}

/** The view that opens a document for writing. */
export function scriptView(project: Project, document?: DocumentModel): 'write' | 'av' {
  return document?.kind === 'av' || (!document && (project.kind === 'commercial' || project.kind === 'creator')) ? 'av' : 'write';
}

/** Which workspaces make sense for each kind of project. */
export function sectionsFor(project: Project): { story: boolean; series: boolean; editorial: boolean; production: boolean; creator: boolean } {
  return {
    story: isStoryProject(project),
    series: project.kind === 'series',
    creator: project.kind === 'creator' || project.kind === 'commercial',
    editorial: project.kind === 'documentary' || project.kind === 'commercial',
    production: project.kind !== 'commercial' && project.kind !== 'creator'
  };
}

/** The parent of a route, used when Back has no in-app history to return to. */
export function parentRoute(route: Route): Route {
  if (route.view === 'home') return route;
  if (!route.projectId || route.view === 'project') return { view: 'home' };
  return { view: 'project', projectId: route.projectId, documentId: route.documentId };
}
