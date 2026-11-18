import { CommandPalette, CommandPaletteInput } from '@astryxdesign/core/CommandPalette';
import { Kbd } from '@astryxdesign/core/Kbd';
import { Text } from '@astryxdesign/core/Text';
import { createStaticSource } from '@astryxdesign/core/Typeahead';
import { useMemo } from 'react';
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
  switchEpisode: (episodeId: string) => void;
  actions: CommandAction[];
}

export function CommandMenu({ isOpen, onOpenChange, projects, project, document, navigate, openScene, switchEpisode, actions }: Props) {
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
  const source = useMemo(() => createStaticSource(items, { keywords: item => item.auxiliaryData.keywords ?? [item.auxiliaryData.group] }), [items]);

  return <CommandPalette<CommandAction>
    isOpen={isOpen}
    onOpenChange={onOpenChange}
    label="Command palette"
    searchSource={source}
    width={680}
    input={<CommandPaletteInput placeholder="Jump to a section, episode, scene or project…" label="Search commands" />}
    onValueChange={value => items.find(item => item.id === value)?.auxiliaryData.run()}
    renderItem={item => <span className="shell-command-row">
      <Text type="body" maxLines={1}>{item.label}</Text>
      {item.auxiliaryData.hint && <Text type="supporting">{item.auxiliaryData.hint}</Text>}
      {item.auxiliaryData.keys && <span className="shell-command-keys">{item.auxiliaryData.keys.split(' ').map((step, index) => <Kbd key={step + index} keys={step} />)}</span>}
    </span>}
  />;
}
