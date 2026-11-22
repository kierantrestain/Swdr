import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Link } from '@astryxdesign/core/Link';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { VStack } from '@astryxdesign/core/VStack';
import { ArrowUpRight, BookOpen, HelpCircle, Sparkles, Users, X } from 'lucide-react';
import type { DocumentModel, Project, SourceRef } from '../model';
import { scriptDiscoveryPreview } from '../story/series-analysis';
import { getStory, knowledgeStates, queryStory, relationshipStates, sortStory } from '../story/series-model';
import { episodeCode, exactSource, orderedEpisodes } from '../story/source';
import { storyStructure } from '../story/story-profile';
import { Glyph } from '../story/StoryControls';
import { CharacterAvatar, EpisodeChip, relationshipStyle } from '../story/StoryParts';

/**
 * Spoiler-safe Story Intelligence companion drawer inside the script editor: keeps characters,
 * motivations, current relationships and open story questions right beside the manuscript pages
 * across Series, Film, Stage Play and Documentary projects.
 */
export function StoryDrawer({ project, document, activeBlockId, onOpenSource, onOpenSeries, onClose }: {
  project: Project;
  document: DocumentModel;
  activeBlockId?: string;
  onOpenSource: (source: SourceRef) => void;
  onOpenSeries?: (characterId?: string) => void;
  onClose: () => void;
}) {
  const store = getStory(project);
  const activeData = store.canon.at(-1)?.data ?? store.draft;
  const structure = storyStructure(project, document.id);
  const episode = structure.mode === 'episodic'
    ? orderedEpisodes(project).find(item => item.id === document.episodeId)
    : undefined;
  const activeSceneId = structure.mode === 'script' && activeBlockId
    ? exactSource(project, document, activeBlockId).sceneId
    : undefined;
  const activeSlot = activeSceneId
    ? structure.scenes.find(slot => slot.scene.id === activeSceneId)
    : undefined;
  const asOfId = structure.mode === 'episodic' ? document.episodeId : activeSlot?.scene.id;
  const scoped = queryStory(project, activeData, { asOfId, documentId: document.id });
  const rels = relationshipStates(project, scoped.points);
  const openQuestions = knowledgeStates(project, scoped.points).filter(item => item.knowledge === 'Unresolved' || item.knowledge === 'Believes');

  const currentPoints = sortStory(
    project,
    scoped.points.filter(point => structure.mode === 'episodic'
      ? (!document.episodeId || point.source.episodeId === document.episodeId)
      : (!activeSceneId || point.source.sceneId === activeSceneId)),
    'reveal'
  );
  const inCurrent = new Set(currentPoints.flatMap(point => point.participants));
  const sortedChars = [...scoped.characters].sort((a, b) => Number(inCurrent.has(b.id)) - Number(inCurrent.has(a.id)));

  const workspaceTitle = structure.terms.workspaceTitle;
  const scopeLabel = structure.mode === 'episodic'
    ? (episode ? `Spoiler-safe as of ${episodeCode(episode)}` : 'Series bible')
    : activeSlot
      ? `Spoiler-safe as of ${activeSlot.actLabel} · Sc ${activeSlot.scene.number}`
      : `${workspaceTitle} bible`;
  const currentBadgeLabel = structure.mode === 'episodic' ? 'In ep.' : 'In scene';
  const discovery = !activeData.characters.length ? scriptDiscoveryPreview(project, document.id) : undefined;

  return <aside className="swdr-w-drawer swdr-w-context" aria-label={workspaceTitle}>
    <VStack gap={4} padding={4}>
      <HStack justify="between" align="center">
        <HStack gap={2} align="center">
          <Glyph icon={BookOpen} color="accent" />
          <VStack gap={0}>
            <Heading level={3}>{workspaceTitle}</Heading>
            <Text type="supporting" color="secondary" size="xsm">
              {scopeLabel}
            </Text>
          </VStack>
        </HStack>
        <IconButton variant="ghost" size="sm" label={`Close ${workspaceTitle}`} icon={<Glyph icon={X} />} onClick={onClose} />
      </HStack>

      {onOpenSeries && (
        <Button
          size="sm"
          variant="secondary"
          label={`Open full ${workspaceTitle}`}
          icon={<Glyph icon={ArrowUpRight} size="xsm" />}
          onClick={() => onOpenSeries()}
        />
      )}

      <Divider />

      <VStack gap={2}>
        <HStack gap={1.5} align="center" justify="between">
          <HStack gap={1.5} align="center">
            <Glyph icon={Users} size="xsm" color="accent" />
            <Heading level={4}>Characters in scope</Heading>
          </HStack>
          <Badge variant="neutral" label={String(sortedChars.length)} />
        </HStack>
        {sortedChars.length > 0 ? <VStack gap={2}>
          {sortedChars.slice(0, 6).map(person => {
            const ownRels = rels.filter(edge => edge.participants.includes(person.id));
            return <Card key={person.id} variant="muted" padding={3}>
              <VStack gap={1.5} hAlign="start">
                <HStack gap={2} align="center" justify="between" style={{ width: '100%' }}>
                  <HStack gap={2} align="center" style={{ minWidth: 0 }}>
                    <CharacterAvatar project={project} character={person} size={32} decorative />
                    <VStack gap={0} style={{ minWidth: 0 }}>
                      {onOpenSeries ? (
                        <Link onClick={() => onOpenSeries(person.id)}>
                          <Text weight="semibold" size="sm">{person.name}</Text>
                        </Link>
                      ) : (
                        <Text weight="semibold" size="sm">{person.name}</Text>
                      )}
                      <Text type="supporting" color="secondary" size="xsm" maxLines={1}>{person.role || 'Character'}</Text>
                    </VStack>
                  </HStack>
                  {inCurrent.has(person.id) && <Token size="sm" color="blue" label={currentBadgeLabel} />}
                </HStack>
                {person.motivation && <Text type="supporting" color="secondary" size="xsm" maxLines={2}>{person.motivation}</Text>}
                {ownRels.length > 0 && <HStack gap={1} wrap="wrap">
                  {ownRels.slice(0, 2).map(edge => {
                    const otherId = edge.participants.find(id => id !== person.id);
                    const other = scoped.characters.find(item => item.id === otherId);
                    const state = edge.relationship ?? 'Trust';
                    return <Token
                      key={edge.id}
                      size="sm"
                      color={relationshipStyle[state].tokenColor}
                      label={`${state}${other ? ` · ${other.name.split(' ')[0]}` : ''}`}
                    />;
                  })}
                </HStack>}
              </VStack>
            </Card>;
          })}
        </VStack> : discovery && discovery.speakingRoles > 0 ? (
          <Card variant="muted" padding={3}>
            <VStack gap={2} hAlign="start">
              <HStack gap={1.5} align="center">
                <Glyph icon={Sparkles} size="xsm" color="accent" />
                <Text weight="semibold" size="sm">
                  {discovery.speakingRoles} speaking {discovery.speakingRoles === 1 ? 'role' : 'roles'} in this script
                </Text>
              </HStack>
              <Text type="supporting" color="secondary" size="xsm">
                Detected across {discovery.scenes} {discovery.scenes === 1 ? 'scene' : 'scenes'}{discovery.topNames.length ? `: ${discovery.topNames.join(', ')}` : ''}. Scan into draft to track arcs, relationships and continuity.
              </Text>
              {onOpenSeries && (
                <Button
                  size="sm"
                  variant="primary"
                  label={`Build ${workspaceTitle} draft`}
                  onClick={() => onOpenSeries()}
                />
              )}
            </VStack>
          </Card>
        ) : <Text type="supporting" color="secondary" size="xsm">No characters recorded up to this {structure.mode === 'episodic' ? 'episode' : 'scene'} yet.</Text>}
      </VStack>

      {openQuestions.length > 0 && <>
        <Divider />
        <VStack gap={2}>
          <HStack gap={1.5} align="center" justify="between">
            <HStack gap={1.5} align="center">
              <Glyph icon={HelpCircle} size="xsm" color="warning" />
              <Heading level={4}>Open questions</Heading>
            </HStack>
            <Badge variant="warning" label={String(openQuestions.length)} />
          </HStack>
          <VStack gap={1.5}>
            {openQuestions.slice(0, 4).map(item => (
              <Card key={item.id} variant="muted" padding={2}>
                <VStack gap={1} hAlign="start">
                  <HStack gap={1.5} align="center" wrap="wrap">
                    <EpisodeChip project={project} episodeId={item.source.episodeId} source={item.source} color="yellow" />
                    <Text weight="medium" size="xsm">{item.title}</Text>
                  </HStack>
                  <Link onClick={() => onOpenSource(item.source)}>
                    <Text type="supporting" color="accent" size="xsm">Open cited line</Text>
                  </Link>
                </VStack>
              </Card>
            ))}
          </VStack>
        </VStack>
      </>}
    </VStack>
  </aside>;
}
