import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Heading } from '@astryxdesign/core/Heading';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Selector } from '@astryxdesign/core/Selector';
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Archive, BookOpen, Clapperboard, FileText, LayoutGrid, Mic, Plus, Rows3, Upload } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { DocumentKind, DocumentModel, Project } from './model';
import { newDocument, newId, sceneList } from './model';
import { PROJECT_LABELS } from './Home';
import { episodeLabel } from './demo';
import { getProductionPlan } from './production/model';
import { sectionsFor } from './shell/routes';

export type ProjectDestination = 'write' | 'outline' | 'av' | 'story' | 'editorial' | 'production' | 'import';

interface Props {
  project: Project;
  /** The document the shell has open (the current episode). */
  current?: DocumentModel;
  open: (destination: ProjectDestination, document?: DocumentModel) => void;
  update: (update: (project: Project) => Project) => void;
  archive: () => void;
}

const FORMAT_LABELS: Record<DocumentKind, string> = { screenplay: 'Screenplay', stageplay: 'Stageplay', av: 'AV script' };

function NewDocumentDialog({ project, form, close, submit }: {
  project: Project;
  form: 'episode' | 'document';
  close: () => void;
  submit: (title: string, kind: DocumentKind, season: number) => void;
}) {
  const [title, setTitle] = useState('');
  const [season, setSeason] = useState(Math.max(1, ...project.episodes.map(episode => episode.season)));
  const [kind, setKind] = useState<DocumentKind>(project.kind === 'commercial' ? 'av' : project.kind === 'stage' ? 'stageplay' : 'screenplay');
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (title.trim()) submit(title.trim(), kind, Math.max(1, season));
  }
  const dismiss = (open: boolean) => { if (!open) close(); };
  return <Dialog isOpen onOpenChange={dismiss} width={460} purpose="form">
    <form onSubmit={onSubmit}>
      <Layout
        header={<DialogHeader title={form === 'episode' ? 'New episode' : 'New document'} onOpenChange={dismiss}
          subtitle={form === 'episode' ? 'The episode is numbered after the last one in its season.' : `Adds a document to ${project.title}.`} />}
        content={<LayoutContent><div className="shell-form-stack">
          <TextInput label={form === 'episode' ? 'Episode title' : 'Document title'} value={title} onChange={setTitle} isRequired />
          {form === 'episode' && <NumberInput label="Season number" value={season} min={1} onChange={value => setSeason(Number(value) || 1)} />}
          <Selector label="Format" value={kind} onChange={value => setKind(value as DocumentKind)}
            options={(['screenplay', 'stageplay', 'av'] as const).map(value => ({ value, label: FORMAT_LABELS[value] }))} />
        </div></LayoutContent>}
        footer={<LayoutFooter><div className="shell-dialog-actions">
          <Button label="Cancel" onClick={close} />
          <Button label="Create" variant="primary" type="submit" isDisabled={!title.trim()} />
        </div></LayoutFooter>}
      />
    </form>
  </Dialog>;
}

