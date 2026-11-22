import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Kbd } from '@astryxdesign/core/Kbd';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Selector } from '@astryxdesign/core/Selector';
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, BookOpen, Clapperboard, FileText, FolderOpen, Layers, Mic, Plus, Search, ShieldCheck, Sparkles, Theater, Tv, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { PROJECT_KINDS } from './model';
import type { DocumentModel, Project, ProjectKind } from './model';
import { episodeLabel } from './demo';
import { Welcome, welcomeSeen } from './Welcome';
import { PlansDialog, PRO_PRICE } from './workspace/plans';
import { accountApi } from './workspace/account-api';
import type { SeriesScaffoldOptions } from './workspace/project';
import type { TeamAccount } from './workspace/team-contract';

/** The plans dialog with the visitor's account when they are signed in. */
function PlansLoader({ onClose }: { onClose: () => void }) {
  const [account, setAccount] = useState<TeamAccount | null>();
  useEffect(() => { void accountApi.session().then(setAccount, () => setAccount(null)); }, []);
  return account === undefined ? null : <PlansDialog account={account ?? undefined} onClose={onClose} />;
}

export const PROJECT_LABELS: Record<ProjectKind, string> = {
  film: 'Film', series: 'Television', stage: 'Stage', documentary: 'Documentary', commercial: 'Commercial / AV', creator: 'Social & YouTube'
};

const TEMPLATES: Record<ProjectKind, string> = {
  film: 'A page-accurate screenplay for a feature or short.',
  series: 'Episodes, outline, screenplay and a connected story bible.',
  stage: 'A stage manuscript with acts, cues and dialogue.',
  documentary: 'An episode plan with segments, sources and production outputs.',
  commercial: 'Timed video and audio for a spot or branded brief.',
  creator: 'Shorts, Reels, TikTok and YouTube videos: hooks, beats, chapters and a publishing pack.'
};

const KIND_ICONS: Record<ProjectKind, typeof FileText> = {
  film: Clapperboard, series: Tv, stage: Theater, documentary: Mic, commercial: FileText, creator: Video
};

type LibraryTab = 'recent' | 'all' | 'templates' | 'archive';

interface HomeProps {
  projects: Project[];
  recent?: { project: Project; document: DocumentModel };
  open: (project: Project) => void;
  resume: (project: Project, document: DocumentModel) => void;
  create: (title: string, kind: ProjectKind, synopsis: string, seriesPlan?: SeriesScaffoldOptions) => void;
  importScript: () => void;
  uploadSeries?: () => void;
  loadDemo: () => void;
  restoreArchived: (id: string) => void;
  openTeam: () => void;
  openPalette?: () => void;
}

