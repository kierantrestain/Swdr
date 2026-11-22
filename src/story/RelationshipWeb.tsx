import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Divider } from '@astryxdesign/core/Divider';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Item } from '@astryxdesign/core/Item';
import { Link } from '@astryxdesign/core/Link';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { VStack } from '@astryxdesign/core/VStack';
import { ArrowRight, BookOpen, Clapperboard, Compass, Flame, Flag, MessageSquare, Sparkles, Target, Users, X } from 'lucide-react';
import { useState } from 'react';
import type { Project, WorkspaceViewProps } from '../model';
import { episodeCode, orderedEpisodes } from './source';
import { characterSummaryStats, findCastMatch, pairKey, relationshipHistory } from './series-analysis';
import { RELATIONSHIPS, sortStory } from './series-model';
import type { Character, RelationshipState, StoryPoint } from './series-model';
import { Choice, Glyph, Pane, PaneHeading, SourceButton, Split } from './StoryControls';
import { CanonBadge, CharacterAvatar, EpisodeChip, PointRows, relationshipStyle, stateTag } from './StoryParts';
import type { CanonLookup } from './StoryParts';

const WIDTH = 960;
const HEIGHT = 580;

interface Placed {
  person: Character;
  x: number;
  y: number;
}

type InspectorTab = 'Overview' | 'Journey' | 'Scenes' | 'Notes';

function ring(people: Character[], rx: number, ry: number, offset = -Math.PI / 2): Placed[] {
  return people.map((person, index) => {
    const angle = offset + (index / Math.max(1, people.length)) * Math.PI * 2;
    return { person, x: WIDTH / 2 + Math.cos(angle) * rx, y: HEIGHT / 2 + Math.sin(angle) * ry };
  });
}

function focusRing(people: Character[]): Placed[] {
  const offset = people.length === 2 ? Math.PI
    : people.length === 3 ? -Math.PI / 2
    : people.length === 6 ? -Math.PI * (2 / 3)
    : -Math.PI * 0.75;
  return ring(people, 365, 206, offset).map(item => ({
    ...item,
    x: Math.min(WIDTH - 118, Math.max(118, item.x)),
    y: Math.min(HEIGHT - 92, Math.max(82, item.y))
  }));
}

const pct = (value: number, total: number) => `${(value / total) * 100}%`;

/** Builds a clean connector (straight in focus mode, softly curved inward for cast chords) plus a non-overlapping pill position. */
function connectorGeometry(
  a: Placed,
  b: Placed,
  padA: number,
  padB: number,
  options: { focusCentreId?: string; curveInward?: boolean; obstacles: Placed[] }
) {
  const ax = a.x;
  const ay = a.y - 12;
  const bx = b.x;
  const by = b.y - 12;
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;

  const x1 = ax + ux * padA;
  const y1 = ay + uy * padA;
  const x2 = bx - ux * padB;
  const y2 = by - uy * padB;

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  let path = `M ${x1} ${y1} L ${x2} ${y2}`;
  let lx = midX;
  let ly = midY;

  if (options.focusCentreId) {
    // Push pills slightly past midpoint away from the larger central portrait & name badge.
    const t = a.person.id === options.focusCentreId ? 0.56 : 0.44;
    lx = x1 + (x2 - x1) * t;
    ly = y1 + (y2 - y1) * t;
  } else if (options.curveInward) {
    const cx = midX + (WIDTH / 2 - midX) * 0.24;
    const cy = midY + (HEIGHT / 2 - midY) * 0.24;
    path = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
    // Point at t = 0.5 on quadratic Bezier: 0.25*P0 + 0.5*C + 0.25*P1
    lx = 0.25 * x1 + 0.5 * cx + 0.25 * x2;
    ly = 0.25 * y1 + 0.5 * cy + 0.25 * y2;
  }

  // Gently nudge edge pills away from any non-endpoint character card they pass close to.
  for (const node of options.obstacles) {
    if (node.person.id === a.person.id || node.person.id === b.person.id) continue;
    const ox = lx - node.x;
    const oy = ly - (node.y + 8);
    const od = Math.hypot(ox, oy);
    if (od < 118 && od > 1) {
      const push = (118 - od) * 0.72;
      lx += (ox / od) * push;
      ly += (oy / od) * push;
    }
  }

  return {
    path,
    lx: Math.min(WIDTH - 76, Math.max(76, lx)),
    ly: Math.min(HEIGHT - 36, Math.max(36, ly))
  };
}

