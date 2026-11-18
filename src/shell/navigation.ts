import { BookOpen, CalendarRange, Camera, ClipboardList, Clapperboard, FileStack, FileText, FolderInput, LayoutGrid, LayoutDashboard, Mic, PiggyBank, ScrollText, Users, Video, Images } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import type { DocumentModel, Project } from '../model';
import { getProductionPlan, scheduleConflicts } from '../production/model';
import { PRODUCTION_TABS, scriptView, sectionsFor } from './routes';
import type { Destination, Route } from './routes';

export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export interface NavEntry {
  id: string;
  label: string;
  /** Short keyboard hint shown in the shortcuts list and command palette (after "g"). */
  key?: string;
  icon: IconComponent;
  route: Route;
  count?: number;
  tone?: 'warning' | 'neutral';
}

export interface NavGroup {
  title: string;
  entries: NavEntry[];
}

const icon = (component: unknown) => component as IconComponent;

/** The project's workspaces, grouped the way the sidebar and command palette show them. */
export function projectNavigation(project: Project, document: DocumentModel | undefined): NavGroup[] {
  const base = { projectId: project.id, documentId: document?.id };
  const sections = sectionsFor(project);
  const plan = document ? getProductionPlan(project, document.id) : undefined;
  const conflicts = plan ? scheduleConflicts(plan).length : 0;
  const writing: NavEntry[] = [
    { id: 'script', label: document?.kind === 'av' ? 'AV script' : 'Script', key: 'w', icon: icon(FileText), route: { ...base, view: scriptView(project, document) } },
    { id: 'outline', label: 'Outline', key: 'o', icon: icon(LayoutGrid), route: { ...base, view: 'outline' }, count: document?.beats.length || undefined }
  ];
  const development: NavEntry[] = [
    ...(sections.creator ? [{ id: 'creator', label: 'Creator studio', key: 'y', icon: icon(Video), route: { ...base, view: 'creator' as Destination }, count: Array.isArray((project.modules.creator as { pieces?: unknown[] } | undefined)?.pieces) ? (project.modules.creator as { pieces: unknown[] }).pieces.length || undefined : undefined }] : []),
    ...(sections.series ? [{ id: 'story', label: 'Series Intelligence', key: 'i', icon: icon(BookOpen), route: { ...base, view: 'story' as Destination } }] : []),
    ...(sections.editorial ? [{ id: 'editorial', label: project.kind === 'commercial' ? 'Brief & editorial' : 'Editorial', key: 'e', icon: icon(Mic), route: { ...base, view: 'editorial' as Destination } }] : [])
  ];
  const productionIcons: Record<string, IconComponent> = {
    schedule: icon(CalendarRange), breakdown: icon(ClipboardList), shots: icon(Camera), sides: icon(ScrollText),
    'call-sheets': icon(Clapperboard), reports: icon(FileStack), budget: icon(PiggyBank)
  };
  const productionKeys: Record<string, string> = { schedule: 's', breakdown: 'b', shots: 'v', sides: 'd', 'call-sheets': 'c', reports: 'r' };
  const production: NavEntry[] = sections.production ? PRODUCTION_TABS.map(tab => ({
    id: `production-${tab.slug}`, label: tab.label, key: productionKeys[tab.slug], icon: productionIcons[tab.slug],
    route: { ...base, view: 'production' as Destination, tab: tab.slug },
    count: tab.slug === 'schedule' && conflicts ? conflicts : undefined, tone: tab.slug === 'schedule' && conflicts ? 'warning' as const : undefined
  })) : [];
  const projectEntries: NavEntry[] = [
    { id: 'project', label: 'Overview', key: 'p', icon: icon(LayoutDashboard), route: { ...base, view: 'project' }, count: project.documents.length },
    { id: 'media', label: 'Files & media', key: 'f', icon: icon(Images), route: { ...base, view: 'media' }, count: project.assets.length || undefined },
    { id: 'import', label: 'Import', key: 'm', icon: icon(FolderInput), route: { ...base, view: 'import' } },
    { id: 'team', label: 'Team & sharing', key: 't', icon: icon(Users), route: { view: 'team' } }
  ];
  return [
    { title: 'Write', entries: writing },
    ...(development.length ? [{ title: 'Develop', entries: development }] : []),
    ...(production.length ? [{ title: 'Production', entries: production }] : []),
    { title: 'Project', entries: projectEntries }
  ];
}

/** Whether a navigation entry is the page currently open. */
export function isCurrent(entry: NavEntry, route: Route): boolean {
  if (entry.route.view !== route.view) return false;
  if (route.view !== 'production') return true;
  const current = route.tab ?? 'schedule';
  return entry.route.tab === current;
}

const SERIES_TABS = ['Relationship web', 'Story map', 'Event ledger', 'Characters', 'Scene matrix', 'Arcs and continuity'];
const EDITORIAL_TABS = ['Segments', 'Sources', 'Claims', 'Host guide', 'Producer rundown', 'Graphics', 'Issues', 'Branded brief'];
const tabSlug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** Workspace tabs inside Series Intelligence and Editorial, for the command palette. */
export function workspaceTabs(project: Project, document: DocumentModel | undefined): NavEntry[] {
  const base = { projectId: project.id, documentId: document?.id };
  const sections = sectionsFor(project);
  return [
    ...(sections.series ? SERIES_TABS.map(label => ({ id: `story-${tabSlug(label)}`, label: `Series Intelligence · ${label}`, icon: icon(BookOpen),
      route: { ...base, view: 'story' as Destination, tab: tabSlug(label) } })) : []),
    ...(sections.editorial ? EDITORIAL_TABS.map(label => ({ id: `editorial-${tabSlug(label)}`, label: `Editorial · ${label}`, icon: icon(Mic),
      route: { ...base, view: 'editorial' as Destination, tab: tabSlug(label) } })) : [])
  ];
}