function projectDetail(project: Project): string {
  if (project.episodes.length) {
    const seasons = new Set(project.episodes.map(episode => episode.season)).size;
    return `${seasons} season${seasons === 1 ? '' : 's'} · ${project.episodes.length} episode${project.episodes.length === 1 ? '' : 's'}`;
  }
  const folderCount = project.folders?.length ?? 0;
  return `${project.documents.length} document${project.documents.length === 1 ? '' : 's'}${folderCount ? ` · ${folderCount} folder${folderCount === 1 ? '' : 's'}` : ''}`;
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
  const lines = document.kind === 'av' ? document.avRows.slice(0, 3).map(row => row.video) : document.blocks.filter(block => block.text).slice(0, 7);
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

function NewProjectDialog({ initialKind, onClose, create }: { initialKind: ProjectKind; onClose: () => void; create: HomeProps['create'] }) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<ProjectKind>(initialKind);
  const [synopsis, setSynopsis] = useState('');
  const [seasons, setSeasons] = useState(1);
  const [episodesPerSeason, setEpisodesPerSeason] = useState(1);
  const [folderPerSeason, setFolderPerSeason] = useState(false);
  const episodicKind = kind === 'series' || kind === 'documentary';

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    create(
      title.trim(),
      kind,
      synopsis.trim(),
      episodicKind ? { seasons, episodesPerSeason, folderPerSeason } : undefined
    );
    onClose();
  }
  return <Dialog isOpen onOpenChange={open => { if (!open) onClose(); }} width={500} maxHeight="88dvh" purpose="form">
    <form onSubmit={submit} className="home-dialog-form">
      <Layout
        header={<DialogHeader title="New project" subtitle="Choose a format. You can add seasons, episodes and folders at any time." onOpenChange={open => { if (!open) onClose(); }} />}
        content={<LayoutContent>
          <div className="shell-form-stack">
            <TextInput label="Title" value={title} onChange={setTitle} placeholder="Project title" isRequired />
            <Selector label="Format" value={kind} onChange={value => setKind(value as ProjectKind)}
              options={PROJECT_KINDS.map(item => ({ value: item, label: PROJECT_LABELS[item], description: TEMPLATES[item] }))} />
            {episodicKind && <>
              <HStack gap={3} wrap="wrap">
                <NumberInput label="Seasons" value={seasons} min={1} max={10} onChange={value => setSeasons(Math.max(1, Number(value) || 1))} />
                <NumberInput label="Episodes per season" value={episodesPerSeason} min={1} max={24} onChange={value => setEpisodesPerSeason(Math.max(1, Number(value) || 1))} />
              </HStack>
              <HStack gap={1} align="center" wrap="wrap">
                <Text type="supporting" color="secondary" size="xsm">Quick season size:</Text>
                {[1, 6, 8, 10, 12].map(preset => (
                  <Button
                    key={preset}
                    size="sm"
                    variant={episodesPerSeason === preset ? 'secondary' : 'ghost'}
                    label={preset === 1 ? '1 ep' : `${preset} eps`}
                    onClick={() => setEpisodesPerSeason(preset)}
                  />
                ))}
              </HStack>
              <CheckboxInput
                label="Create a folder for each season"
                description={`Keeps ${seasons > 1 ? `Season 1–${seasons}` : 'Season 1'} scripts grouped cleanly in your project binder.`}
                value={folderPerSeason}
                onChange={setFolderPerSeason}
              />
            </>}
            <TextArea label="Synopsis" value={synopsis} onChange={setSynopsis} isOptional />
          </div>
        </LayoutContent>}
        footer={<LayoutFooter>
          <div className="shell-dialog-actions">
            <Button label="Cancel" variant="secondary" onClick={onClose} />
            <Button label="Create project" variant="primary" type="submit" isDisabled={!title.trim()} />
          </div>
        </LayoutFooter>}
      />
    </form>
  </Dialog>;
}