export function RelationshipWeb({ project, person, characters, edges, points, interactions, select, dossier, onOpen, states }: {
  project: Project;
  person?: Character;
  characters: Character[];
  edges: StoryPoint[];
  points: StoryPoint[];
  interactions: StoryPoint[];
  select: (id: string) => void;
  dossier: () => void;
  onOpen: WorkspaceViewProps['onOpenSource'];
  states: CanonLookup;
}) {
  const isWideGraph = useMediaQuery('(min-width: 560px)');
  const [category, setCategory] = useState<RelationshipState | ''>('');
  const [mode, setMode] = useState<'focus' | 'cast'>('focus');
  const [pair, setPair] = useState('');
  const [hoveredId, setHoveredId] = useState('');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('Overview');

  const shown = edges.filter(edge => !category || category === edge.relationship);
  const history = relationshipHistory(project, points);
  const episodes = orderedEpisodes(project);
  const code = (point: StoryPoint) => {
    const episode = episodes.find(item => item.id === point.source.episodeId);
    return episode ? episodeCode(episode) : '';
  };
  const linkCount = (id: string) => shown.filter(edge => edge.participants.includes(id)).length;

  const neighbours = person ? characters.filter(item => item.id !== person.id
    && shown.some(edge => edge.participants.includes(person.id) && edge.participants.includes(item.id))) : [];
  const placed: Placed[] = !person ? [] : mode === 'focus'
    ? [{ person, x: WIDTH / 2, y: HEIGHT / 2 - 4 }, ...focusRing(neighbours)]
    : ring(characters, 368, 206);
  const at = new Map(placed.map(item => [item.person.id, item]));
  const visibleEdges = shown.filter(edge => edge.participants.every(id => at.has(id))
    && (mode === 'cast' || edge.participants.includes(person?.id ?? '')));
  const isActiveEdge = (edge: StoryPoint) => {
    if (hoveredId) return edge.participants.includes(hoveredId);
    return !person || edge.participants.includes(person.id);
  };
  const unlinked = person ? characters.length - 1 - neighbours.length : 0;
  const selectedTurns = pair ? history.get(pair) ?? [] : [];
  const pairPeople = pair ? pair.split('/').map(id => characters.find(item => item.id === id)).filter((item): item is Character => Boolean(item)) : [];
  const pairInteractions = pair ? sortStory(project, points.filter(point => point.kind === 'interaction' && pairKey(point.participants) === pair), 'reveal') : [];
  const used = new Set(visibleEdges.map(edge => edge.relationship));

  // Character quick-inspector datasets
  const personPoints = person ? sortStory(project, points.filter(point => point.participants.includes(person.id)), 'reveal') : [];
  const personEvents = personPoints.filter(point => point.kind === 'event' || point.kind === 'arc');
  const personAppearances = personPoints.filter(point => point.kind === 'appearance');
  const personStats = person ? characterSummaryStats(project, { characters, points, exceptions: [] }, person.id) : undefined;
  const castLink = person ? findCastMatch(project, person) : undefined;

  const edgeGeoms = new Map(visibleEdges.map(edge => {
    const [a, b] = edge.participants.map(id => at.get(id)!);
    const padA = mode === 'focus' && a.person.id === person?.id ? 64 : mode === 'focus' ? 52 : 48;
    const padB = mode === 'focus' && b.person.id === person?.id ? 64 : mode === 'focus' ? 52 : 48;
    return [edge.id, connectorGeometry(a, b, padA, padB, {
      focusCentreId: mode === 'focus' ? person?.id : undefined,
      curveInward: mode === 'cast',
      obstacles: placed
    })] as const;
  }));

  const graphPanel = <Pane label="Relationship web" padding={5}>
    <PaneHeading
      title="Relationship web"
      level={2}
      actions={<HStack gap={2} align="center" wrap="wrap">
        <SegmentedControl label="Web layout" size="sm" value={mode} onChange={value => setMode(value as 'focus' | 'cast')}>
          <SegmentedControlItem value="focus" label="Focus" />
          <SegmentedControlItem value="cast" label="Whole cast" />
        </SegmentedControl>
        {person && characters.length > 1 && <Choice
          label="Selected character"
          isLabelHidden
          size="sm"
          width={168}
          value={person.id}
          onChange={id => { select(id); setPair(''); }}
          options={characters.map(item => ({ value: item.id, label: item.name }))}
        />}
        <Choice
          label="Relationship type"
          isLabelHidden
          size="sm"
          width={188}
          value={category}
          onChange={value => setCategory(value as RelationshipState | '')}
          options={[{ value: '', label: 'All relationships' }, ...RELATIONSHIPS.map(state => ({ value: state, label: state }))]}
        />
      </HStack>}
    />

    {person ? <>
      <Card
        variant="muted"
        padding={0}
        role="group"
        aria-label={mode === 'focus' ? `Relationship web for ${person.name}` : 'Relationship web for the whole cast'}
        style={{
          position: 'relative',
          aspectRatio: isWideGraph ? `${WIDTH} / ${HEIGHT}` : '4 / 4.2',
          minHeight: isWideGraph ? '430px' : '370px',
          overflow: 'hidden',
          background: 'radial-gradient(circle at 50% 48%, var(--color-background-surface) 0%, var(--color-background-muted) 100%)'
        }}
      >
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          <defs>
            {RELATIONSHIPS.map(state => (
              <marker
                key={state}
                id={`swdr-arrow-${state.toLowerCase()}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="5.5"
                markerHeight="5.5"
                orient="auto-start-reverse"
              >
                <path d="M 1 1.5 L 8.5 5 L 1 8.5 z" fill={relationshipStyle[state].stroke} />
              </marker>
            ))}
          </defs>
          {visibleEdges.map(edge => {
            const geom = edgeGeoms.get(edge.id)!;
            const state = edge.relationship ?? 'Trust';
            const style = relationshipStyle[state];
            const selected = pair === pairKey(edge.participants);
            const focused = isActiveEdge(edge);
            return <path
              key={edge.id}
              d={geom.path}
              fill="none"
              stroke={style.stroke}
              strokeDasharray={style.dash}
              strokeWidth={style.width + (selected ? 1.8 : 0)}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              opacity={focused || selected ? 0.92 : 0.22}
              markerEnd={`url(#swdr-arrow-${state.toLowerCase()})`}
              style={{ transition: 'opacity var(--duration-fast) ease' }}
            />;
          })}
        </svg>

        {visibleEdges.filter(edge => mode === 'focus' || edge.participants.includes(person.id) || pair === pairKey(edge.participants)).map(edge => {
          const [a, b] = edge.participants.map(id => at.get(id)!);
          const geom = edgeGeoms.get(edge.id)!;
          const key = pairKey(edge.participants);
          const state = edge.relationship ?? 'Trust';
          const style = relationshipStyle[state];
          const turns = history.get(key)?.length ?? 1;
          const isSelected = pair === key;
          return <button
            type="button"
            key={`label-${edge.id}`}
            aria-pressed={isSelected}
            aria-label={`${a.person.name} and ${b.person.name}: ${state}. Show relationship history`}
            onClick={() => setPair(isSelected ? '' : key)}
            style={{
              position: 'absolute',
              left: pct(geom.lx, WIDTH),
              top: pct(geom.ly, HEIGHT),
              transform: 'translate(-50%, -50%)',
              zIndex: isSelected ? 6 : 5,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--spacing-1)',
              minHeight: 0,
              padding: isWideGraph ? 'var(--spacing-1) var(--spacing-2)' : '2px 6px',
              borderRadius: 'var(--radius-full)',
              border: `1px solid ${isSelected ? style.stroke : 'var(--color-border-emphasized)'}`,
              background: isSelected ? style.tint : 'var(--color-background-surface)',
              color: style.ink,
              fontSize: 'var(--font-size-xs)',
              fontWeight: 600,
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              boxShadow: isSelected ? 'var(--shadow-med)' : 'var(--shadow-low)',
              cursor: 'pointer'
            }}
          >
            {state}{turns > 1 ? ` · ${turns}` : ''}
          </button>;
        })}

        {placed.map(({ person: item, x, y }) => {
          const isCentre = mode === 'focus' && item.id === person.id;
          const isSelected = item.id === person.id;
          const links = linkCount(item.id);
          const avatarSize = isWideGraph
            ? (isCentre ? 64 : mode === 'focus' ? 60 : 48)
            : (isCentre ? 48 : 36);
          return <button
            type="button"
            key={item.id}
            data-story-node={item.id}
            aria-label={isCentre ? `Open dossier for ${item.name}` : undefined}
            aria-pressed={mode === 'cast' ? isSelected : undefined}
            onMouseEnter={() => setHoveredId(item.id)}
            onMouseLeave={() => setHoveredId('')}
            onClick={() => {
              if (isCentre) dossier();
              else { select(item.id); setPair(''); }
            }}
            style={{
              position: 'absolute',
              left: pct(x, WIDTH),
              top: pct(y, HEIGHT),
              transform: 'translate(-50%, -50%)',
              zIndex: isSelected ? 5 : 4,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--spacing-1)',
              padding: isWideGraph ? 'var(--spacing-1) var(--spacing-1-5)' : 'var(--spacing-0-5)',
              minHeight: 0,
              border: 'none',
              borderRadius: 'var(--radius-container)',
              background: 'transparent',
              textAlign: 'center',
              cursor: 'pointer',
              maxWidth: isWideGraph ? (mode === 'cast' ? '152px' : '180px') : '116px'
            }}
          >
            <CharacterAvatar
              project={project}
              character={item}
              size={avatarSize}
              highlighted={isSelected}
              decorative
            />
            <VStack
              gap={0}
              hAlign="center"
              style={{
                padding: isWideGraph ? 'var(--spacing-0-5) var(--spacing-2)' : '2px 6px',
                borderRadius: 'var(--radius-element)',
                background: 'color-mix(in srgb, var(--color-background-surface) 94%, transparent)',
                boxShadow: 'var(--shadow-low)',
                border: isSelected ? '1px solid var(--color-accent)' : '1px solid var(--color-border)'
              }}
            >
              <Text weight="semibold" size={isWideGraph ? (isCentre ? 'base' : 'sm') : 'xsm'} style={{ whiteSpace: 'nowrap' }}>{item.name}</Text>
              <Text type="supporting" color="secondary" size="xsm" style={{ whiteSpace: 'nowrap' }}>
                {item.role || 'Character'}{mode === 'cast' ? ` · ${links} link${links === 1 ? '' : 's'}` : ''}
              </Text>
              <CanonBadge id={item.id} states={states} />
            </VStack>
          </button>;
        })}
      </Card>

      <HStack gap={4} align="center" justify="between" wrap="wrap">
        <HStack gap={4} align="center" wrap="wrap" aria-label="Relationship key">
          {RELATIONSHIPS.filter(state => used.has(state)).map(state => <HStack as="span" key={state} gap={1.5} align="center">
            <Card
              padding={0}
              aria-hidden="true"
              style={{
                width: '22px',
                height: '0px',
                border: 'none',
                borderTop: `${relationshipStyle[state].width}px ${relationshipStyle[state].dash ? 'dashed' : 'solid'} ${relationshipStyle[state].stroke}`,
                borderRadius: 0
              }}
            />
            <Text type="supporting" color="secondary">{state}</Text>
          </HStack>)}
        </HStack>
        {mode === 'focus' && unlinked > 0 && <Text type="supporting" color="secondary">
          {unlinked} other character{unlinked === 1 ? '' : 's'} not linked to {person.name.split(' ')[0]}
        </Text>}
      </HStack>

      {!visibleEdges.length && <Text type="supporting" color="secondary">No relationships in this view.</Text>}

      {visibleEdges.length > 0 && <Collapsible
        defaultIsOpen={false}
        trigger={<HStack gap={2} align="center">
          <Glyph icon={BookOpen} color="secondary" />
          <Text weight="medium">Relationship sources</Text>
          <Badge variant="neutral" label={String(visibleEdges.filter(edge => mode === 'cast' || edge.participants.includes(person.id)).length)} />
        </HStack>}
      >
        <VStack as="ul" gap={0} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {visibleEdges.filter(edge => mode === 'cast' || edge.participants.includes(person.id)).map((edge, idx) => {
            const other = characters.find(item => item.id !== person.id && edge.participants.includes(item.id));
            const title = mode === 'cast'
              ? edge.participants.map(id => at.get(id)?.person.name).filter(Boolean).join(' & ')
              : other?.name ?? 'Character';
            return <VStack as="li" key={edge.id} gap={0} style={{ listStyle: 'none' }}>
              {idx > 0 && <Divider />}
              <Item
                density="compact"
                label={<HStack gap={2} align="center" wrap="wrap">
                  <Text weight="semibold">{title}</Text>
                  {stateTag(edge)}
                </HStack>}
                description={edge.title}
                endContent={<SourceButton project={project} source={edge.source} onOpen={onOpen} />}
              />
            </VStack>;
          })}
        </VStack>
      </Collapsible>}
    </> : <Text color="secondary">Add a character and connect two characters to see their relationship web.</Text>}
  </Pane>;

  const statusVariantOf = (state: RelationshipState): 'accent' | 'success' | 'error' | 'warning' | 'neutral' =>
    state === 'Trust' ? 'accent'
      : state === 'Alliance' ? 'success'
      : state === 'Conflict' || state === 'Betrayal' ? 'error'
      : state === 'Pressure' ? 'warning'
      : 'neutral';

  const inspectorPanel = pairPeople.length === 2 ? (
    <Card role="complementary" aria-label="Relationship history" padding={5} elevation="low">
      <VStack gap={4}>
        <HStack gap={3} justify="between" align="start">
          <HStack gap={3} align="center">
            <HStack gap={1} align="center">
              {pairPeople.map(item => <CharacterAvatar key={item.id} project={project} character={item} size={40} decorative />)}
            </HStack>
            <VStack gap={0}>
              <Heading level={2}>{pairPeople.map(item => item.name.split(' ')[0]).join(' & ')}</Heading>
              <Text type="supporting" color="secondary">
                Relationship over {selectedTurns.length} recorded turn{selectedTurns.length === 1 ? '' : 's'}
              </Text>
            </VStack>
          </HStack>
          <IconButton variant="ghost" label="Close relationship history" icon={<Glyph icon={X} />} onClick={() => setPair('')} />
        </HStack>

        <VStack as="ol" gap={3} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {selectedTurns.map(({ point, previous }, idx) => {
            const state = point.relationship ?? 'Trust';
            return <HStack as="li" key={point.id} gap={3} align="start" style={{ listStyle: 'none' }}>
              <VStack gap={1} hAlign="center" style={{ paddingTop: 'var(--spacing-1)', flex: 'none' }}>
                <StatusDot variant={statusVariantOf(state)} label={state} />
                {idx < selectedTurns.length - 1 && (
                  <Card
                    padding={0}
                    aria-hidden="true"
                    style={{
                      width: '2px',
                      height: '44px',
                      border: 'none',
                      background: 'var(--color-border-emphasized)',
                      borderRadius: 0
                    }}
                  />
                )}
              </VStack>
              <VStack gap={1} hAlign="start" style={{ minWidth: 0, flex: 1 }}>
                <Text type="supporting" color="secondary">
                  {code(point)}{previous && previous !== point.relationship ? ` · from ${previous}` : ''}
                </Text>
                <HStack gap={1} align="center" wrap="wrap">
                  {stateTag(point)}
                  <CanonBadge id={point.id} states={states} />
                </HStack>
                <Text weight="semibold">{point.title}</Text>
                {point.detail && <Text type="supporting" color="secondary">{point.detail}</Text>}
                <SourceButton project={project} source={point.source} onOpen={onOpen} />
              </VStack>
            </HStack>;
          })}
        </VStack>

        <Divider />
        <VStack gap={2}>
          <Heading level={3}>Interactions between them</Heading>
          <PointRows rows={pairInteractions} project={project} onOpen={onOpen} states={states} compact empty="No recorded interactions between them in this view." />
        </VStack>

        <HStack gap={2} wrap="wrap">
          {pairPeople.map(item => <Button
            key={item.id}
            size="sm"
            variant="ghost"
            label={`Open ${item.name.split(' ')[0]}`}
            onClick={() => { select(item.id); dossier(); }}
          />)}
        </HStack>
      </VStack>
    </Card>
  ) : (
    <Card role="complementary" aria-label="Selected character" padding={5} elevation="low">
      <VStack gap={4}>
        {person ? <>
          <HStack gap={3} align="center" justify="between">
            <HStack gap={3} align="center" style={{ minWidth: 0 }}>
              <CharacterAvatar project={project} character={person} size={64} shape="rounded" decorative />
              <VStack gap={0.5} style={{ minWidth: 0 }}>
                <HStack gap={2} align="center" wrap="wrap">
                  <Heading level={2}>{person.name}</Heading>
                  {person.status && <Badge variant={person.status === 'Active' ? 'success' : 'neutral'} label={person.status} />}
                </HStack>
                <Text type="supporting" color="secondary">
                  {[person.role || 'Character', person.billing].filter(Boolean).join(' · ')}
                </Text>
              </VStack>
            </HStack>
          </HStack>

          <SegmentedControl
            label="Character inspector sections"
            size="sm"
            value={inspectorTab}
            onChange={value => setInspectorTab(value as InspectorTab)}
          >
            <SegmentedControlItem value="Overview" label="Overview" />
            <SegmentedControlItem value="Journey" label="Journey" />
            <SegmentedControlItem value="Scenes" label="Scenes" />
            <SegmentedControlItem value="Notes" label="Notes" />
          </SegmentedControl>

          {inspectorTab === 'Overview' && <VStack gap={4}>
            {person.motivation && <VStack gap={1}>
              <HStack gap={1.5} align="center">
                <Glyph icon={Target} size="xsm" color="accent" />
                <Heading level={4}>Current motivation</Heading>
              </HStack>
              <Text type="supporting" color="secondary">{person.motivation}</Text>
            </VStack>}

            <Divider />

            <VStack gap={2}>
              <HStack gap={1.5} align="center" justify="between">
                <HStack gap={1.5} align="center">
                  <Glyph icon={MessageSquare} size="xsm" color="accent" />
                  <Heading level={4}>Recent interactions</Heading>
                </HStack>
                {interactions.length > 0 && <Badge variant="neutral" label={String(interactions.length)} />}
              </HStack>
              {interactions.length > 0 ? <VStack as="ul" gap={0} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {interactions.slice(0, 3).map((item, idx) => {
                  const partner = item.participants.map(id => characters.find(c => c.id === id)).find(c => c && c.id !== person.id);
                  return <VStack as="li" key={item.id} gap={0} style={{ listStyle: 'none' }}>
                    {idx > 0 && <Divider />}
                    <Item
                      density="compact"
                      label={<Text weight="semibold" size="sm">{partner ? `With ${partner.name.split(' ')[0]}` : item.title}</Text>}
                      description={<VStack gap={0.5} hAlign="start">
                        <Text type="supporting" color="secondary">{item.title}</Text>
                        <SourceButton project={project} source={item.source} onOpen={onOpen} />
                      </VStack>}
                      endContent={<EpisodeChip project={project} episodeId={item.source.episodeId} color="blue" />}
                    />
                  </VStack>;
                })}
              </VStack> : <Text type="supporting" color="secondary">No recorded interactions in this view.</Text>}
            </VStack>

            {personEvents.length > 0 && <>
              <Divider />
              <VStack gap={2}>
                <HStack gap={1.5} align="center">
                  <Glyph icon={Flag} size="xsm" color="accent" />
                  <Heading level={4}>Pivotal events</Heading>
                </HStack>
                <VStack as="ul" gap={1.5} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {personEvents.slice(0, 4).map(item => <HStack as="li" key={item.id} gap={2} align="center" justify="between" style={{ listStyle: 'none' }}>
                    <HStack gap={2} align="center" style={{ minWidth: 0 }}>
                      <EpisodeChip project={project} episodeId={item.source.episodeId} color={item.kind === 'arc' ? 'purple' : 'blue'} />
                      <Text size="sm" maxLines={1}>{item.title}</Text>
                    </HStack>
                    <Link onClick={() => onOpen(item.source)} label={`Open script for ${item.title}`}>
                      <Glyph icon={ArrowRight} size="xsm" />
                    </Link>
                  </HStack>)}
                </VStack>
              </VStack>
            </>}
          </VStack>}

          {inspectorTab === 'Journey' && <VStack gap={3}>
            <HStack gap={1.5} align="center">
              <Glyph icon={Compass} size="xsm" color="accent" />
              <Heading level={4}>Arc milestones</Heading>
            </HStack>
            <PointRows
              rows={personPoints.filter(point => point.kind === 'arc')}
              project={project}
              onOpen={onOpen}
              states={states}
              compact
              empty="No arc milestones recorded in this view."
            />
            {personStats && personStats.openQuestions > 0 && <>
              <Divider />
              <HStack gap={2} align="center">
                <Glyph icon={Sparkles} size="xsm" color="warning" />
                <Text type="supporting" color="secondary">{personStats.openQuestions} open story question{personStats.openQuestions === 1 ? '' : 's'} tracked.</Text>
              </HStack>
            </>}
          </VStack>}

          {inspectorTab === 'Scenes' && <VStack gap={2}>
            <HStack gap={1.5} align="center">
              <Glyph icon={Clapperboard} size="xsm" color="accent" />
              <Heading level={4}>Recorded scenes</Heading>
            </HStack>
            <PointRows
              rows={personAppearances}
              project={project}
              onOpen={onOpen}
              states={states}
              compact
              empty="No recorded scene appearances in this view."
            />
          </VStack>}

          {inspectorTab === 'Notes' && <VStack gap={3}>
            {person.conflict && <VStack gap={1}>
              <HStack gap={1.5} align="center">
                <Glyph icon={Flame} size="xsm" color="error" />
                <Heading level={4}>Core conflict</Heading>
              </HStack>
              <Text type="supporting" color="secondary">{person.conflict}</Text>
            </VStack>}
            {person.aliases.length > 0 && <VStack gap={1}>
              <Heading level={4}>Aliases</Heading>
              <HStack gap={1} wrap="wrap">
                {person.aliases.map(alias => <Token key={alias} size="sm" label={alias} />)}
              </HStack>
            </VStack>}
            {person.notes && <VStack gap={1}>
              <Heading level={4}>Writer notes</Heading>
              <Text type="supporting" color="secondary">{person.notes}</Text>
            </VStack>}
            {castLink && <Card variant="muted" padding={3}>
              <HStack gap={2} align="center">
                <Glyph icon={Users} size="xsm" color="accent" />
                <Text type="supporting" color="secondary">
                  Production cast: {castLink.artist || castLink.name}{castLink.status ? ` · ${castLink.status}` : ''}
                </Text>
              </HStack>
            </Card>}
          </VStack>}

          <Divider />
          <VStack gap={2}>
            <Button variant="primary" label="Open character dossier" icon={<Glyph icon={ArrowRight} />} onClick={dossier} />
            {personStats?.latestPoint && (
              <Button
                variant="secondary"
                size="sm"
                label={`Jump to latest scene (${code(personStats.latestPoint) || 'Script'})`}
                onClick={() => onOpen(personStats.latestPoint!.source)}
              />
            )}
          </VStack>
        </> : <>
          <Heading level={2}>Characters</Heading>
          <Text type="supporting" color="secondary">No character selected.</Text>
        </>}
      </VStack>
    </Card>
  );

  return <Split main={graphPanel} side={inspectorPanel} ratio={[7, 4]} breakpoint={1080} />;
}