export function ProjectView({ project, current, open, update, archive }: Props) {
  const [form, setForm] = useState<'episode' | 'document'>();
  const [search, setSearch] = useState('');
  const seasons = [...new Set(project.episodes.map(episode => episode.season))].sort((a, b) => a - b);
  const currentEpisode = project.episodes.find(episode => episode.id === current?.episodeId);
  const [season, setSeason] = useState('all');
  const sections = sectionsFor(project);
  const episodeOf = (document: DocumentModel) => project.episodes.find(item => item.id === document.episodeId);
  const filtered = project.documents.filter(document => document.title.toLowerCase().includes(search.trim().toLowerCase()))
    .filter(document => season === 'all' || !seasons.length || String(episodeOf(document)?.season) === season)
    .slice().sort((a, b) => {
      const ae = episodeOf(a);
      const be = episodeOf(b);
      return ae && be ? ae.season - be.season || ae.number - be.number : 0;
    });
  const plan = current && getProductionPlan(project, current.id);
  const scenes = current ? sceneList(current).length : 0;

  function submit(title: string, kind: DocumentKind, nextSeason: number) {
    const number = Math.max(0, ...project.episodes.filter(episode => episode.season === nextSeason).map(episode => episode.number)) + 1;
    const episode = form === 'episode' ? { id: newId(), season: nextSeason, number, title, synopsis: '' } : undefined;
    const document = newDocument(title, kind, episode?.id);
    update(state => ({ ...state, episodes: episode ? [...state.episodes, episode] : state.episodes, documents: [...state.documents, document] }));
    setForm(undefined);
    open(project.kind === 'documentary' && episode ? 'editorial' : kind === 'av' ? 'av' : 'write', document);
  }

  const cards: { id: ProjectDestination; label: string; text: string; icon: typeof FileText }[] = [
    { id: project.kind === 'commercial' ? 'av' : 'write', label: 'Write', text: 'Open the current manuscript.', icon: FileText },
    { id: 'outline', label: 'Outline', text: 'Build beats and jump to scenes.', icon: LayoutGrid },
    ...(sections.series ? [{ id: 'story' as const, label: 'Series Intelligence', text: 'Characters, canon and the event ledger.', icon: BookOpen }] : []),
    ...(sections.editorial ? [{ id: 'editorial' as const, label: 'Editorial', text: 'Segments, evidence and producer outputs.', icon: Mic }] : []),
    ...(sections.production ? [{ id: 'production' as const, label: 'Production', text: 'From released script to shooting schedule.', icon: Clapperboard }] : [])
  ];

  return <div className="swdr-page project-page" id="main-content">
    <header className="page-heading">
      <div className="page-heading-text">
        <Text type="supporting" className="page-eyebrow">{PROJECT_LABELS[project.kind]}{project.episodes.length ? ` · ${seasons.length} season${seasons.length === 1 ? '' : 's'} · ${project.episodes.length} episodes` : ''}</Text>
        <Heading level={1}>{project.title}</Heading>
        {project.synopsis && <Text type="supporting" as="p">{project.synopsis}</Text>}
      </div>
      <div className="page-actions">
        <Button label="Import draft" icon={<Upload size={16} aria-hidden="true" />} onClick={() => open('import')} />
        {(project.kind === 'series' || project.kind === 'documentary') && <Button label="New episode" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setForm('episode')} />}
        <Button label="New document" variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setForm('document')} />
      </div>
    </header>
    {form && <NewDocumentDialog project={project} form={form} close={() => setForm(undefined)} submit={submit} />}

    {current && <section className="current-strip" aria-label="Current document">
      <div className="current-strip-title">
        <Text type="label">{currentEpisode ? 'Current episode' : 'Current document'}</Text>
        <strong>{currentEpisode ? episodeLabel(currentEpisode) : current.title}</strong>
      </div>
      <dl className="current-strip-stats">
        <div><dt>Format</dt><dd>{FORMAT_LABELS[current.kind]}</dd></div>
        {current.kind !== 'av' ? <div><dt>Scenes</dt><dd>{scenes}</dd></div> : <div><dt>Cues</dt><dd>{current.avRows.length}</dd></div>}
        <div><dt>Beats</dt><dd>{current.beats.length}</dd></div>
        {sections.production && <div><dt>Production</dt><dd>{plan ? 'Scheduled' : 'Not released'}</dd></div>}
      </dl>
    </section>}

    <div className="workspace-grid project-workspaces" data-count={cards.length}>
      {cards.map(card => <button key={card.id} type="button" className="workspace-card" onClick={() => open(card.id)}>
        <card.icon size={20} aria-hidden="true" /><strong>{card.label}</strong><span>{card.text}</span>
      </button>)}
    </div>

    <div className="section-heading">
      <h2>{project.episodes.length ? 'Scripts and episodes' : 'Documents'}</h2>
      <div className="section-tools">
        {seasons.length > 1 && <SegmentedControl label="Show documents from" value={season} onChange={setSeason} size="sm">
          <SegmentedControlItem value="all" label="All" />
          {seasons.map(item => <SegmentedControlItem key={item} value={String(item)} label={`S${item}`} />)}
        </SegmentedControl>}
        {project.documents.length > 4 && <TextInput label="Filter documents" isLabelHidden size="sm" type="search" placeholder="Find a document" value={search} onChange={setSearch} />}
      </div>
    </div>
    <div className="table-frame">
      <Table density="compact" hasHover>
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Title</TableHeaderCell>
            <TableHeaderCell>{project.episodes.length ? 'Episode' : 'Format'}</TableHeaderCell>
            <TableHeaderCell>Content</TableHeaderCell>
            <TableHeaderCell><span className="sr-only">Actions</span></TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map(document => {
            const episode = episodeOf(document);
            const destination = project.kind === 'documentary' && episode ? 'editorial' : document.kind === 'av' ? 'av' : 'write';
            const scenes = sceneList(document).length;
            const count = document.kind === 'av' ? `${document.avRows.length} cue${document.avRows.length === 1 ? '' : 's'}` : `${scenes} scene${scenes === 1 ? '' : 's'} · ${document.beats.length} beat${document.beats.length === 1 ? '' : 's'}`;
            return <TableRow className={`document-row${document.id === current?.id ? ' is-current' : ''}`} key={document.id}>
              <TableCell>
                <span className="project-cell">
                  <span className="document-icon" aria-hidden="true">{document.kind === 'av' ? <Rows3 size={16} /> : <FileText size={16} />}</span>
                  <span className="project-name"><strong>{document.title}{document.id === current?.id && <span className="row-tag">Current</span>}</strong></span>
                </span>
              </TableCell>
              <TableCell><span className="row-meta">{episodeLabel(episode).split(' · ')[0] || FORMAT_LABELS[document.kind]}</span></TableCell>
              <TableCell><span className="row-meta">{count}</span></TableCell>
              <TableCell><span className="row-actions">
                {project.kind === 'documentary' && episode && <Button size="sm" variant="ghost" label="Script" onClick={() => open('write', document)} />}
                <Button size="sm" label={`Open ${document.title}`} onClick={() => open(destination, document)}>Open</Button>
              </span></TableCell>
            </TableRow>;
          })}
        </TableBody>
      </Table>
      {!filtered.length && <p className="empty-row">No matching documents.</p>}
    </div>
    <div className="project-footer">
      <Button variant="ghost" label="Archive project" icon={<Archive size={15} aria-hidden="true" />} onClick={archive} />
    </div>
  </div>;
}
