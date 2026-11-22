import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Selector } from '@astryxdesign/core/Selector';
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Token } from '@astryxdesign/core/Token';
import { VStack } from '@astryxdesign/core/VStack';
import {
  Archive, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Clapperboard, FileText,
  Folder, FolderOpen, FolderPlus, Images, Layers, LayoutGrid, Mic, Pencil, Plus,
  Presentation, Rows3, SlidersHorizontal, Trash2, Upload, Video
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { DocumentKind, DocumentModel, Project, ScriptFolder } from './model';
import { newDocument, newId, sceneList } from './model';
import { PROJECT_LABELS } from './Home';
import { episodeLabel } from './demo';
import { getProductionPlan } from './production/model';
import { sectionsFor, storyLabel } from './shell/routes';
import { PitchSheet } from './PitchSheet';
import { projectPulse } from './pulse';
import { ProjectPulse } from './ProjectPulse';
import { scriptDiscoveryPreview } from './story/series-analysis';
import { getStory } from './story/series-model';
import {
  addSeasonBatch, assignDocumentEpisode, createFolder, deleteFolder, moveDocumentToFolder,
  moveEpisode, moveFolder, orderedFolders, renameDocument, renameFolder, renumberSeason, reorderDocument
} from './workspace/organize';

export type ProjectDestination = 'write' | 'outline' | 'av' | 'story' | 'editorial' | 'production' | 'creator' | 'media' | 'import';

interface Props {
  project: Project;
  /** The document the shell has open (the current episode). */
  current?: DocumentModel;
  open: (destination: ProjectDestination, document?: DocumentModel, tab?: string) => void;
  update: (update: (project: Project) => Project) => void;
  archive: () => void;
}

const FORMAT_LABELS: Record<DocumentKind, string> = { screenplay: 'Screenplay', stageplay: 'Stageplay', av: 'AV script' };

function NewDocumentDialog({ project, form, defaultFolderId, close, submit }: {
  project: Project;
  form: 'episode' | 'document';
  defaultFolderId?: string;
  close: () => void;
  submit: (title: string, kind: DocumentKind, season: number, folderId?: string) => void;
}) {
  const folders = orderedFolders(project);
  const [title, setTitle] = useState('');
  const [season, setSeason] = useState(Math.max(1, ...project.episodes.map(episode => episode.season)));
  const [kind, setKind] = useState<DocumentKind>(project.kind === 'commercial' || project.kind === 'creator' ? 'av' : project.kind === 'stage' ? 'stageplay' : 'screenplay');
  const [folderId, setFolderId] = useState(defaultFolderId ?? '');
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (title.trim()) submit(title.trim(), kind, Math.max(1, season), folderId || undefined);
  }
  const dismiss = (open: boolean) => { if (!open) close(); };
  return <Dialog isOpen onOpenChange={dismiss} width={460} maxHeight="88dvh" purpose="form">
    <form onSubmit={onSubmit}>
      <Layout
        header={<DialogHeader title={form === 'episode' ? 'New episode' : 'New document'} onOpenChange={dismiss}
          subtitle={form === 'episode' ? 'The episode is numbered after the last one in its season.' : `Adds a document to ${project.title}.`} />}
        content={<LayoutContent><div className="shell-form-stack">
          <TextInput label={form === 'episode' ? 'Episode title' : 'Document title'} value={title} onChange={setTitle} isRequired />
          {form === 'episode' && <NumberInput label="Season number" value={season} min={1} onChange={value => setSeason(Number(value) || 1)} />}
          <Selector label="Format" value={kind} onChange={value => setKind(value as DocumentKind)}
            options={(['screenplay', 'stageplay', 'av'] as const).map(value => ({ value, label: FORMAT_LABELS[value] }))} />
          {folders.length > 0 && (
            <Selector label="Folder" value={folderId} onChange={setFolderId}
              options={[{ value: '', label: 'Unfiled' }, ...folders.map(item => ({ value: item.id, label: item.name }))]} />
          )}
        </div></LayoutContent>}
        footer={<LayoutFooter><div className="shell-dialog-actions">
          <Button label="Cancel" onClick={close} />
          <Button label="Create" variant="primary" type="submit" isDisabled={!title.trim()} />
        </div></LayoutFooter>}
      />
    </form>
  </Dialog>;
}

