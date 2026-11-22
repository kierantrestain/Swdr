import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Link } from '@astryxdesign/core/Link';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Token } from '@astryxdesign/core/Token';
import { VStack } from '@astryxdesign/core/VStack';
import { ArrowUpRight, BookOpen, HelpCircle, Sparkles, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { DocumentModel, Project, SourceRef } from '../model';
import { characterConnections, scriptDiscoveryPreview } from '../story/series-analysis';
import { getStory, knowledgeStates, queryStory, sortStory } from '../story/series-model';
import { episodeCode, exactSource, orderedEpisodes } from '../story/source';
import { storyStructure } from '../story/story-profile';
import { Glyph } from '../story/StoryControls';
import { CharacterAvatar, EpisodeChip, relationshipStyle } from '../story/StoryParts';

/**
 * Spoiler-safe Story Intelligence companion sidebar across the script editor, outline,
 * production and AV workspaces: keeps characters, motivations, everyone they interact with,
 * relationship types and open story questions right beside the writer's pages.
 */
export function StoryDrawer({ project, document, activeBlockId, docked = false, onOpenSource, onOpenSeries, onClose }: {
  project: Project;
  document: DocumentModel;
  activeBlockId?: string;
  /** When true, mounts as a fixed right-hand sidebar outside the manuscript editor (e.g. Outline or Production). */
  docked?: boolean;
  onOpenSource: (source: SourceRef) => void;
  onOpenSeries?: (characterId?: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [expandedChars, setExpandedChars] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!docked) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [docked, onClose]);

  const store = useMemo(() => getStory(project), [project]);
  const activeData = store.canon.at(-1)?.data ?? store.draft;
  const structure = useMemo(() => storyStructure(project, document.id), [project, document.id]);
  const episode = useMemo(
    () => structure.mode === 'episodic'
      ? orderedEpisodes(project).find(item => item.id === document.episodeId)
      : undefined,
    [project, structure.mode, document.episodeId]
  );
  const activeSceneId = useMemo(
    () => structure.mode === 'script' && activeBlockId
      ? exactSource(project, document, activeBlockId).sceneId
      : undefined,
    [project, document, structure.mode, activeBlockId]
  );
  const activeSlot = useMemo(
    () => activeSceneId ? structure.scenes.find(slot => slot.scene.id === activeSceneId) : undefined,
    [structure.scenes, activeSceneId]
  );
  const asOfId = structure.mode === 'episodic' ? document.episodeId : activeSlot?.scene.id;

  const scoped = useMemo(
    () => queryStory(project, activeData, { asOfId, documentId: document.id }),
    [project, activeData, asOfId, document.id]
  );
  const openQuestions = useMemo(
    () => knowledgeStates(project, scoped.points).filter(item => item.knowledge === 'Unresolved' || item.knowledge === 'Believes'),
    [project, scoped.points]
  );

  const inCurrent = useMemo(() => {
    const currentPoints = sortStory(
      project,
      scoped.points.filter(point => structure.mode === 'episodic'
        ? (Boolean(document.episodeId) && point.source.episodeId === document.episodeId)
        : (Boolean(activeSceneId) && point.source.sceneId === activeSceneId)),
      'reveal'
    );
    return new Set(currentPoints.flatMap(point => point.participants));
  }, [project, scoped.points, structure.mode, document.episodeId, activeSceneId]);

  const sortedChars = useMemo(
    () => [...scoped.characters].sort((a, b) => Number(inCurrent.has(b.id)) - Number(inCurrent.has(a.id))),
    [scoped.characters, inCurrent]
  );

  const connectionsByChar = useMemo(() => new Map(
    sortedChars.map(person => [person.id, characterConnections(project, scoped, person.id, document.id)] as const)
  ), [project, scoped, sortedChars, document.id]);

  const needle = search.trim().toLocaleLowerCase('en-GB');
  const visibleChars = needle
    ? sortedChars.filter(person =>
      [person.name, person.role, person.billing, person.motivation, ...person.aliases]
        .some(value => value?.toLocaleLowerCase('en-GB').includes(needle))
    )
    : sortedChars;

  const workspaceTitle = structure.terms.workspaceTitle;
  const scopeLabel = structure.mode === 'episodic'
    ? (episode ? `Spoiler-safe as of ${episodeCode(episode)}` : 'Series bible')
    : activeSlot
      ? `Spoiler-safe as of ${activeSlot.actLabel} · Sc ${activeSlot.scene.number}`
      : structure.terms.structureBadge;
  const currentBadgeLabel = structure.mode === 'episodic' ? 'In ep.' : 'In scene';
  const discovery = useMemo(
    () => !activeData.characters.length ? scriptDiscoveryPreview(project, document.id) : undefined,
    [activeData.characters.length, project, document.id]
  );

  const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

  return <aside
    className={docked ? 'swdr-story-sidebar' : 'swdr-w-drawer swdr-w-context'}
    aria-label={workspaceTitle}
  >
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
        {sortedChars.length > 4 && (
          <TextInput
            label="Filter characters"
            isLabelHidden
            size="sm"
            type="search"
            placeholder={`Filter ${sortedChars.length} characters…`}
            value={search}
            onChange={setSearch}
          />
        )}
        {sortedChars.length > 0 ? (visibleChars.length > 0 ? <VStack gap={2}>
          {visibleChars.map(person => {
            const conns = connectionsByChar.get(person.id) ?? [];
            const isExpanded = Boolean(expandedChars[person.id]);
            const shownConns = isExpanded ? conns : conns.slice(0, 4);
            const subtitle = [person.role, person.billing]
              .filter((value, idx, list) => Boolean(value) && list.indexOf(value) === idx)
              .join(' · ') || 'Character';
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
                      <Text type="supporting" color="secondary" size="xsm" maxLines={1}>{subtitle}</Text>
                    </VStack>
                  </HStack>
                  {inCurrent.has(person.id) && <Token size="sm" color="blue" label={currentBadgeLabel} />}
                </HStack>
                {person.motivation && <Text type="supporting" color="secondary" size="xsm" maxLines={2}>{person.motivation}</Text>}
                {shownConns.length > 0 && <VStack gap={1} hAlign="start" style={{ width: '100%' }}>
                  <HStack gap={1} wrap="wrap">
                    {shownConns.map(conn => {
                      const otherShort = firstName(conn.other.name);
                      if (conn.asymmetric) {
                        const outLabel = conn.outgoing?.relationship ? `→ ${conn.outgoing.relationship}` : '';
                        const inLabel = conn.incoming?.relationship ? `← ${conn.incoming.relationship}` : '';
                        const state = conn.outgoing?.relationship ?? conn.incoming?.relationship ?? 'Trust';
                        return <Token
                          key={conn.pairKey}
                          size="sm"
                          color={relationshipStyle[state].tokenColor}
                          label={`${otherShort}${conn.bond ? ` (${conn.bond})` : ''} ${[outLabel, inLabel].filter(Boolean).join(' / ')}`}
                        />;
                      }
                      if (conn.mutual?.relationship) {
                        return <Token
                          key={conn.pairKey}
                          size="sm"
                          color={relationshipStyle[conn.mutual.relationship].tokenColor}
                          label={`↔ ${conn.mutual.relationship}${conn.bond ? ` · ${conn.bond}` : ''} · ${otherShort}`}
                        />;
                      }
                      return <Token
                        key={conn.pairKey}
                        size="sm"
                        color="gray"
                        label={`${otherShort} · ${conn.interactions.length ? `${conn.interactions.length} int.` : `${conn.sharedScenes} sc.`}`}
                      />;
                    })}
                  </HStack>
                  {conns.length > 4 && (
                    <Link onClick={() => setExpandedChars(prev => ({ ...prev, [person.id]: !prev[person.id] }))}>
                      <Text type="supporting" color="accent" size="xsm">
                        {isExpanded ? 'Show fewer connections' : `Show all ${conns.length} connections`}
                      </Text>
                    </Link>
                  )}
                </VStack>}
              </VStack>
            </Card>;
          })}
        </VStack> : (
          <Text type="supporting" color="secondary" size="xsm">No characters match “{search}”.</Text>
        )) : discovery && discovery.speakingRoles > 0 ? (
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
            {openQuestions.map(item => (
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
