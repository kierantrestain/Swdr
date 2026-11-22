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
import { ArrowUpRight, BookOpen, HelpCircle, Users, X } from 'lucide-react';
import type { DocumentModel, Project, SourceRef } from '../model';
import { getStory, knowledgeStates, queryStory, relationshipStates, sortStory } from '../story/series-model';
import { episodeCode, orderedEpisodes } from '../story/source';
import { Glyph } from '../story/StoryControls';
import { CharacterAvatar, EpisodeChip, relationshipStyle } from '../story/StoryParts';

/**
 * Spoiler-safe Series Intelligence companion drawer inside the script editor: keeps characters,
 * motivations, current relationships and open story questions right beside the manuscript pages.
 */
export function StoryDrawer({ project, document, onOpenSource, onOpenSeries, onClose }: {
  project: Project;
  document: DocumentModel;
  onOpenSource: (source: SourceRef) => void;
  onOpenSeries?: (characterId?: string) => void;
  onClose: () => void;
}) {
  const store = getStory(project);
  const activeData = store.canon.at(-1)?.data ?? store.draft;
  const scoped = queryStory(project, activeData, { asOfId: document.episodeId });
  const episode = orderedEpisodes(project).find(item => item.id === document.episodeId);
  const rels = relationshipStates(project, scoped.points);
  const openQuestions = knowledgeStates(project, scoped.points).filter(item => item.knowledge === 'Unresolved' || item.knowledge === 'Believes');
  const episodePoints = sortStory(project, scoped.points.filter(point => !document.episodeId || point.source.episodeId === document.episodeId), 'reveal');
  const inEpisode = new Set(episodePoints.flatMap(point => point.participants));
  const sortedChars = [...scoped.characters].sort((a, b) => Number(inEpisode.has(b.id)) - Number(inEpisode.has(a.id)));

  return <aside className="swdr-w-drawer swdr-w-context" aria-label="Series Intelligence">
    <VStack gap={4} padding={4}>
      <HStack justify="between" align="center">
        <HStack gap={2} align="center">
          <Glyph icon={BookOpen} color="accent" />
          <VStack gap={0}>
            <Heading level={3}>Series Intelligence</Heading>
            <Text type="supporting" color="secondary" size="xsm">
              {episode ? `Spoiler-safe as of ${episodeCode(episode)}` : 'Series bible'}
            </Text>
          </VStack>
        </HStack>
        <IconButton variant="ghost" size="sm" label="Close Series Intelligence" icon={<Glyph icon={X} />} onClick={onClose} />
      </HStack>

      {onOpenSeries && (
        <Button
          size="sm"
          variant="secondary"
          label="Open full Series Intelligence"
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
                  {inEpisode.has(person.id) && <Token size="sm" color="blue" label="In ep." />}
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
        </VStack> : <Text type="supporting" color="secondary" size="xsm">No characters recorded up to this episode yet.</Text>}
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
                    <EpisodeChip project={project} episodeId={item.source.episodeId} color="yellow" />
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