function BuildSeasonDialog({ project, close, onCreate }: {
  project: Project;
  close: () => void;
  onCreate: (options: { season: number; count: number; kind: DocumentKind; titles: string[]; folderChoice: string }) => void;
}) {
  const existingSeasons = [...new Set(project.episodes.map(ep => ep.season))].sort((a, b) => a - b);
  const highestSeason = existingSeasons.at(-1) ?? 1;
  const highestCount = project.episodes.filter(ep => ep.season === highestSeason).length;
  const suggestedSeason = highestCount >= 4 ? highestSeason + 1 : highestSeason;

  const [season, setSeason] = useState(suggestedSeason);
  const [count, setCount] = useState(8);
  const [kind, setKind] = useState<DocumentKind>(project.kind === 'commercial' || project.kind === 'creator' ? 'av' : 'screenplay');
  const [titlesText, setTitlesText] = useState('');
  const [folderChoice, setFolderChoice] = useState('__new_season__');
  const folders = orderedFolders(project);

  const parsedTitles = titlesText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const effectiveCount = parsedTitles.length > 0 ? Math.max(count, parsedTitles.length) : count;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate({ season: Math.max(1, season), count: effectiveCount, kind, titles: parsedTitles, folderChoice });
    close();
  }

  const dismiss = (open: boolean) => { if (!open) close(); };
  return <Dialog isOpen onOpenChange={dismiss} width={520} maxHeight="88dvh" purpose="form">
    <form onSubmit={onSubmit}>
      <Layout
        header={<DialogHeader
          title="Build season episodes"
          subtitle={`Add a numbered run of episodes to ${project.title} and keep them organised from the start.`}
          onOpenChange={dismiss}
        />}
        content={<LayoutContent><div className="shell-form-stack">
          <HStack gap={3} wrap="wrap">
            <NumberInput label="Season number" value={season} min={1} max={30} onChange={value => setSeason(Math.max(1, Number(value) || 1))} />
            <NumberInput label="Number of episodes" value={count} min={1} max={30} onChange={value => setCount(Math.max(1, Math.min(30, Number(value) || 1)))} />
          </HStack>
          <HStack gap={1} align="center" wrap="wrap">
            <Text type="supporting" color="secondary" size="xsm">Quick count:</Text>
            {[4, 6, 8, 10, 12].map(preset => (
              <Button key={preset} size="sm" variant={count === preset ? 'secondary' : 'ghost'} label={`${preset} eps`} onClick={() => setCount(preset)} />
            ))}
          </HStack>
          <Selector
            label="Script format"
            value={kind}
            onChange={value => setKind(value as DocumentKind)}
            options={(['screenplay', 'stageplay', 'av'] as const).map(value => ({ value, label: FORMAT_LABELS[value] }))}
          />
          <Selector
            label="Folder"
            value={folderChoice}
            onChange={setFolderChoice}
            options={[
              { value: '__new_season__', label: `Place in folder “Season ${season}”` },
              { value: '', label: 'No folder (unfiled)' },
              ...folders.map(item => ({ value: item.id, label: `Existing folder · ${item.name}` }))
            ]}
          />
          <TextArea
            label="Episode titles (optional, one per line)"
            value={titlesText}
            onChange={setTitlesText}
            rows={4}
            placeholder={'Pilot\nThe Crossing\nDead Water'}
          />
        </div></LayoutContent>}
        footer={<LayoutFooter><div className="shell-dialog-actions">
          <Button label="Cancel" onClick={close} />
          <Button label={`Create ${effectiveCount} episode${effectiveCount === 1 ? '' : 's'}`} variant="primary" type="submit" />
        </div></LayoutFooter>}
      />
    </form>
  </Dialog>;
}

