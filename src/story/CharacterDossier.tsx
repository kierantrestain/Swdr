import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Item } from '@astryxdesign/core/Item';
import { Link } from '@astryxdesign/core/Link';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { VStack } from '@astryxdesign/core/VStack';
import {
  ArrowRight, Clapperboard, Compass, Download, FileText, Flame, HelpCircle, MessageSquare, Sparkles, Target, Users
} from 'lucide-react';
import { useState } from 'react';
import type { Project, WorkspaceViewProps } from '../model';
import { cellKey, characterArcStages, characterSummaryStats, findCastMatch, relationshipHistory, storyMap } from './series-analysis';
import type { ArcStageNode } from './series-analysis';
import { knowledgeStates, sortStory } from './series-model';
import type { Character, StoryPoint, StoryState } from './series-model';
import type { StoryStructure, StoryUnit } from './story-profile';
import { Glyph, Pane, PaneHeading, SourceButton, Split } from './StoryControls';
import { CanonBadge, CharacterAvatar, EpisodeChip, PointRows, stateTag } from './StoryParts';
import type { CanonLookup } from './StoryParts';

export const DOSSIER_PANES = ['Overview', 'Interactions', 'Knowledge', 'Relationships', 'Scenes', 'Notes & files'] as const;
export type DossierPane = (typeof DOSSIER_PANES)[number];

const ARC_TONE_COLOR: Record<ArcStageNode['tone'], string> = {
  accent: 'var(--color-accent)',
  warning: 'var(--color-warning)',
  error: 'var(--color-error)',
  success: 'var(--color-success)'
};

const HEAT_BG = [
  'var(--color-background-muted)',
  'color-mix(in srgb, var(--color-accent) 18%, var(--color-background-surface))',
  'color-mix(in srgb, var(--color-accent) 36%, var(--color-background-surface))',
  'color-mix(in srgb, var(--color-accent) 60%, var(--color-background-surface))',
  'var(--color-accent)'
];

function CharacterArcChart({ project, nodes, selectedId, onSelect, onOpen }: {
  project: Project;
  nodes: ArcStageNode[];
  selectedId: string;
  onSelect: (id: string) => void;
  onOpen: WorkspaceViewProps['onOpenSource'];
}) {
  if (!nodes.length) {
    return <Text type="supporting" color="secondary">Record an arc milestone to plot this character’s progression curve.</Text>;
  }
  const W = 440;
  const H = 160;
  const padX = 48;
  const padTop = 26;
  const padBottom = 46;
  const coords = nodes.map(node => ({
    ...node,
    cx: nodes.length === 1 ? W / 2 : padX + node.x * (W - padX * 2),
    cy: H - padBottom - node.y * (H - padTop - padBottom)
  }));
  const curvePath = coords.length === 1
    ? `M ${padX} ${coords[0].cy} L ${W - padX} ${coords[0].cy}`
    : coords.reduce((path, pt, i) => {
        if (i === 0) return `M ${pt.cx} ${pt.cy}`;
        const prev = coords[i - 1];
        const midX = (prev.cx + pt.cx) / 2;
        return `${path} C ${midX} ${prev.cy}, ${midX} ${pt.cy}, ${pt.cx} ${pt.cy}`;
      }, '');
  const activeNode = coords.find(node => node.point.id === selectedId) ?? coords.at(-1)!;

  return <VStack gap={3}>
    <Card variant="muted" padding={3}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Character arc progression across ${coords.length} milestone${coords.length === 1 ? '' : 's'}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        <defs>
          <linearGradient id="swdr-arc-stroke" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--color-accent)" />
            <stop offset="45%" stopColor="var(--color-warning)" />
            <stop offset="78%" stopColor="var(--color-error)" />
            <stop offset="100%" stopColor="var(--color-success)" />
          </linearGradient>
        </defs>
        <line x1={padX - 14} y1={H - padBottom + 10} x2={W - padX + 14} y2={H - padBottom + 10} stroke="var(--color-border)" strokeWidth="1" />
        <path
          d={curvePath}
          fill="none"
          stroke="url(#swdr-arc-stroke)"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        {coords.map(node => {
          const isSelected = node.point.id === activeNode.point.id;
          const color = ARC_TONE_COLOR[node.tone];
          return <g key={node.point.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(node.point.id)}>
            <title>{`${node.episodeLabel} · ${node.point.title}`}</title>
            {isSelected && <circle cx={node.cx} cy={node.cy} r="11" fill={color} opacity="0.2" />}
            <circle
              cx={node.cx}
              cy={node.cy}
              r={isSelected ? '6.5' : '5'}
              fill={color}
              stroke="var(--color-background-surface)"
              strokeWidth="2.5"
            />
            <text
              x={node.cx}
              y={H - 22}
              textAnchor="middle"
              fill="var(--color-text-primary)"
              fontSize="11"
              fontWeight="600"
              fontFamily="var(--font-family-body)"
            >
              {node.stageLabel}
            </text>
            <text
              x={node.cx}
              y={H - 7}
              textAnchor="middle"
              fill="var(--color-text-secondary)"
              fontSize="10"
              fontFamily="var(--font-family-body)"
            >
              {node.episodeLabel}
            </text>
          </g>;
        })}
      </svg>
    </Card>
    {activeNode && <HStack gap={2} justify="between" align="center" wrap="wrap">
      <HStack gap={2} align="center" wrap="wrap">
        <Token size="sm" color="purple" label={activeNode.episodeLabel} />
        <Text weight="semibold" size="sm">{activeNode.point.title}</Text>
      </HStack>
      <SourceButton project={project} source={activeNode.point.source} onOpen={onOpen} />
    </HStack>}
  </VStack>;
}