export function Home({ projects, recent, open, resume, create, importScript, uploadSeries, loadDemo, restoreArchived, openTeam, openPalette }: HomeProps) {
  const [tab, setTab] = useState<LibraryTab>('recent');
  const [query, setQuery] = useState('');
  const [newKind, setNewKind] = useState<ProjectKind>();
  const [tour, setTour] = useState(() => !welcomeSeen());
  const [plans, setPlans] = useState(false);
  const live = projects.filter(project => !project.archivedAt);
  const archived = projects.filter(project => project.archivedAt);
  const sorted = live.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const visible = (tab === 'archive' ? archived : tab === 'recent' ? sorted.slice(0, 6) : sorted)
    .filter(project => `${project.title} ${project.synopsis} ${PROJECT_LABELS[project.kind]}`.toLowerCase().includes(query.trim().toLowerCase()));
  const recentEpisode = recent && recent.project.episodes.find(episode => episode.id === recent.document.episodeId);

  return <div className="swdr-page home-page" id="main-content">
    <header className="page-heading home-heading">
      <div className="page-heading-text">
        <Text type="supporting" className="page-eyebrow">Writing workspace</Text>
        <Heading level={1}>Projects</Heading>
        <Text type="supporting" as="p">Open a draft, pick up an episode or start something new.</Text>
      </div>
      <div className="page-actions">
        <Button label="Import script" icon={<ArrowDownToLine size={16} aria-hidden="true" />} onClick={importScript} />
        {uploadSeries && <Button label="Upload series" icon={<Layers size={16} aria-hidden="true" />} onClick={uploadSeries} />}
        <Button label="New project" variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setNewKind('film')} />
      </div>
    </header>
    {tour && <Welcome onDone={() => setTour(false)} onPlans={() => setPlans(true)} />}
    {plans && <PlansLoader onClose={() => setPlans(false)} />}
    {newKind && <NewProjectDialog initialKind={newKind} onClose={() => setNewKind(undefined)} create={create} />}

    {recent && <section className="continue-panel" aria-labelledby="continue-title">
      <div className="continue-main">
        <Text type="label" className="continue-label">Continue writing</Text>
        <h2 id="continue-title">{recent.project.title}</h2>
        <p className="continue-subtitle">{episodeLabel(recentEpisode) || recent.document.title}
          <span aria-hidden="true"> · </span>{PROJECT_LABELS[recent.project.kind]}<span aria-hidden="true"> · </span>{formatEdited(recent.project.updatedAt)}</p>
        <div className="page-actions">
          <Button variant="primary" label={`Resume ${recent.document.kind === 'av' ? 'AV script' : recent.document.kind}`} onClick={() => resume(recent.project, recent.document)} />
          <Button label="Open project" onClick={() => open(recent.project)} endContent={<ArrowRight size={15} aria-hidden="true" />} />
        </div>
        {openPalette && <button type="button" className="continue-hint" onClick={openPalette}>
          <Search size={14} aria-hidden="true" /> Jump anywhere with <Kbd keys="mod+k" />
        </button>}
      </div>
      <ManuscriptPreview document={recent.document} />
    </section>}

    <section className="library" aria-labelledby="library-heading">
      <div className="section-heading">
        <h2 id="library-heading">Project library</h2>
        <SegmentedControl label="Filter project library" value={tab} onChange={value => { setTab(value as LibraryTab); setQuery(''); }} size="sm">
          <SegmentedControlItem value="recent" label="Recent" />
          <SegmentedControlItem value="all" label="All projects" />
          <SegmentedControlItem value="templates" label="Templates" />
          {archived.length > 0 && <SegmentedControlItem value="archive" label="Archive" />}
        </SegmentedControl>
      </div>
      {tab === 'all' && live.length > 0 && <div className="library-search">
        <TextInput label="Search projects" isLabelHidden value={query} onChange={setQuery} placeholder="Search projects" type="search" />
      </div>}
      {tab === 'templates' ? <div className="workspace-grid">
        {PROJECT_KINDS.map(kind => {
          const Icon = KIND_ICONS[kind];
          return <button type="button" className="workspace-card" key={kind} onClick={() => setNewKind(kind)}>
            <Icon size={20} aria-hidden="true" /><strong>{PROJECT_LABELS[kind]}</strong><span>{TEMPLATES[kind]}</span>
          </button>;
        })}
      </div> : visible.length ? <div className="table-frame">
        <Table density="balanced" hasHover verticalAlign="middle">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Project</TableHeaderCell>
              <TableHeaderCell>Format</TableHeaderCell>
              <TableHeaderCell>Last edited</TableHeaderCell>
              <TableHeaderCell><span className="sr-only">Actions</span></TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map(project => {
              const Icon = KIND_ICONS[project.kind];
              return <TableRow key={project.id} className="project-row">
                <TableCell>
                  <span className="project-cell">
                    <span className={`project-icon project-icon-${project.kind}`} aria-hidden="true"><Icon size={18} /></span>
                    <span className="project-name"><strong>{project.title}</strong><small>{project.synopsis || projectDetail(project)}</small></span>
                  </span>
                </TableCell>
                <TableCell><span className="row-meta">{PROJECT_LABELS[project.kind]}<small>{projectDetail(project)}</small></span></TableCell>
                <TableCell><span className="row-meta">{formatEdited(project.updatedAt)}</span></TableCell>
                <TableCell>
                  <span className="row-actions">
                    {project.archivedAt ? <Button size="sm" label="Restore project" onClick={() => restoreArchived(project.id)} />
                      : <Button size="sm" label={`Open project ${project.title}`} onClick={() => open(project)}>Open</Button>}
                  </span>
                </TableCell>
              </TableRow>;
            })}
          </TableBody>
        </Table>
      </div> : <div className="empty-frame">
        <EmptyState icon={<FolderOpen size={28} aria-hidden="true" />} title={query ? 'No matching projects' : 'Your workspace is ready'}
          description={query ? 'Try another title or format.' : 'Create a project, import a script or explore four demo projects.'}
          actions={!query && <Button label="Load demo projects" icon={<Sparkles size={15} aria-hidden="true" />} onClick={loadDemo} />} />
      </div>}
    </section>
    <footer className="home-footer">
      <span><ShieldCheck size={16} aria-hidden="true" /> Projects are saved on this device. <BookOpen size={15} aria-hidden="true" /> Press <Kbd keys="?" /> for shortcuts.</span>
      <span className="home-footer-links">
        {!tour && <Button variant="ghost" label="Take the tour" onClick={() => setTour(true)} />}
        <Button variant="ghost" label={`Plans · Pro ${PRO_PRICE} for life`} onClick={() => setPlans(true)} />
        <Button variant="ghost" label="Private team workspace" onClick={openTeam} endContent={<ArrowUpRight size={15} aria-hidden="true" />} />
      </span>
    </footer>
  </div>;
}
