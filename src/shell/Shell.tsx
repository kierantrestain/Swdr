import { AppShell } from '@astryxdesign/core/AppShell';
import { BreadcrumbItem, Breadcrumbs } from '@astryxdesign/core/Breadcrumbs';
import { Button } from '@astryxdesign/core/Button';
import type { DropdownMenuOption } from '@astryxdesign/core/DropdownMenu';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Kbd } from '@astryxdesign/core/Kbd';
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav';
import { TopNav } from '@astryxdesign/core/TopNav';
import { ArrowLeft, ChevronLeft, ChevronRight, Home as HomeIcon, Keyboard, LogIn, Moon, Search, Share2, Sun, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { accountApi } from '../workspace/account-api';
import type { TeamAccount } from '../workspace/team-contract';
import type { DocumentModel, Episode, Project } from '../model';
import { PROJECT_LABELS } from '../Home';
import { isCurrent, projectNavigation } from './navigation';
import { documentForEpisode, encodeRoute, episodeCode, orderedEpisodes, PRODUCTION_TABS, SECTION_LABELS, storyLabel } from './routes';
import type { Route } from './routes';

export type ColorMode = 'light' | 'dark';

export interface ShellProps {
  route: Route;
  project?: Project;
  document?: DocumentModel;
  episode?: Episode;
  navigate: (route: Route) => void;
  onBack: () => void;
  onPalette: () => void;
  onShortcuts: () => void;
  switchEpisode: (episodeId: string) => void;
  stepEpisode: (step: -1 | 1) => void;
  sidebarCollapsed: boolean;
  onSidebarCollapsedChange: (collapsed: boolean) => void;
  mode: ColorMode;
  onModeChange: (mode: ColorMode) => void;
  children: ReactNode;
}

/** Follow an in-app link without a page load, keeping modified clicks (new tab) native. */
/** Who is signed in to the hosted workspace, checked once per shell; quietly signed out when the service is absent. */
function useSignedIn(): TeamAccount | undefined {
  const [account, setAccount] = useState<TeamAccount>();
  useEffect(() => {
    let live = true;
    accountApi.session().then(value => { if (live) setAccount(value); }, () => undefined);
    return () => { live = false; };
  }, []);
  return account;
}

export function linkProps(route: Route, navigate: (route: Route) => void) {
  return {
    href: encodeRoute(route),
    onClick: (event: MouseEvent) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      navigate(route);
    }
  };
}

function sectionLabel(route: Route, project?: Project): string {
  if (route.view === 'production') {
    const tab = PRODUCTION_TABS.find(item => item.slug === (route.tab ?? 'schedule'));
    return tab ? `Production · ${tab.label}` : 'Production';
  }
  if (route.view === 'story') return storyLabel(project);
  return SECTION_LABELS[route.view];
}

function episodeMenu(project: Project, document: DocumentModel | undefined, switchEpisode: (id: string) => void): DropdownMenuOption[] {
  const episodes = orderedEpisodes(project);
  const seasons = [...new Set(episodes.map(item => item.season))];
  return seasons.map(season => ({
    // Titled "S1 episodes" rather than "Season 1": page filters own the "Season" label.
    type: 'section' as const, title: `S${season} episodes`, id: `season-${season}`,
    items: episodes.filter(item => item.season === season).map(item => ({
      id: item.id, label: `${episodeCode(item)} · ${item.title}`,
      isDisabled: !documentForEpisode(project, item.id),
      endContent: item.id === document?.episodeId ? 'Current' : undefined,
      onClick: () => switchEpisode(item.id)
    }))
  }));
}

