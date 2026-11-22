/**
 * The project context the AI partner works from: the story bible, characters, outline, the scene the
 * writer is in, and a sample of their own pages for voice. Built on the device from the project.
 */
import type { Block, DocumentModel, Project } from '../model';
import { getStory, knowledgeStates, queryStory, relationshipStates, sortStory } from '../story/series-model';
import { episodeCode, exactSource } from '../story/source';
import { isStoryProject, storyStructure } from '../story/story-profile';
import { scriptReport } from '../writing/script-insights';

const LIMIT = 50_000;

export function fountain(blocks: Block[]): string {
  return blocks.filter(block => block.kind !== 'note' && block.text.trim()).map(block => {
    const text = block.text.trim();
    if (block.kind === 'scene') return `\n${text.toUpperCase()}`;
    if (block.kind === 'character') return `\n${text.toUpperCase()}`;
    if (block.kind === 'transition') return `\n> ${text.toUpperCase()}`;
    if (block.kind === 'dialogue' || block.kind === 'parenthetical') return text;
    return `\n${text}`;
  }).join('\n').trim();
}

/** The blocks of the scene that contains `blockId` (or the last scene when it is not found). */
export function sceneAround(document: DocumentModel, blockId?: string): Block[] {
  const blocks = document.blocks;
  const at = Math.max(0, blockId ? blocks.findIndex(block => block.id === blockId) : blocks.length - 1);
  let start = at;
  while (start > 0 && blocks[start].kind !== 'scene') start -= 1;
  let end = at + 1;
  while (end < blocks.length && blocks[end].kind !== 'scene') end += 1;
  return blocks.slice(start, end);
}

export function aiContext(project: Project, document: DocumentModel | undefined, options: { blockId?: string; selection?: string; extra?: string } = {}): string {
  const parts: string[] = [`Project: ${project.title} (${project.kind})`];
  if (project.synopsis) parts.push(`Synopsis: ${project.synopsis}`);
  const pitch = project.modules.pitch as { logline?: string; genre?: string; comps?: string } | undefined;
  if (pitch?.logline) parts.push(`Logline: ${pitch.logline}`);
  if (pitch?.genre) parts.push(`Genre and tone: ${pitch.genre}`);
  if (pitch?.comps) parts.push(`Comparable titles: ${pitch.comps}`);
  const episode = document?.episodeId && project.episodes.find(item => item.id === document.episodeId);
  if (episode) parts.push(`Current episode: S${episode.season}E${episode.number} "${episode.title}"${episode.synopsis ? ` — ${episode.synopsis}` : ''}`);
  if (isStoryProject(project)) {
    const store = getStory(project);
    const activeData = store.canon.at(-1)?.data ?? store.draft;
    const structure = storyStructure(project, document?.id);
    const activeSceneId = structure.mode === 'script' && document && options.blockId
      ? exactSource(project, document, options.blockId).sceneId
      : undefined;
    const activeSlot = activeSceneId
      ? structure.scenes.find(slot => slot.scene.id === activeSceneId)
      : undefined;
    const asOfId = structure.mode === 'episodic' ? document?.episodeId : activeSlot?.scene.id;
    const asOfLabel = structure.mode === 'episodic'
      ? (episode ? ` as of ${episodeCode(episode)}` : '')
      : (activeSlot ? ` as of ${activeSlot.actLabel} · Sc ${activeSlot.scene.number}` : '');
    const scoped = queryStory(project, activeData, { asOfId, documentId: document?.id });
    const title = structure.terms.workspaceTitle;
    const tagOf = (source: Parameters<typeof structure.unitCodeOfSource>[0]) => {
      const code = structure.unitCodeOfSource(source);
      return code === 'Script' ? '' : code;
    };
    if (scoped.characters.length) {
      parts.push(`${title} — Characters (spoiler-safe${asOfLabel}):\n${scoped.characters.slice(0, 12).map(person =>
        `- ${person.name}${person.role ? ` (${person.role})` : ''}${person.motivation ? ` — Motivation: ${person.motivation}` : ''}${person.conflict ? ` | Conflict: ${person.conflict}` : ''}`
      ).join('\n')}`);
    }
    const rels = relationshipStates(project, scoped.points);
    if (rels.length) {
      const nameOf = (id: string) => scoped.characters.find(person => person.id === id)?.name ?? 'Character';
      parts.push(`${title} — Current relationships:\n${rels.slice(0, 16).map(edge => {
        const tag = tagOf(edge.source);
        return `- ${edge.participants.map(nameOf).join(' & ')}: ${edge.relationship} (${edge.title}${tag ? `, ${tag}` : ''})`;
      }).join('\n')}`);
    }
    const openThreads = knowledgeStates(project, scoped.points).filter(item => item.knowledge === 'Unresolved' || item.knowledge === 'Believes');
    if (openThreads.length) {
      parts.push(`${title} — Open story questions:\n${openThreads.slice(0, 8).map(item => {
        const tag = tagOf(item.source);
        return `- [${item.knowledge}] ${item.title}${tag ? ` (${tag})` : ''}`;
      }).join('\n')}`);
    }
    const recentEvents = sortStory(project, scoped.points.filter(point => point.kind === 'event'), 'reveal').slice(-8);
    if (recentEvents.length) {
      parts.push(`${title} — Major events so far:\n${recentEvents.map(item => {
        const tag = tagOf(item.source);
        return `- ${tag ? `${tag}: ` : ''}${item.title}${item.detail ? ` — ${item.detail}` : ''}`;
      }).join('\n')}`);
    }
  }
  if (document && document.kind !== 'av' && document.blocks.length) {
    const report = scriptReport(document);
    if (report.characters.length) parts.push(`Characters (by dialogue):\n${report.characters.slice(0, 12).map(item => `- ${item.name}: ${item.speeches} speeches, first in scene ${item.firstScene}`).join('\n')}`);
    if (report.locations.length) parts.push(`Locations: ${report.locations.slice(0, 12).map(item => item.name).join(', ')}`);
  }
  if (document?.beats.length) {
    const acts = [1, 2, 3].map(act => document.beats.filter(beat => (beat.act ?? 1) === act));
    parts.push(`Outline:\n${acts.map((beats, index) => beats.length ? `Act ${['I', 'II', 'III'][index]}\n${beats.map(beat => `- ${beat.title}${beat.notes ? `: ${beat.notes}` : ''}`).join('\n')}` : '').filter(Boolean).join('\n')}`);
  }
  if (document && document.kind === 'av' && document.avRows.length) {
    parts.push(`Two-column script:\n${document.avRows.slice(0, 60).map(row => `[${row.durationSeconds}s] VIDEO: ${row.video} | AUDIO: ${row.audio}`).join('\n')}`);
  }
  if (document && document.kind !== 'av' && document.blocks.length) {
    const scene = fountain(sceneAround(document, options.blockId));
    if (scene) parts.push(`Current scene (where the writer's cursor is):\n${scene.slice(-8000)}`);
    const sample = fountain(document.blocks).slice(0, 4000);
    if (sample && !scene.startsWith(sample.slice(0, 200))) parts.push(`Sample of the writer's pages (for voice):\n${sample}`);
  }
  if (options.selection?.trim()) parts.push(`Selected text:\n${options.selection.trim().slice(0, 6000)}`);
  if (options.extra) parts.push(options.extra);
  const text = parts.join('\n\n');
  return text.length > LIMIT ? text.slice(0, LIMIT) : text;
}