function FolderDialog({ folder, close, save }: {
  folder?: ScriptFolder;
  close: () => void;
  save: (name: string) => void;
}) {
  const [name, setName] = useState(folder?.name ?? '');
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    save(name.trim());
    close();
  }
  const dismiss = (open: boolean) => { if (!open) close(); };
  return <Dialog isOpen onOpenChange={dismiss} width={420} purpose="form">
    <form onSubmit={onSubmit}>
      <Layout
        header={<DialogHeader
          title={folder ? 'Rename folder' : 'New folder'}
          subtitle={folder ? 'Rename this script folder without changing its scripts.' : 'Group drafts, seasons, treatments or alternates in order.'}
          onOpenChange={dismiss}
        />}
        content={<LayoutContent><div className="shell-form-stack">
          <TextInput label="Folder name" value={name} onChange={setName} placeholder="e.g. Season 1, Alternate Drafts, Treatments" isRequired />
        </div></LayoutContent>}
        footer={<LayoutFooter><div className="shell-dialog-actions">
          <Button label="Cancel" onClick={close} />
          <Button label={folder ? 'Save name' : 'Create folder'} variant="primary" type="submit" isDisabled={!name.trim()} />
        </div></LayoutFooter>}
      />
    </form>
  </Dialog>;
}

function OrganiseDocumentDialog({ project, document, close, onSave }: {
  project: Project;
  document: DocumentModel;
  close: () => void;
  onSave: (update: {
    title: string;
    folderId?: string;
    newFolderName?: string;
    asEpisode: boolean;
    season: number;
    number: number;
    synopsis: string;
  }) => void;
}) {
  const folders = orderedFolders(project);
  const episode = project.episodes.find(item => item.id === document.episodeId);
  const episodicCapable = project.kind === 'series' || project.kind === 'documentary' || Boolean(episode);
  const [title, setTitle] = useState(document.title);
  const [folderId, setFolderId] = useState(document.folderId ?? '');
  const [newFolderName, setNewFolderName] = useState('');
  const [asEpisode, setAsEpisode] = useState(Boolean(episode));
  const defaultSeason = episode?.season ?? Math.max(1, ...project.episodes.map(item => item.season));
  const defaultNumber = episode?.number ?? (Math.max(0, ...project.episodes.filter(item => item.season === defaultSeason).map(item => item.number)) + 1);
  const [season, setSeason] = useState(defaultSeason);
  const [number, setNumber] = useState(defaultNumber);
  const [synopsis, setSynopsis] = useState(episode?.synopsis ?? '');

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      folderId: folderId === '__new__' ? undefined : (folderId || undefined),
      newFolderName: folderId === '__new__' ? newFolderName.trim() : undefined,
      asEpisode,
      season: Math.max(1, season),
      number: Math.max(1, number),
      synopsis: synopsis.trim()
    });
    close();
  }

  const dismiss = (open: boolean) => { if (!open) close(); };
  return <Dialog isOpen onOpenChange={dismiss} width={480} maxHeight="88dvh" purpose="form">
    <form onSubmit={onSubmit}>
      <Layout
        header={<DialogHeader title="Organise script" subtitle={`Update title, folder or episode placement for “${document.title}”.`} onOpenChange={dismiss} />}
        content={<LayoutContent><div className="shell-form-stack">
          <TextInput label="Script title" value={title} onChange={setTitle} isRequired />
          <Selector
            label="Folder"
            value={folderId}
            onChange={setFolderId}
            options={[
              { value: '', label: 'Unfiled' },
              ...folders.map(item => ({ value: item.id, label: item.name })),
              { value: '__new__', label: '+ Create new folder…' }
            ]}
          />
          {folderId === '__new__' && (
            <TextInput label="New folder name" value={newFolderName} onChange={setNewFolderName} placeholder="e.g. Season 1" isRequired />
          )}
          {episodicCapable && <>
            <CheckboxInput
              label="Track as a numbered episode"
              description="Appears in the episode switcher, Season filters and Series Intelligence timeline."
              value={asEpisode}
              onChange={setAsEpisode}
            />
            {asEpisode && <>
              <HStack gap={3} wrap="wrap">
                <NumberInput label="Season" value={season} min={1} max={30} onChange={value => setSeason(Math.max(1, Number(value) || 1))} />
                <NumberInput label="Episode #" value={number} min={1} max={200} onChange={value => setNumber(Math.max(1, Number(value) || 1))} />
              </HStack>
              <TextArea label="Episode synopsis" value={synopsis} onChange={setSynopsis} rows={2} isOptional />
            </>}
          </>}
        </div></LayoutContent>}
        footer={<LayoutFooter><div className="shell-dialog-actions">
          <Button label="Cancel" onClick={close} />
          <Button
            label="Save changes"
            variant="primary"
            type="submit"
            isDisabled={!title.trim() || (folderId === '__new__' && !newFolderName.trim())}
          />
        </div></LayoutFooter>}
      />
    </form>
  </Dialog>;
}