export function Shell(props: ShellProps) {
  const { route, project, document, episode, navigate, onBack, onPalette, onShortcuts, switchEpisode, stepEpisode,
    sidebarCollapsed, onSidebarCollapsedChange, mode, onModeChange, children } = props;
  const isHome = route.view === 'home';
  const account = useSignedIn();
  const episodes = project ? orderedEpisodes(project) : [];
  const index = episode ? episodes.findIndex(item => item.id === episode.id) : -1;
  const showEpisodes = Boolean(project && episodes.length && route.view !== 'import');
  // Projects without episodes switch between their documents from the same place.
  const showDocuments = Boolean(project && !episodes.length && project.documents.length > 1 && route.view !== 'import' && route.view !== 'project');
  const writing = route.view === 'write' || route.view === 'av';

  const heading = <span className="shell-brand">
    {isHome ? <span className="shell-wordmark" aria-label="SWDR">SWDR</span> : <>
      <IconButton label="Home" icon={<HomeIcon size={17} aria-hidden="true" />} variant="ghost" tooltip="All projects (g h)"
        onClick={() => navigate({ view: 'home' })} />
      <IconButton label="Back" icon={<ArrowLeft size={17} aria-hidden="true" />} variant="ghost" tooltip="Back" onClick={onBack} />
    </>}
  </span>;

  const crumbs = !isHome && <span className="shell-crumbs">
    <Breadcrumbs label="You are here" separator={<ChevronRight size={14} aria-hidden="true" />}>
      <BreadcrumbItem {...linkProps({ view: 'home' }, navigate)} isCurrent={false}>Projects</BreadcrumbItem>
      {project && <BreadcrumbItem isCurrent={false} onClick={() => navigate({ view: 'project', projectId: project.id, documentId: document?.id })}>{project.title}</BreadcrumbItem>}
      {(route.view !== 'project' || !project) && <BreadcrumbItem isCurrent={!showEpisodes && !showDocuments}>{sectionLabel(route, project)}</BreadcrumbItem>}
      {showDocuments && project && <BreadcrumbItem isCurrent menu={project.documents.map(item => ({
        id: item.id, label: item.title, endContent: item.id === document?.id ? 'Current' : undefined,
        onClick: () => navigate({ view: route.view === 'write' || route.view === 'av' ? (item.kind === 'av' ? 'av' : 'write') : route.view,
          projectId: project.id, documentId: item.id, tab: route.tab })
      }))}>{document?.title ?? 'Choose document'}</BreadcrumbItem>}
      {showEpisodes && project && <BreadcrumbItem isCurrent menu={episodeMenu(project, document, switchEpisode)}>
        {episode ? `${episodeCode(episode)} · ${episode.title}` : 'Choose episode'}
      </BreadcrumbItem>}
    </Breadcrumbs>
    {showEpisodes && <span className="shell-episode-steps">
      <IconButton size="sm" variant="ghost" label="Previous episode" tooltip="Previous episode ([)" icon={<ChevronLeft size={16} aria-hidden="true" />}
        isDisabled={index <= 0} onClick={() => stepEpisode(-1)} />
      <IconButton size="sm" variant="ghost" label="Next episode" tooltip="Next episode (])" icon={<ChevronRight size={16} aria-hidden="true" />}
        isDisabled={index < 0 || index >= episodes.length - 1} onClick={() => stepEpisode(1)} />
    </span>}
  </span>;

  const end = <span className="shell-actions">
    <Button label="Search" variant="secondary" size="sm" icon={<Search size={15} aria-hidden="true" />} onClick={onPalette}
      endContent={undefined} tooltip="Command palette">
      <span className="shell-search-label">Search</span><span className="shell-search-kbd"><Kbd keys="mod+k" /></span>
    </Button>
    <IconButton label="Keyboard shortcuts" tooltip="Keyboard shortcuts (?)" variant="ghost" icon={<Keyboard size={17} aria-hidden="true" />} onClick={onShortcuts} />
    <IconButton label={mode === 'dark' ? 'Use light appearance' : 'Use dark appearance'} variant="ghost"
      icon={mode === 'dark' ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />} onClick={() => onModeChange(mode === 'dark' ? 'light' : 'dark')} />
    {account ? <Button label={account.name || account.email} size="sm" variant="ghost" icon={<UserRound size={15} aria-hidden="true" />}
      tooltip={`Signed in as ${account.email}`} {...linkProps({ view: 'team' }, navigate)} /> :
      <Button label="Sign in" size="sm" variant="secondary" icon={<LogIn size={15} aria-hidden="true" />} tooltip="Sign in or create an account"
        {...linkProps({ view: 'team' }, navigate)} />}
    {project && <Button label="Share" size="sm" variant="primary" icon={<Share2 size={14} aria-hidden="true" />} tooltip="Share through the private team workspace"
      {...linkProps({ view: 'team' }, navigate)} />}
  </span>;

  // Keyed by the writing/page split: a route change remounts the rail at its remembered width instead of
  // animating (and cross-fading a copy of) the previous page.
  const sideNav = project ? <SideNav
    key={writing ? 'writing' : 'pages'}
    aria-label="Project sections"
    collapsible={{ isCollapsed: sidebarCollapsed, onCollapsedChange: onSidebarCollapsedChange, buttonLabel: sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar' }}
    header={<SideNavHeading heading={project.title} subheading={`${PROJECT_LABELS[project.kind]}${project.episodes.length ? ` · ${project.episodes.length} episodes` : ''}`} />}
  >
    {projectNavigation(project, document).map(group => <SideNavSection key={group.title} title={group.title}>
      {group.entries.map(entry => <SideNavItem key={entry.id} label={entry.label} icon={entry.icon} isSelected={isCurrent(entry, route)}
        endContent={entry.count ? <span className={`shell-count${entry.tone === 'warning' ? ' is-warning' : ''}`} aria-hidden="true"
          title={entry.tone === 'warning' ? `${entry.count} schedule conflict${entry.count === 1 ? '' : 's'}` : undefined}>{entry.count}</span> : undefined}
        {...linkProps(entry.route, navigate)} />)}
    </SideNavSection>)}
  </SideNav> : undefined;

  return <AppShell
    height="fill"
    variant="section"
    contentPadding={0}
    mobileNav={{ breakpoint: 'lg' }}
    topNav={<TopNav label="SWDR" heading={heading} startContent={crumbs || undefined} endContent={end} />}
    sideNav={sideNav}
  >
    <div className={`shell-content${writing ? ' is-writing' : ''}`} data-view={route.view}>
      {crumbs && <div className="shell-context-bar">{crumbs}</div>}
      {children}
    </div>
  </AppShell>;
}