export function CharacterDossier({
  project,
  structure,
  person,
  data,
  states,
  active,
  setActive,
  onOpen,
  onEdit,
  onEditCharacter,
  onSelectPerson,
  units,
  canon
}: {
  project: Project;
  structure: StoryStructure;
  person: Character;
  data: StoryState;
  states: StoryPoint[];
  active: DossierPane;
  units: StoryUnit[];
  setActive: (value: DossierPane) => void;
  onOpen: WorkspaceViewProps['onOpenSource'];
  onEdit?: (point: StoryPoint) => void;
  onEditCharacter?: () => void;
  onSelectPerson: (id: string) => void;
  canon: CanonLookup;
}) {
  const [selectedArcId, setSelectedArcId] = useState('');
  const points = sortStory(project, data.points.filter(point => point.participants.includes(person.id)), 'reveal');
  const history = [...relationshipHistory(project, data.points).entries()].filter(([key]) => key.split('/').includes(person.id));
  const cells = storyMap(project, { ...data, points }, structure.document?.id);
  const stats = characterSummaryStats(project, data, person.id, structure.document?.id);
  const castLink = findCastMatch(project, person);
  const introLabel = structure.unitCodeOfSource(person.source);
  const arcNodes = characterArcStages(project, points, structure.document?.id);
  const arc = points.filter(point => point.kind === 'arc');
  const interactions = points.filter(point => point.kind === 'interaction').reverse();
  const knowledge = knowledgeStates(project, points);
  const scenes = points.filter(point => point.kind === 'appearance');
  const linkedAssets = (person.assetIds ?? [])
    .map(id => project.assets.find(asset => asset.id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const nameOf = (id: string) => data.characters.find(item => item.id === id)?.name ?? 'Character';
  const charOf = (id: string) => data.characters.find(item => item.id === id);
  const codeOf = (point: StoryPoint) => structure.unitCodeOfSource(point.source);
  const canonStatus = canon?.get(person.id);

  const sections: [DossierPane, string, StoryPoint[]][] = [
    ['Interactions', 'Key interactions', interactions],
    ['Knowledge', 'Knowledge and open threads', knowledge],
    ['Relationships', 'Relationship states', states.filter(point => point.participants.includes(person.id))],
    ['Scenes', 'Recorded appearances', scenes]
  ];

  const tabIcons: Record<DossierPane, typeof Sparkles> = {
    Overview: Sparkles,
    Interactions: MessageSquare,
    Knowledge: HelpCircle,
    Relationships: Users,
    Scenes: Clapperboard,
    'Notes & files': FileText
  };

  return <VStack gap={5}>
    {/* Hero Character Profile Card */}
    <Card padding={5} elevation="low">
      <HStack gap={5} align="start" justify="between" wrap="wrap">
        <HStack gap={4} align="start" wrap="wrap" style={{ flex: '1 1 28rem', minWidth: 0 }}>
          <CharacterAvatar project={project} character={person} size={96} shape="rounded" decorative />
          <VStack gap={2} style={{ flex: '1 1 18rem', minWidth: 0 }}>
            <HStack gap={2} align="center" wrap="wrap">
              <Text type="label" color="accent">{[person.role || 'Character', person.billing || 'Character dossier'].join(' · ')}</Text>
              <Badge variant={person.status === 'Departed' || person.status === 'Archived' ? 'neutral' : 'success'} label={person.status ?? 'Active'} />
              {canonStatus && canonStatus !== 'approved'
                ? <CanonBadge id={person.id} states={canon} />
                : <Token size="sm" color="blue" label="Approved canon" />}
            </HStack>
            <Text color="secondary">{person.bio || person.motivation || 'Character profile in the story register.'}</Text>
            <HStack gap={4} align="center" wrap="wrap">
              <HStack gap={1} align="center">
                <Text type="supporting" color="secondary">Introduced</Text>
                <Token size="sm" color="blue" label={introLabel} />
              </HStack>
              <Text type="supporting" color="secondary">{stats.records} record{stats.records === 1 ? '' : 's'}</Text>
              <Text type="supporting" color="secondary">{stats.relationships} relationship{stats.relationships === 1 ? '' : 's'}</Text>
              <Text type="supporting" color="secondary">{stats.arcMilestones} arc beat{stats.arcMilestones === 1 ? '' : 's'}</Text>
              {stats.openQuestions > 0 && <Token size="sm" color="yellow" label={`${stats.openQuestions} open thread${stats.openQuestions === 1 ? '' : 's'}`} />}
            </HStack>
          </VStack>
        </HStack>

        <HStack gap={2} align="center" wrap="wrap">
          <SourceButton project={project} source={person.source} onOpen={onOpen} />
          {onEditCharacter && <Button size="sm" label="Edit character" onClick={onEditCharacter} />}
        </HStack>
      </HStack>
    </Card>

    <TabList value={active} onChange={value => setActive(value as DossierPane)} hasDivider aria-label="Character dossier">
      {DOSSIER_PANES.map(pane => (
        <Tab
          key={pane}
          value={pane}
          label={pane}
          icon={<Glyph icon={tabIcons[pane]} size="sm" />}
          endContent={pane === 'Interactions' && interactions.length > 0 ? <Badge variant="neutral" label={String(interactions.length)} />
            : pane === 'Relationships' && history.length > 0 ? <Badge variant="neutral" label={String(history.length)} />
            : pane === 'Scenes' && scenes.length > 0 ? <Badge variant="neutral" label={String(scenes.length)} />
            : undefined}
        />
      ))}
    </TabList>

    <Split
      ratio={[4, 8]}
      breakpoint={980}
      main={
        <Pane title="Character" level={2} padding={5}>
          <MetadataList>
            <MetadataListItem label="Introduction">
              <SourceButton project={project} source={person.source} onOpen={onOpen} />
            </MetadataListItem>
            {person.motivation && <MetadataListItem label="Core motivation" icon={<Glyph icon={Target} size="xsm" color="accent" />}>
              <Text type="supporting">{person.motivation}</Text>
            </MetadataListItem>}
            {person.conflict && <MetadataListItem label="Conflict" icon={<Glyph icon={Flame} size="xsm" color="error" />}>
              <Text type="supporting">{person.conflict}</Text>
            </MetadataListItem>}
            {person.aliases.length > 0 && <MetadataListItem label="Aliases">
              <Text type="supporting">{person.aliases.join(', ')}</Text>
            </MetadataListItem>}
            <MetadataListItem label="Canon status">
              {canonStatus && canonStatus !== 'approved' ? <CanonBadge id={person.id} states={canon} /> : <Text type="supporting">Approved canon</Text>}
            </MetadataListItem>
            {castLink && <MetadataListItem label="Production cast">
              <Text type="supporting">{castLink.artist || castLink.name}{castLink.status ? ` · ${castLink.status}` : ''}</Text>
            </MetadataListItem>}
          </MetadataList>

          <Divider />

          <VStack gap={2}>
            <Heading level={3}>{structure.terms.presenceTitle}</Heading>
            <Grid
              columns={Math.min(12, Math.max(4, units.length))}
              gap={1}
              role="list"
              aria-label={`${person.name} by ${structure.terms.unitSingular}`}
            >
              {units.map(unit => {
                const count = cells.get(cellKey(person.id, unit.id))?.length ?? 0;
                const level = Math.min(4, count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 5 ? 3 : 4);
                return <Card
                  key={unit.id}
                  role="listitem"
                  padding={0}
                  aria-label={`${unit.code}: ${count} record${count === 1 ? '' : 's'}`}
                  style={{
                    height: '18px',
                    background: HEAT_BG[level],
                    borderRadius: 'var(--radius-inner)',
                    borderLeft: unit.isGroupStart ? '2px solid var(--color-text-primary)' : undefined
                  }}
                />;
              })}
            </Grid>
            <Text type="supporting" color="secondary" size="xsm">
              Active in {stats.episodes} of {units.length} visible {units.length === 1 ? structure.terms.unitSingular : structure.terms.unitPlural}
            </Text>
          </VStack>
        </Pane>
      }
      side={
        <VStack gap={4}>
          {active === 'Overview' && <Pane padding={5}>
            <PaneHeading
              title="Character arc"
              description={arc.length ? `${arc.length} milestone${arc.length === 1 ? '' : 's'} charted across visible ${structure.terms.unitPlural}` : 'Record an arc milestone to build this timeline.'}
              level={2}
            />
            <Grid columns={{ minWidth: 260, repeat: 'fit' }} gap={4} align="start">
              <CharacterArcChart
                project={project}
                nodes={arcNodes}
                selectedId={selectedArcId}
                onSelect={setSelectedArcId}
                onOpen={onOpen}
              />
              <VStack gap={2}>
                <HStack gap={1.5} align="center">
                  <Glyph icon={Compass} size="xsm" color="accent" />
                  <Heading level={3}>Key milestones</Heading>
                </HStack>
                {arc.length > 0 ? <VStack as="ul" gap={0} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {arc.map((point, idx) => <VStack as="li" key={point.id} gap={0} style={{ listStyle: 'none' }}>
                    {idx > 0 && <Divider />}
                    <Item
                      density="compact"
                      startContent={<EpisodeChip project={project} episodeId={point.source.episodeId} source={point.source} color="purple" />}
                      label={<HStack gap={1.5} align="center" wrap="wrap">
                        <Text weight="semibold" size="sm">{point.title}</Text>
                        <CanonBadge id={point.id} states={canon} />
                      </HStack>}
                      endContent={<SourceButton project={project} source={point.source} onOpen={onOpen} />}
                    />
                  </VStack>)}
                </VStack> : <Text type="supporting" color="secondary">Record an arc milestone to build this timeline.</Text>}
              </VStack>
            </Grid>
          </Pane>}

          {sections
            .filter(([key]) => key === active || (active === 'Overview' && (key === 'Interactions' || key === 'Knowledge')))
            .map(([key, title, rows]) => (
              <Pane key={key} title={title} level={2} padding={5}>
                {key === 'Relationships' ? (
                  history.length > 0 ? <VStack as="ul" gap={0} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                    {history.map(([pair, turns], idx) => {
                      const otherId = pair.split('/').find(id => id !== person.id) ?? '';
                      const other = charOf(otherId);
                      const latestTurn = turns.at(-1)?.point;
                      return <VStack as="li" key={pair} gap={0} style={{ listStyle: 'none' }}>
                        {idx > 0 && <Divider />}
                        <VStack gap={2} style={{ paddingBlock: 'var(--spacing-3)' }}>
                          <HStack gap={3} align="center" justify="between" wrap="wrap">
                            <HStack gap={2} align="center">
                              {other && <CharacterAvatar project={project} character={other} size={36} decorative />}
                              <VStack gap={0}>
                                <Link onClick={() => onSelectPerson(otherId)}>
                                  <Text weight="semibold">{nameOf(otherId)}</Text>
                                </Link>
                                {other?.role && <Text type="supporting" color="secondary" size="xsm">{other.role}</Text>}
                              </VStack>
                            </HStack>
                            <Badge variant="neutral" label={`${turns.length} turn${turns.length === 1 ? '' : 's'}`} />
                          </HStack>
                          <HStack
                            as="ol"
                            gap={2}
                            align="center"
                            wrap="wrap"
                            aria-label={`Relationship with ${nameOf(otherId)} over time`}
                            style={{ margin: 0, padding: 0, listStyle: 'none' }}
                          >
                            {turns.map(({ point }, turnIdx) => (
                              <HStack as="li" key={point.id} gap={1.5} align="center" style={{ listStyle: 'none' }}>
                                {turnIdx > 0 && <Glyph icon={ArrowRight} size="xsm" color="secondary" />}
                                {stateTag(point)}
                                <SourceButton project={project} source={point.source} onOpen={onOpen} label={codeOf(point)} />
                                <CanonBadge id={point.id} states={canon} />
                              </HStack>
                            ))}
                          </HStack>
                          {latestTurn?.title && <Text type="supporting" color="secondary">{latestTurn.title}</Text>}
                        </VStack>
                      </VStack>;
                    })}
                  </VStack> : <Text type="supporting" color="secondary">No matching story records.</Text>
                ) : (
                  <PointRows
                    rows={rows}
                    project={project}
                    onOpen={onOpen}
                    onEdit={onEdit}
                    states={canon}
                    people={key === 'Interactions' ? data.characters.filter(item => item.id !== person.id) : undefined}
                    empty="No matching story records."
                  />
                )}
              </Pane>
            ))}

          {active === 'Notes & files' && <Pane title="Notes & reference files" level={2} padding={5}
            actions={onEditCharacter && <Button size="sm" label="Edit notes" onClick={onEditCharacter} />}>
            <VStack gap={4}>
              <VStack gap={1}>
                <Heading level={3}>Writer notes</Heading>
                <Text color="secondary">{person.notes || 'No writer notes recorded yet. Use Edit character to add character notes, backstory, or voice reminders.'}</Text>
              </VStack>
              <Divider />
              <VStack gap={2}>
                <Heading level={3}>Attached project files</Heading>
                {linkedAssets.length > 0 ? <VStack as="ul" gap={0} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {linkedAssets.map((asset, idx) => <VStack as="li" key={asset.id} gap={0} style={{ listStyle: 'none' }}>
                    {idx > 0 && <Divider />}
                    <Item
                      density="compact"
                      label={asset.name}
                      description={asset.mime}
                      endContent={<Link href={asset.dataUrl} label={`Download ${asset.name}`}>
                        <Glyph icon={Download} size="xsm" /> Download
                      </Link>}
                    />
                  </VStack>)}
                </VStack> : <Text type="supporting" color="secondary">No files linked to this character yet. Upload reference images or documents in Files & media.</Text>}
              </VStack>
            </VStack>
          </Pane>}

          {active === 'Overview' && <HStack justify="start">
            <Button label="View all appearances" icon={<Glyph icon={Clapperboard} />} onClick={() => setActive('Scenes')} />
          </HStack>}
        </VStack>
      }
    />
  </VStack>;
}
