import { CommandPalette, CommandPaletteInput } from '@astryxdesign/core/CommandPalette';
import { Kbd } from '@astryxdesign/core/Kbd';
import { Text } from '@astryxdesign/core/Text';
import { createStaticSource } from '@astryxdesign/core/Typeahead';
import type { SearchSource } from '@astryxdesign/core/Typeahead';
import { useEffect, useMemo, useRef } from 'react';
import type { DocumentModel, Project } from '../model';
import { sceneList } from '../model';
import { projectNavigation, workspaceTabs } from './navigation';
import { documentForEpisode, episodeCode, orderedEpisodes } from './routes';
import type { Route } from './routes';

export interface CommandAction {
  id: string;
  label: string;
  auxiliaryData: { group: string; hint?: string; keys?: string; run: () => void; keywords?: string[] };
}

interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  project?: Project;
  document?: DocumentModel;
  navigate: (route: Route) => void;
  openScene: (sceneId: string, blockId: string) => void;
  /** Opens a line in any script of the current project. */
  openLine?: (documentId: string, blockId: string) => void;
  switchEpisode: (episodeId: string) => void;
  actions: CommandAction[];
}

export function CommandMenu({ isOpen, onOpenChange, projects, project, document, navigate, openScene, openLine, switchEpisode, actions }: Props) {
  const items = useMemo(() => {
    const list: CommandAction[] = [];
    if (project) {
      for (const group of projectNavigation(project, document)) {
        for (const entry of group.entries) list.push({ id: `go-${entry.id}`, label: `${group.title === 'Production' ? 'Production · ' : ''}${entry.label}`,
          auxiliaryData: { group: 'Go to', hint: project.title, keys: entry.key ? `g ${entry.key}` : undefined, run: () => navigate(entry.route) } });
      }
      for (const entry of workspaceTabs(project, document)) list.push({ id: `go-${entry.id}`, label: entry.label,
        auxiliaryData: { group: 'Go to', hint: project.title, run: () => navigate(entry.route) } });
      if (document) for (const scene of sceneList(document)) list.push({
        id: `scene-${scene.id}`, label: `Scene ${scene.number} · ${scene.heading || 'Untitled scene'}`,
        auxiliaryData: { group: 'Scenes in this script', run: () => openScene(scene.id, scene.blockId) }
      });
      if (!project.episodes.length) for (const item of project.documents) list.push({
        id: `document-${item.id}`, label: item.title,
        auxiliaryData: { group: 'Documents', hint: item.id === document?.id ? 'Current' : item.kind === 'av' ? 'AV script' : 'Script',
          run: () => navigate({ view: item.kind === 'av' ? 'av' : 'write', projectId: project.id, documentId: item.id }) }
      });
      for (const episode of orderedEpisodes(project)) {
        const target = documentForEpisode(project, episode.id, document);
        if (!target) continue;
        list.push({ id: `episode-${episode.id}`, label: `${episodeCode(episode)} · ${episode.title}`,
          auxiliaryData: { group: 'Episodes', hint: episode.id === document?.episodeId ? 'Current' : undefined,
            keywords: [`season ${episode.season}`, `episode ${episode.number}`],
            run: () => switchEpisode(episode.id) } });
      }
    }
    list.push(...actions);
    for (const item of projects.filter(entry => !entry.archivedAt && entry.id !== project?.id)) list.push({
      id: `project-${item.id}`, label: item.title,
      auxiliaryData: { group: 'Projects', hint: 'Open project', run: () => navigate({ view: 'project', projectId: item.id, documentId: item.documents[0]?.id }) }
    });
    return list;
  }, [actions, document, navigate, openScene, project, projects, switchEpisode]);
  const lines = useRef<CommandAction[]>([]);
  const source = useMemo((): SearchSource<CommandAction> => {
    const base = createStaticSource(items, { keywords: item => item.auxiliaryData.keywords ?? [item.auxiliaryData.group] });
    return {
      bootstrap: () => base.bootstrap(),
      // After three characters, every line of every script in the project is searchable too.
      search: async query => {
        const found = await base.search(query);
        const needle = query.trim().toLocaleLowerCase('en-GB');
        if (!project || !openLine || needle.length < 3) return found;
        const matches: CommandAction[] = [];
        for (const doc of project.documents) {
          const rows = doc.kind === 'av' ? doc.avRows.map(row => ({ id: row.id, text: `${row.video} ${row.audio}`.trim() })) : doc.blocks.map(block => ({ id: block.id, text: block.text }));
          for (const row of rows) {
            if (matches.length >= 25) break;
            if (!row.text.toLocaleLowerCase('en-GB').includes(needle)) continue;
            matches.push({ id: `line-${doc.id}-${row.id}`, label: row.text.length > 110 ? `${row.text.slice(0, 107)}…` : row.text,
              auxiliaryData: { group: 'Lines in scripts', hint: doc.title, keywords: [row.text], run: () => openLine(doc.id, row.id) } });
          }
        }
        lines.current = matches;
        return [...found, ...matches];
      }
    };
  }, [items, openLine, project]);

  // Enter runs the top result when nothing has been highlighted with the arrow keys yet.
  useEffect(() => {
    if (!isOpen) return;
    function onKey(event: KeyboardEvent) {
      const input = event.target;
      if (event.key !== 'Enter' || event.isComposing || !(input instanceof HTMLInputElement) || input.getAttribute('role') !== 'combobox') return;
      if (input.getAttribute('aria-activedescendant')) return;
      const list = window.document.getElementById(input.getAttribute('aria-controls') ?? '');
      const first = list?.querySelector<HTMLElement>('[role="option"][data-value]:not([aria-disabled="true"])');
      const item = first && [...items, ...lines.current].find(entry => entry.id === first.dataset.value);
      if (!item) return;
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(false);
      item.auxiliaryData.run();
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, items, onOpenChange]);

  return <CommandPalette<CommandAction>
    isOpen={isOpen}
    onOpenChange={onOpenChange}
    label="Command palette"
    searchSource={source}
    width={680}
    input={<CommandPaletteInput placeholder="Jump to a section, scene or project — or search every line of your scripts…" label="Search commands" />}
    onValueChange={value => [...items, ...lines.current].find(item => item.id === value)?.auxiliaryData.run()}
    renderItem={item => <span className="shell-command-row">
      <Text type="body" maxLines={1}>{item.label}</Text>
      {item.auxiliaryData.hint && <Text type="supporting">{item.auxiliaryData.hint}</Text>}
      {item.auxiliaryData.keys && <span className="shell-command-keys">{item.auxiliaryData.keys.split(' ').map((step, index) => <Kbd key={step + index} keys={step} />)}</span>}
    </span>}
  />;
}