export function ProjectView({ project, current, open, update, archive }: Props) {
  const [form, setForm] = useState<'episode' | 'document'>();
  const [buildSeasonOpen, setBuildSeasonOpen] = useState(false);
  const [folderDialog, setFolderDialog] = useState<{ mode: 'create' } | { mode: 'rename'; folder: ScriptFolder }>();
  const [organiseDoc, setOrganiseDoc] = useState<DocumentModel>();
  const [pitch, setPitch] = useState(false);
  const pulse = useMemo(() => projectPulse(project, current), [project, current]);
  const [search, setSearch] = useState('');
  const seasons = [...new Set(project.episodes.map(episode => episode.season))].sort((a, b) => a - b);
  const currentEpisode = project.episodes.find(episode => episode.id === current?.episodeId);
  const [season, setSeason] = useState('all');
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const sections = sectionsFor(project);
  const folders = useMemo(() => orderedFolders(project), [project]);
  const folderById = useMemo(() => new Map(folders.map(item => [item.id, item])), [folders]);
  const activeFolder = selectedFolder !== 'all' && selectedFolder !== 'unfiled'
    ? folderById.get(selectedFolder)
    : undefined;
  const effectiveFolderFilter = selectedFolder === 'all' || selectedFolder === 'unfiled' || activeFolder ? selectedFolder : 'all';

  const episodeOf = (document: DocumentModel) => project.episodes.find(item => item.id === document.episodeId);
  const indexOfDoc = new Map(project.documents.map((doc, idx) => [doc.id, idx]));

  const filtered = project.documents
    .filter(document => document.title.toLowerCase().includes(search.trim().toLowerCase()))
    .filter(document => season === 'all' || !seasons.length || String(episodeOf(document)?.season) === season)
    .filter(document => {
      if (effectiveFolderFilter === 'all') return true;
      if (effectiveFolderFilter === 'unfiled') return !document.folderId || !folderById.has(document.folderId);
      return document.folderId === effectiveFolderFilter;
    })
    .slice()
    .sort((a, b) => {
      const ae = episodeOf(a);
      const be = episodeOf(b);
      if (ae && be) return ae.season - be.season || ae.number - be.number || (indexOfDoc.get(a.id) ?? 0) - (indexOfDoc.get(b.id) ?? 0);
      if (ae && !be) return -1;
      if (!ae && be) return 1;
      return (indexOfDoc.get(a.id) ?? 0) - (indexOfDoc.get(b.id) ?? 0);
    });

  const plan = current && getProductionPlan(project, current.id);
  const scenes = current ? sceneList(current).length : 0;
  const isEpisodicKind = project.kind === 'series' || project.kind === 'documentary';
  const unfiledCount = project.documents.filter(doc => !doc.folderId || !folderById.has(doc.folderId)).length;
  const selectedSeasonNumber = season !== 'all' ? Number(season) : undefined;
  const needsRenumber = useMemo(() => {
    const checkSeason = selectedSeasonNumber ?? (seasons.length === 1 ? seasons[0] : undefined);
    if (!checkSeason) return undefined;
    const list = project.episodes
      .filter(ep => ep.season === checkSeason)
      .sort((a, b) => a.number - b.number || a.id.localeCompare(b.id));
    if (list.length < 2) return undefined;
    return list.some((ep, idx) => ep.number !== idx + 1) ? checkSeason : undefined;
  }, [project.episodes, seasons, selectedSeasonNumber]);

  function submit(title: string, kind: DocumentKind, nextSeason: number, folderId?: string) {
    const number = Math.max(0, ...project.episodes.filter(episode => episode.season === nextSeason).map(episode => episode.number)) + 1;
    const episode = form === 'episode' ? { id: newId(), season: nextSeason, number, title, synopsis: '' } : undefined;
    const document: DocumentModel = { ...newDocument(title, kind, episode?.id), ...(folderId ? { folderId } : {}) };
    update(state => ({ ...state, episodes: episode ? [...state.episodes, episode] : state.episodes, documents: [...state.documents, document] }));
    setForm(undefined);
    open(project.kind === 'documentary' && episode ? 'editorial' : kind === 'av' ? 'av' : 'write', document);
  }

  function createSeasonBatch(options: { season: number; count: number; kind: DocumentKind; titles: string[]; folderChoice: string }) {
    update(state => {
      let working = state;
      let folderId: string | undefined;
      if (options.folderChoice === '__new_season__') {
        const label = `Season ${options.season}`;
        const existing = orderedFolders(working).find(item => item.name.toLowerCase() === label.toLowerCase());
        if (existing) {
          folderId = existing.id;
        } else {
          const created = createFolder(working, label);
          working = created.project;
          folderId = created.folder.id;
        }
      } else if (options.folderChoice) {
        folderId = options.folderChoice;
      }
      return addSeasonBatch(working, {
        season: options.season,
        count: options.count,
        kind: options.kind,
        titles: options.titles,
        folderId
      }).project;
    });
    setSeason(String(options.season));
  }

  function moveRow(doc: DocumentModel, direction: -1 | 1) {
    const ep = episodeOf(doc);
    if (ep) {
      update(state => moveEpisode(state, ep.id, direction));
    } else {
      const nonEpisodeIds = filtered.filter(item => !episodeOf(item)).map(item => item.id);
      update(state => reorderDocument(state, doc.id, direction, nonEpisodeIds));
    }
  }

  function canMoveRow(doc: DocumentModel, direction: -1 | 1): boolean {
    if (search.trim()) return false;
    const ep = episodeOf(doc);
    if (ep) {
      const peers = filtered.filter(item => episodeOf(item)?.season === ep.season);
      const pos = peers.findIndex(item => item.id === doc.id);
      return pos >= 0 && pos + direction >= 0 && pos + direction < peers.length;
    }
    const peers = filtered.filter(item => !episodeOf(item));
    const pos = peers.findIndex(item => item.id === doc.id);
    return pos >= 0 && pos + direction >= 0 && pos + direction < peers.length;
  }

  const storyStore = sections.story ? getStory(project) : undefined;
  const activeStory = storyStore ? (storyStore.canon.at(-1)?.data ?? storyStore.draft) : undefined;
  const storyDiscovery = useMemo(
    () => (sections.story && activeStory && !activeStory.characters.length && !activeStory.points.length
      ? scriptDiscoveryPreview(project, current?.id)
      : undefined),
    [sections.story, activeStory, project, current?.id]
  );
  const storySummary = activeStory && (activeStory.characters.length || activeStory.points.length)
    ? `${activeStory.characters.length} character${activeStory.characters.length === 1 ? '' : 's'} · ${activeStory.points.length} canon record${activeStory.points.length === 1 ? '' : 's'}.`
    : storyDiscovery && storyDiscovery.speakingRoles > 0
      ? `Scan ${storyDiscovery.scenes} scene${storyDiscovery.scenes === 1 ? '' : 's'} to map ${storyDiscovery.speakingRoles} speaking role${storyDiscovery.speakingRoles === 1 ? '' : 's'}, arcs and relationships.`
      : 'Characters, relationships, arcs and canon.';

  const cards: { id: ProjectDestination; label: string; text: string; icon: typeof FileText }[] = [
    ...(sections.creator ? [{ id: 'creator' as const, label: 'Creator studio', text: 'Board, previews, packaging and publishing.', icon: Video }] : []),
    { id: project.kind === 'commercial' || project.kind === 'creator' ? 'av' : 'write', label: 'Write', text: 'Open the current manuscript.', icon: FileText },
    { id: 'outline', label: 'Outline', text: 'Build beats and jump to scenes.', icon: LayoutGrid },
    ...(sections.story ? [{ id: 'story' as const, label: storyLabel(project), text: storySummary, icon: BookOpen }] : []),
    ...(sections.editorial ? [{ id: 'editorial' as const, label: 'Editorial', text: 'Segments, evidence and producer outputs.', icon: Mic }] : []),
    ...(sections.production ? [{ id: 'production' as const, label: 'Production', text: 'From released script to shooting schedule.', icon: Clapperboard }] : []),
    { id: 'media', label: 'Files & media', text: 'Photos, storyboards, imports and references.', icon: Images }
  ];

  return <div className="swdr-page project-page" id="main-content">
    <header className="page-heading">
      <div className="page-heading-text">
        <Text type="supporting" className="page-eyebrow">{PROJECT_LABELS[project.kind]}{project.episodes.length ? ` · ${seasons.length} season${seasons.length === 1 ? '' : 's'} · ${project.episodes.length} episodes` : ''}{folders.length ? ` · ${folders.length} folder${folders.length === 1 ? '' : 's'}` : ''}</Text>
        <Heading level={1}>{project.title}</Heading>
        {project.synopsis && <Text type="supporting" as="p">{project.synopsis}</Text>}
      </div>
      <div className="page-actions">
        <Button label="Pitch one-sheet" icon={<Presentation size={16} aria-hidden="true" />} onClick={() => setPitch(true)} />
        <Button label="Import draft" icon={<Upload size={16} aria-hidden="true" />} onClick={() => open('import')} />
        {isEpisodicKind && <Button label="Upload episodes" icon={<Layers size={16} aria-hidden="true" />} onClick={() => open('import', current, 'series')} />}
        {isEpisodicKind && <Button label="Build season" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setBuildSeasonOpen(true)} />}
        {isEpisodicKind && <Button label="New episode" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setForm('episode')} />}
        <Button label="New document" variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setForm('document')} />
      </div>
    </header>
    {form && <NewDocumentDialog project={project} form={form} defaultFolderId={activeFolder?.id} close={() => setForm(undefined)} submit={submit} />}
    {buildSeasonOpen && <BuildSeasonDialog project={project} close={() => setBuildSeasonOpen(false)} onCreate={createSeasonBatch} />}
    {folderDialog && (
      <FolderDialog
        folder={folderDialog.mode === 'rename' ? folderDialog.folder : undefined}
        close={() => setFolderDialog(undefined)}
        save={name => {
          if (folderDialog.mode === 'create') {
            update(state => createFolder(state, name).project);
          } else {
            update(state => renameFolder(state, folderDialog.folder.id, name));
          }
        }}
      />
    )}
    {organiseDoc && (
      <OrganiseDocumentDialog
        project={project}
        document={organiseDoc}
        close={() => setOrganiseDoc(undefined)}
        onSave={changes => {
          update(state => {
            let next = renameDocument(state, organiseDoc.id, changes.title);
            let targetFolderId = changes.folderId;
            if (changes.newFolderName) {
              const created = createFolder(next, changes.newFolderName);
              next = created.project;
              targetFolderId = created.folder.id;
            }
            next = moveDocumentToFolder(next, organiseDoc.id, targetFolderId);
            if (isEpisodicKind || organiseDoc.episodeId) {
              next = assignDocumentEpisode(
                next,
                organiseDoc.id,
                changes.asEpisode
                  ? { season: changes.season, number: changes.number, title: changes.title, synopsis: changes.synopsis }
                  : null
              );
            }
            return next;
          });
        }}
      />
    )}
    {pitch && <PitchSheet project={project} document={current} update={update} onClose={() => setPitch(false)} />}

    <ProjectPulse tiles={pulse.tiles} steps={pulse.steps} onOpen={target => open(target === 'write' && current?.kind === 'av' ? 'av' : target)} />

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
        {needsRenumber !== undefined && (
          <Button
            size="sm"
            variant="ghost"
            label={`Renumber S${needsRenumber}`}
            tooltip={`Compact Season ${needsRenumber} episodes to 1..N`}
            onClick={() => update(state => renumberSeason(state, needsRenumber))}
          />
        )}
        <Button size="sm" variant="secondary" label="New folder" icon={<FolderPlus size={15} aria-hidden="true" />} onClick={() => setFolderDialog({ mode: 'create' })} />
        {project.documents.length > 4 && <TextInput label="Filter documents" isLabelHidden size="sm" type="search" placeholder="Find a document" value={search} onChange={setSearch} />}
      </div>
    </div>

    {folders.length > 0 && (
      <VStack gap={2} style={{ marginBottom: 'var(--spacing-3)' }}>
        <HStack gap={1.5} align="center" wrap="wrap" role="region" aria-label="Script folders">
          <Button
            size="sm"
            variant={effectiveFolderFilter === 'all' ? 'secondary' : 'ghost'}
            label="All scripts"
            endContent={<Badge variant="neutral" label={String(project.documents.length)} />}
            onClick={() => setSelectedFolder('all')}
          />
          {folders.map(folder => {
            const count = project.documents.filter(doc => doc.folderId === folder.id).length;
            const isSelected = effectiveFolderFilter === folder.id;
            return (
              <Button
                key={folder.id}
                size="sm"
                variant={isSelected ? 'secondary' : 'ghost'}
                icon={isSelected ? <FolderOpen size={14} aria-hidden="true" /> : <Folder size={14} aria-hidden="true" />}
                label={folder.name}
                endContent={<Badge variant="neutral" label={String(count)} />}
                onClick={() => setSelectedFolder(folder.id)}
              />
            );
          })}
          {unfiledCount > 0 && (
            <Button
              size="sm"
              variant={effectiveFolderFilter === 'unfiled' ? 'secondary' : 'ghost'}
              label="Unfiled"
              endContent={<Badge variant="neutral" label={String(unfiledCount)} />}
              onClick={() => setSelectedFolder('unfiled')}
            />
          )}
        </HStack>

        {activeFolder && (
          <HStack gap={1.5} align="center" wrap="wrap">
            <Text type="supporting" color="secondary" size="xsm">Folder “{activeFolder.name}”:</Text>
            <IconButton
              size="sm"
              variant="ghost"
              label={`Move folder ${activeFolder.name} left`}
              tooltip="Move folder left"
              icon={<ArrowLeft size={14} />}
              isDisabled={folders.findIndex(item => item.id === activeFolder.id) === 0}
              onClick={() => update(state => moveFolder(state, activeFolder.id, -1))}
            />
            <IconButton
              size="sm"
              variant="ghost"
              label={`Move folder ${activeFolder.name} right`}
              tooltip="Move folder right"
              icon={<ArrowRight size={14} />}
              isDisabled={folders.findIndex(item => item.id === activeFolder.id) === folders.length - 1}
              onClick={() => update(state => moveFolder(state, activeFolder.id, 1))}
            />
            <Button
              size="sm"
              variant="ghost"
              label="Rename folder"
              icon={<Pencil size={13} aria-hidden="true" />}
              onClick={() => setFolderDialog({ mode: 'rename', folder: activeFolder })}
            />
            <Button
              size="sm"
              variant="ghost"
              label="Delete folder"
              tooltip="Delete folder (scripts stay in your project as unfiled)"
              icon={<Trash2 size={13} aria-hidden="true" />}
              onClick={() => {
                update(state => deleteFolder(state, activeFolder.id));
                setSelectedFolder('all');
              }}
            />
          </HStack>
        )}
      </VStack>
    )}

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
            const folder = document.folderId ? folderById.get(document.folderId) : undefined;
            const destination = project.kind === 'documentary' && episode ? 'editorial' : document.kind === 'av' ? 'av' : 'write';
            const docScenes = sceneList(document).length;
            const count = document.kind === 'av' ? `${document.avRows.length} cue${document.avRows.length === 1 ? '' : 's'}` : `${docScenes} scene${docScenes === 1 ? '' : 's'} · ${document.beats.length} beat${document.beats.length === 1 ? '' : 's'}`;
            const upAllowed = canMoveRow(document, -1);
            const downAllowed = canMoveRow(document, 1);
            return <TableRow className={`document-row${document.id === current?.id ? ' is-current' : ''}`} key={document.id}>
              <TableCell>
                <span className="project-cell">
                  <span className="document-icon" aria-hidden="true">{document.kind === 'av' ? <Rows3 size={16} /> : <FileText size={16} />}</span>
                  <span className="project-name">
                    <strong>
                      {document.title}
                      {document.id === current?.id && <span className="row-tag">Current</span>}
                    </strong>
                    {folder && effectiveFolderFilter === 'all' && (
                      <HStack as="span" gap={1} align="center" style={{ marginTop: '2px' }}>
                        <Token size="sm" color="gray" label={folder.name} />
                      </HStack>
                    )}
                  </span>
                </span>
              </TableCell>
              <TableCell><span className="row-meta">{episodeLabel(episode).split(' · ')[0] || FORMAT_LABELS[document.kind]}</span></TableCell>
              <TableCell><span className="row-meta">{count}</span></TableCell>
              <TableCell><span className="row-actions">
                <IconButton
                  size="sm"
                  variant="ghost"
                  label={`Move ${document.title} up`}
                  tooltip={episode ? 'Move episode earlier' : 'Move script up'}
                  icon={<ArrowUp size={14} />}
                  isDisabled={!upAllowed}
                  onClick={() => moveRow(document, -1)}
                />
                <IconButton
                  size="sm"
                  variant="ghost"
                  label={`Move ${document.title} down`}
                  tooltip={episode ? 'Move episode later' : 'Move script down'}
                  icon={<ArrowDown size={14} />}
                  isDisabled={!downAllowed}
                  onClick={() => moveRow(document, 1)}
                />
                <IconButton
                  size="sm"
                  variant="ghost"
                  label={`Organise ${document.title}`}
                  tooltip="Rename, move to folder or edit episode number"
                  icon={<SlidersHorizontal size={14} />}
                  onClick={() => setOrganiseDoc(document)}
                />
                {project.kind === 'documentary' && episode && <Button size="sm" variant="ghost" label="Script" onClick={() => open('write', document)} />}
                <Button size="sm" label={`Open ${document.title}`} onClick={() => open(destination, document)}>Open</Button>
              </span></TableCell>
            </TableRow>;
          })}
        </TableBody>
      </Table>
      {!filtered.length && <p className="empty-row">{activeFolder ? `No scripts in “${activeFolder.name}” yet.` : 'No matching documents.'}</p>}
    </div>
    <div className="project-footer">
      <Button variant="ghost" label="Archive project" icon={<Archive size={15} aria-hidden="true" />} onClick={archive} />
    </div>
  </div>;
}
