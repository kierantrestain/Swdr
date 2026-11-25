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
import { ToggleButton } from '@astryxdesign/core/ToggleButton';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { VStack } from '@astryxdesign/core/VStack';
import {
  ArrowLeftRight, ArrowRight, BookOpen, Clapperboard, Compass, Flame, Flag, MessageSquare, Plus, Target, Users, X
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Project, WorkspaceViewProps } from '../model';
import {
  allPairConnections, characterConnections, characterSummaryStats, findCastMatch, pairKey
} from './series-analysis';
import type { CastPairSummary, PairConnection } from './series-analysis';
import { RELATIONSHIPS, sortStory } from './series-model';
import type { Character, RelationshipState, StoryPoint } from './series-model';
import type { StoryStructure } from './story-profile';
import { Choice, Glyph, Pane, PaneHeading, SourceButton, Split } from './StoryControls';
import { CanonBadge, CharacterAvatar, EpisodeChip, PointRows, QuietDotTag, relationshipStyle, stateTag } from './StoryParts';
import type { CanonLookup, PointPrefill } from './StoryParts';

const WIDTH = 960;
const HEIGHT = 600;

interface Placed {
  person: Character;
  x: number;
  y: number;
}

type InspectorTab = 'Connections' | 'Overview' | 'Journey' | 'Scenes' | 'Notes';

interface VisualEdge {
  id: string;
  pairKey: string;
  from: Placed;
  to: Placed;
  kind: 'mutual' | 'directed' | 'interaction';
  state?: RelationshipState;
  bond?: string;
  turns: number;
  interactionsCount: number;
  sharedScenes: number;
  /** Perpendicular curve offset when rendering two opposite directed arcs between the same pair. */
  curveOffset: number;
  sourcePoint?: StoryPoint;
}

const HONORIFICS = new Set(['dr.', 'dr', 'mr.', 'mr', 'mrs.', 'mrs', 'ms.', 'ms', 'miss', 'prof.', 'prof', 'sir', 'lord', 'lady', 'director', 'inspector', 'judge', 'captain', 'detective', 'agent', 'officer', 'rev.', 'father', 'sister']);

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && HONORIFICS.has(parts[0].toLowerCase())) return parts[1];
  return parts[0] ?? name;
}

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
  return ring(people, 384, 224, offset).map(item => ({
    ...item,
    x: Math.min(WIDTH - 112, Math.max(112, item.x)),
    y: Math.min(HEIGHT - 86, Math.max(76, item.y))
  }));
}

const pct = (value: number, total: number) => `${(value / total) * 100}%`;

/** Builds a clean connector (straight for mutual focus, offset arcs for dual directed edges, inward curves for cast chords). */
function connectorGeometry(
  a: Placed,
  b: Placed,
  padA: number,
  padB: number,
  options: { focusCentreId?: string; curveInward?: boolean; curveOffset?: number; obstacles: Placed[] }
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
  // Unit normal perpendicular to A→B
  const nx = -uy;
  const ny = ux;

  const x1 = ax + ux * padA;
  const y1 = ay + uy * padA;
  const x2 = bx - ux * padB;
  const y2 = by - uy * padB;

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  let path = `M ${x1} ${y1} L ${x2} ${y2}`;
  let lx = midX;
  let ly = midY;

  if (options.curveOffset) {
    const cx = midX + nx * options.curveOffset;
    const cy = midY + ny * options.curveOffset;
    path = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
    lx = 0.25 * x1 + 0.5 * cx + 0.25 * x2;
    ly = 0.25 * y1 + 0.5 * cy + 0.25 * y2;
  } else if (options.focusCentreId) {
    const t = a.person.id === options.focusCentreId ? 0.52 : 0.48;
    lx = x1 + (x2 - x1) * t;
    ly = y1 + (y2 - y1) * t;
  } else if (options.curveInward) {
    const cx = midX + (WIDTH / 2 - midX) * 0.24;
    const cy = midY + (HEIGHT / 2 - midY) * 0.24;
    path = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
    lx = 0.25 * x1 + 0.5 * cx + 0.25 * x2;
    ly = 0.25 * y1 + 0.5 * cy + 0.25 * y2;
  }

  // Gently nudge edge pills away from any non-endpoint character card they pass close to.
  for (const node of options.obstacles) {
    if (node.person.id === a.person.id || node.person.id === b.person.id) continue;
    const ox = lx - node.x;
    const oy = ly - (node.y + 8);
    const od = Math.hypot(ox, oy);
    if (od < 116 && od > 1) {
      const push = (116 - od) * 0.68;
      lx += (ox / od) * push;
      ly += (oy / od) * push;
    }
  }

  return {
    path,
    lx: Math.min(WIDTH - 78, Math.max(78, lx)),
    ly: Math.min(HEIGHT - 36, Math.max(36, ly))
  };
}

export function RelationshipWeb({
  project,
  structure,
  person,
  characters,
  edges,
  points,
  interactions,
  select,
  dossier,
  onOpen,
  onEdit,
  onCreatePoint,
  states
}: {
  project: Project;
  structure: StoryStructure;
  person?: Character;
  characters: Character[];
  edges: StoryPoint[];
  points: StoryPoint[];
  interactions: StoryPoint[];
  select: (id: string) => void;
  dossier: () => void;
  onOpen: WorkspaceViewProps['onOpenSource'];
  onEdit?: (point: StoryPoint) => void;
  onCreatePoint?: (prefill: PointPrefill) => void;
  states: CanonLookup;
}) {
  const isWideGraph = useMediaQuery('(min-width: 560px)');
  const [category, setCategory] = useState<RelationshipState | ''>('');
  const [mode, setMode] = useState<'focus' | 'cast'>('focus');
  const [showScenePartners, setShowScenePartners] = useState(true);
  const [pair, setPair] = useState('');
  const [hoveredId, setHoveredId] = useState('');
  const [hoveredPair, setHoveredPair] = useState('');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('Connections');

  const dataSnapshot = useMemo(() => ({ characters, points, exceptions: [] }), [characters, points]);
  const allPairs = useMemo(
    () => allPairConnections(project, dataSnapshot, structure.document?.id),
    [project, dataSnapshot, structure.document?.id]
  );
  const pairByKey = useMemo(() => new Map(allPairs.map(item => [item.pairKey, item])), [allPairs]);
  const connections = useMemo(
    () => person ? characterConnections(project, dataSnapshot, person.id, structure.document?.id) : [],
    [project, dataSnapshot, person, structure.document?.id]
  );

  // Filter pairs by selected relationship category and scene-partner visibility
  const pairMatchesFilter = (summary: CastPairSummary): boolean => {
    const hasFormal = Boolean(summary.mutual || summary.aToB || summary.bToA);
    if (!hasFormal) return !category && showScenePartners && mode === 'focus';
    if (!category) return true;
    return summary.mutual?.relationship === category
      || summary.aToB?.relationship === category
      || summary.bToA?.relationship === category;
  };

  const filteredPairs = useMemo(
    () => allPairs.filter(pairMatchesFilter),
    [allPairs, category, showScenePartners, mode]
  );

  const code = (point: StoryPoint) => structure.unitCodeOfSource(point.source);
  const linkCount = (id: string) => filteredPairs.filter(item => item.a.id === id || item.b.id === id).length;

  const neighbours = useMemo(() => {
    if (!person) return [];
    const ids = new Set<string>();
    for (const item of filteredPairs) {
      if (item.a.id === person.id) ids.add(item.b.id);
      else if (item.b.id === person.id) ids.add(item.a.id);
    }
    // Order neighbours by richness of connection from `connections`
    const rank = new Map(connections.map((conn, idx) => [conn.other.id, idx]));
    return characters
      .filter(item => ids.has(item.id))
      .sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
  }, [person, filteredPairs, connections, characters]);

  const placed: Placed[] = useMemo(() => {
    if (!person) return [];
    return mode === 'focus'
      ? [{ person, x: WIDTH / 2, y: HEIGHT / 2 - 4 }, ...focusRing(neighbours)]
      : ring(characters, 368, 206);
  }, [person, mode, neighbours, characters]);

  const at = useMemo(() => new Map(placed.map(item => [item.person.id, item])), [placed]);

  // Build visual edges: mutual = bidirectional ↔, asymmetric = separate curved A→B & B→A arcs, interaction/scene = dashed partner line
  const visualEdges: VisualEdge[] = useMemo(() => {
    const result: VisualEdge[] = [];
    for (const summary of filteredPairs) {
      const nodeA = at.get(summary.a.id);
      const nodeB = at.get(summary.b.id);
      if (!nodeA || !nodeB) continue;
      if (mode === 'focus' && person && summary.a.id !== person.id && summary.b.id !== person.id) continue;

      const hasAB = Boolean(summary.aToB && (!category || summary.aToB.relationship === category));
      const hasBA = Boolean(summary.bToA && (!category || summary.bToA.relationship === category));
      const hasMutual = Boolean(summary.mutual && (!category || summary.mutual.relationship === category));

      if (hasAB || hasBA) {
        const dualCurve = (hasAB && hasBA) || (hasMutual && (hasAB || hasBA)) ? 34 : 0;
        if (hasAB && summary.aToB) {
          result.push({
            id: `${summary.pairKey}:ab:${summary.aToB.id}`,
            pairKey: summary.pairKey,
            from: nodeA,
            to: nodeB,
            kind: 'directed',
            state: summary.aToB.relationship,
            bond: summary.aToB.bond || summary.bond,
            turns: summary.relationshipTurns.length,
            interactionsCount: summary.interactions.length,
            sharedScenes: summary.sharedScenes,
            curveOffset: dualCurve || 22,
            sourcePoint: summary.aToB
          });
        }
        if (hasBA && summary.bToA) {
          result.push({
            id: `${summary.pairKey}:ba:${summary.bToA.id}`,
            pairKey: summary.pairKey,
            from: nodeB,
            to: nodeA,
            kind: 'directed',
            state: summary.bToA.relationship,
            bond: summary.bToA.bond || summary.bond,
            turns: summary.relationshipTurns.length,
            interactionsCount: summary.interactions.length,
            sharedScenes: summary.sharedScenes,
            curveOffset: dualCurve || 22,
            sourcePoint: summary.bToA
          });
        }
        if (hasMutual && summary.mutual && !hasAB && !hasBA) {
          result.push({
            id: `${summary.pairKey}:m:${summary.mutual.id}`,
            pairKey: summary.pairKey,
            from: nodeA,
            to: nodeB,
            kind: 'mutual',
            state: summary.mutual.relationship,
            bond: summary.mutual.bond || summary.bond,
            turns: summary.relationshipTurns.length,
            interactionsCount: summary.interactions.length,
            sharedScenes: summary.sharedScenes,
            curveOffset: 0,
            sourcePoint: summary.mutual
          });
        }
      } else if (hasMutual && summary.mutual) {
        result.push({
          id: `${summary.pairKey}:m:${summary.mutual.id}`,
          pairKey: summary.pairKey,
          from: nodeA,
          to: nodeB,
          kind: 'mutual',
          state: summary.mutual.relationship,
          bond: summary.mutual.bond || summary.bond,
          turns: summary.relationshipTurns.length,
          interactionsCount: summary.interactions.length,
          sharedScenes: summary.sharedScenes,
          curveOffset: 0,
          sourcePoint: summary.mutual
        });
      } else if (!category && showScenePartners && (summary.interactions.length > 0 || summary.sharedScenes > 0)) {
        result.push({
          id: `${summary.pairKey}:scene`,
          pairKey: summary.pairKey,
          from: nodeA,
          to: nodeB,
          kind: 'interaction',
          turns: 0,
          interactionsCount: summary.interactions.length,
          sharedScenes: summary.sharedScenes,
          curveOffset: 0
        });
      }
    }
    return result;
  }, [filteredPairs, at, mode, person, category, showScenePartners]);

  const edgeGeoms = useMemo(() => new Map(visualEdges.map(edge => {
    const padA = mode === 'focus' && edge.from.person.id === person?.id ? 64 : mode === 'focus' ? 52 : 48;
    const padB = mode === 'focus' && edge.to.person.id === person?.id ? 64 : mode === 'focus' ? 52 : 48;
    return [edge.id, connectorGeometry(edge.from, edge.to, padA, padB, {
      focusCentreId: mode === 'focus' && edge.curveOffset === 0 ? person?.id : undefined,
      curveInward: mode === 'cast' && edge.curveOffset === 0,
      curveOffset: edge.curveOffset,
      obstacles: placed
    })] as const;
  })), [visualEdges, mode, person?.id, placed]);

  const isActiveEdge = (edge: VisualEdge) => {
    if (hoveredPair) return edge.pairKey === hoveredPair;
    if (hoveredId) return edge.from.person.id === hoveredId || edge.to.person.id === hoveredId;
    if (pair) return edge.pairKey === pair;
    return !person || edge.from.person.id === person.id || edge.to.person.id === person.id;
  };

  const unlinked = person ? characters.length - 1 - neighbours.length : 0;
  const selectedSummary = pair ? pairByKey.get(pair) : undefined;
  const selectedTurns = selectedSummary?.relationshipTurns ?? [];
  const pairPeople = selectedSummary ? [selectedSummary.a, selectedSummary.b] : [];
  const pairInteractions = selectedSummary?.interactions ?? [];
  const usedStates = new Set(visualEdges.map(edge => edge.state).filter((s): s is RelationshipState => Boolean(s)));
  const hasScenePartnerEdges = visualEdges.some(edge => edge.kind === 'interaction');

  // Character quick-inspector datasets (memoized)
  const personPoints = useMemo(
    () => person ? sortStory(project, points.filter(point => point.participants.includes(person.id)), 'reveal') : [],
    [project, points, person]
  );
  const personEvents = useMemo(() => personPoints.filter(point => point.kind === 'event' || point.kind === 'arc'), [personPoints]);
  const personAppearances = useMemo(() => personPoints.filter(point => point.kind === 'appearance'), [personPoints]);
  const personStats = useMemo(
    () => person ? characterSummaryStats(project, dataSnapshot, person.id, structure.document?.id) : undefined,
    [project, dataSnapshot, person, structure.document?.id]
  );
  const castLink = useMemo(() => person ? findCastMatch(project, person) : undefined, [project, person]);

  // Show pills for focus mode, hovered/selected edges, and active character's edges in Whole Cast mode
  const pillEdges = visualEdges.filter(edge =>
    mode === 'focus'
    || edge.pairKey === pair
    || edge.pairKey === hoveredPair
    || (hoveredId && (edge.from.person.id === hoveredId || edge.to.person.id === hoveredId))
    || (!hoveredId && !hoveredPair && person && (edge.from.person.id === person.id || edge.to.person.id === person.id))
  );

  const visibleFormalEdges = edges.filter(edge =>
    (!category || edge.relationship === category)
    && (mode === 'cast' || (person && edge.participants.includes(person.id)))
  );

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
          width={176}
          value={category}
          onChange={value => setCategory(value as RelationshipState | '')}
          options={[{ value: '', label: 'All relationships' }, ...RELATIONSHIPS.map(state => ({ value: state, label: state }))]}
        />
        <ToggleButton
          size="sm"
          label="Scene partners"
          isPressed={showScenePartners}
          onPressedChange={setShowScenePartners}
        >
          Scene partners
        </ToggleButton>
      </HStack>}
    />

    {person ? <>
      <Card
        className="swdr-story-canvas"
        padding={0}
        role="group"
        aria-label={mode === 'focus' ? `Relationship web for ${person.name}` : 'Relationship web for the whole cast'}
        style={{
          position: 'relative',
          aspectRatio: isWideGraph ? `${WIDTH} / ${HEIGHT}` : '4 / 4.2',
          minHeight: isWideGraph ? '470px' : '380px',
          overflow: 'hidden',
          border: '1px solid var(--color-border)'
        }}
      >
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
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
          {visualEdges.map(edge => {
            const geom = edgeGeoms.get(edge.id)!;
            const style = edge.state ? relationshipStyle[edge.state] : undefined;
            const stroke = style ? style.stroke : 'var(--color-border-emphasized)';
            const dash = style ? style.dash : '4 5';
            const strokeWidth = style ? Math.min(2.2, style.width) : 1.5;
            const isSelected = pair === edge.pairKey;
            const focused = isActiveEdge(edge);
            const markerUrl = edge.state ? `url(#swdr-arrow-${edge.state.toLowerCase()})` : undefined;
            return <g key={edge.id}>
              <path
                d={geom.path}
                fill="none"
                stroke={stroke}
                strokeDasharray={dash}
                strokeWidth={strokeWidth + (isSelected ? 1.4 : 0)}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                opacity={focused || isSelected ? 0.88 : 0.14}
                markerStart={edge.kind === 'mutual' ? markerUrl : undefined}
                markerEnd={edge.kind === 'mutual' || edge.kind === 'directed' ? markerUrl : undefined}
                style={{ transition: 'opacity var(--duration-fast) ease', pointerEvents: 'none' }}
              />
              {/* Wide invisible hit target so EVERY edge in both Focus and Whole Cast mode is clickable */}
              <path
                d={geom.path}
                fill="none"
                stroke="transparent"
                strokeWidth="16"
                style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                onMouseEnter={() => setHoveredPair(edge.pairKey)}
                onMouseLeave={() => setHoveredPair('')}
                onClick={() => setPair(isSelected ? '' : edge.pairKey)}
              />
            </g>;
          })}
        </svg>

        {pillEdges.map(edge => {
          const geom = edgeGeoms.get(edge.id)!;
          const isSelected = pair === edge.pairKey;
          const style = edge.state ? relationshipStyle[edge.state] : undefined;
          const dirSymbol = edge.kind === 'directed' ? '→ ' : edge.kind === 'mutual' ? '↔ ' : '';
          const pillText = edge.state
            ? `${dirSymbol}${edge.state}${edge.turns > 1 ? ` · ${edge.turns}` : ''}`
            : edge.interactionsCount > 0
              ? `${edge.interactionsCount} int.`
              : `${edge.sharedScenes} sc.`;
          const tooltip = edge.state
            ? `${edge.from.person.name} ${edge.kind === 'directed' ? '→' : '↔'} ${edge.to.person.name}: ${edge.state}${edge.bond ? ` (${edge.bond})` : ''}`
            : `${edge.from.person.name} & ${edge.to.person.name}: ${edge.interactionsCount ? `${edge.interactionsCount} interactions` : `${edge.sharedScenes} shared scenes`}`;
          const ariaLabel = edge.state
            ? `${edge.from.person.name} and ${edge.to.person.name}: ${edge.state}. Show relationship history`
            : `${edge.from.person.name} and ${edge.to.person.name}: ${pillText}. Show connection details`;
          return <button
            type="button"
            key={`label-${edge.id}`}
            title={tooltip}
            aria-pressed={isSelected}
            aria-label={ariaLabel}
            onMouseEnter={() => setHoveredPair(edge.pairKey)}
            onMouseLeave={() => setHoveredPair('')}
            onClick={() => setPair(isSelected ? '' : edge.pairKey)}
            style={{
              position: 'absolute',
              left: pct(geom.lx, WIDTH),
              top: pct(geom.ly, HEIGHT),
              transform: 'translate(-50%, -50%)',
              zIndex: isSelected ? 6 : 5,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              minHeight: 0,
              padding: isWideGraph ? '3px 8px' : '2px 6px',
              borderRadius: 'var(--radius-sm)',
              border: `1px ${edge.kind === 'interaction' ? 'dashed' : 'solid'} ${isSelected && style ? style.stroke : 'var(--color-border)'}`,
              background: isSelected && style ? style.tint : 'var(--color-background-surface)',
              color: isSelected && style ? style.ink : 'var(--color-text-primary)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 500,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1.25,
              whiteSpace: 'nowrap',
              cursor: 'pointer'
            }}
          >
            {style && <svg width="6" height="6" viewBox="0 0 6 6" aria-hidden="true" style={{ flexShrink: 0 }}>
              <circle cx="3" cy="3" r="3" fill={style.stroke} />
            </svg>}
            {pillText}
          </button>;
        })}

        {placed.map(({ person: item, x, y }) => {
          const isCentre = mode === 'focus' && item.id === person.id;
          const isSelected = item.id === person.id;
          const links = linkCount(item.id);
          const avatarSize = isWideGraph
            ? (isCentre ? 72 : mode === 'focus' ? 60 : 48)
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
              gap: '6px',
              padding: '4px',
              minHeight: 0,
              border: 'none',
              background: 'transparent',
              textAlign: 'center',
              cursor: 'pointer',
              maxWidth: isWideGraph ? (mode === 'cast' ? '148px' : '172px') : '114px'
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
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                background: 'color-mix(in srgb, var(--color-background-surface) 92%, transparent)'
              }}
            >
              <Text weight="semibold" size={isWideGraph ? (isCentre ? 'base' : 'sm') : 'xsm'} style={{ whiteSpace: 'nowrap' }}>{item.name}</Text>
              <Text type="supporting" color="secondary" size="xsm" style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {item.role || 'Character'}{mode === 'cast' ? ` · ${links} link${links === 1 ? '' : 's'}` : ''}
              </Text>
              <CanonBadge id={item.id} states={states} />
            </VStack>
          </button>;
        })}
      </Card>

      <HStack gap={4} align="center" justify="between" wrap="wrap">
        <HStack gap={4} align="center" wrap="wrap" aria-label="Relationship key">
          {RELATIONSHIPS.filter(state => usedStates.has(state)).map(state => <HStack as="span" key={state} gap={1.5} align="center">
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
          {hasScenePartnerEdges && <HStack as="span" gap={1.5} align="center">
            <Card
              padding={0}
              aria-hidden="true"
              style={{
                width: '22px',
                height: '0px',
                border: 'none',
                borderTop: '2px dashed var(--color-border-emphasized)',
                borderRadius: 0
              }}
            />
            <Text type="supporting" color="secondary">Shared scenes</Text>
          </HStack>}
        </HStack>
        {mode === 'focus' && unlinked > 0 && <Text type="supporting" color="secondary">
          {unlinked} other character{unlinked === 1 ? '' : 's'} not yet connected to {shortName(person.name)}
        </Text>}
      </HStack>

      {!visualEdges.length && <Text type="supporting" color="secondary">No connections in this view. Add a relationship or scan scripts to map who interacts with whom.</Text>}

      {visibleFormalEdges.length > 0 && <Collapsible
        defaultIsOpen={false}
        trigger={<HStack gap={2} align="center">
          <Glyph icon={BookOpen} color="secondary" />
          <Text weight="medium">Relationship sources</Text>
          <Badge variant="neutral" label={String(visibleFormalEdges.length)} />
        </HStack>}
      >
        <VStack as="ul" gap={0} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {visibleFormalEdges.map((edge, idx) => {
            const p0 = characters.find(item => item.id === edge.participants[0]);
            const p1 = characters.find(item => item.id === edge.participants[1]);
            const title = edge.direction === 'directed' && p0 && p1
              ? `${p0.name} → ${p1.name}`
              : [p0?.name, p1?.name].filter(Boolean).join(' ↔ ');
            return <VStack as="li" key={edge.id} gap={0} style={{ listStyle: 'none' }}>
              {idx > 0 && <Divider />}
              <Item
                density="compact"
                label={<HStack gap={2} align="center" wrap="wrap">
                  <Link onClick={() => setPair(pairKey(edge.participants))}>
                    <Text weight="semibold">{title}</Text>
                  </Link>
                  {stateTag(edge)}
                </HStack>}
                description={edge.title}
                endContent={<HStack gap={1.5} align="center">
                  <SourceButton project={project} source={edge.source} onOpen={onOpen} />
                  {onEdit && <Button size="sm" variant="ghost" label="Edit" onClick={() => onEdit(edge)} />}
                </HStack>}
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

  const renderConnectionRow = (conn: PairConnection, idx: number) => {
    const isMutualOnly = !conn.asymmetric && Boolean(conn.mutual);
    const metaParts: string[] = [];
    if (conn.bond) metaParts.push(conn.bond);
    if (conn.interactions.length > 0) metaParts.push(`${conn.interactions.length} interaction${conn.interactions.length === 1 ? '' : 's'}`);
    if (conn.sharedScenes > 0) metaParts.push(`${conn.sharedScenes} shared scene${conn.sharedScenes === 1 ? '' : 's'}`);
    return <VStack as="li" key={conn.pairKey} gap={0} style={{ listStyle: 'none' }}>
      {idx > 0 && <Divider />}
      <VStack gap={1.5} style={{ paddingBlock: 'var(--spacing-2-5, 10px)' }}>
        <HStack gap={2} align="center" justify="between" wrap="wrap">
          <HStack gap={2} align="center" style={{ minWidth: 0, flex: 1 }}>
            <CharacterAvatar project={project} character={conn.other} size={32} decorative />
            <VStack gap={0} style={{ minWidth: 0 }}>
              <Link onClick={() => setPair(conn.pairKey)}>
                <Text weight="semibold" size="sm">{conn.other.name}</Text>
              </Link>
              <Text type="supporting" color="secondary" size="xsm" maxLines={1}>
                {metaParts.join(' · ') || conn.other.role || 'Connected character'}
              </Text>
            </VStack>
          </HStack>
          <HStack gap={1} align="center">
            {!conn.primaryState && onCreatePoint && person && (
              <Button
                size="sm"
                variant="ghost"
                label="Set type"
                onClick={() => onCreatePoint({
                  kind: 'relationship',
                  participants: [person.id, conn.other.id],
                  direction: 'mutual',
                  source: conn.firstSharedSource
                })}
              />
            )}
            <Button size="sm" variant="ghost" label="Inspect" onClick={() => setPair(conn.pairKey)} />
          </HStack>
        </HStack>

        {/* Show BOTH directions clearly with restrained semantic dots */}
        <HStack gap={1.5} align="center" wrap="wrap">
          {isMutualOnly && conn.mutual?.relationship && (
            <QuietDotTag
              dotColor={relationshipStyle[conn.mutual.relationship].stroke}
              label={`↔ ${conn.mutual.relationship}${conn.bond ? ` · ${conn.bond}` : ''}`}
            />
          )}
          {conn.asymmetric && person && <>
            {conn.outgoing?.relationship && (
              <QuietDotTag
                dotColor={relationshipStyle[conn.outgoing.relationship].stroke}
                label={`${shortName(person.name)} → ${shortName(conn.other.name)}: ${conn.outgoing.relationship}`}
              />
            )}
            {conn.incoming?.relationship && (
              <QuietDotTag
                dotColor={relationshipStyle[conn.incoming.relationship].stroke}
                label={`${shortName(conn.other.name)} → ${shortName(person.name)}: ${conn.incoming.relationship}`}
              />
            )}
            {conn.mutual?.relationship && !conn.outgoing && !conn.incoming && (
              <QuietDotTag
                dotColor={relationshipStyle[conn.mutual.relationship].stroke}
                label={`↔ ${conn.mutual.relationship}`}
              />
            )}
          </>}
          {!conn.primaryState && (
            <QuietDotTag label="Relationship type not set" />
          )}
        </HStack>
      </VStack>
    </VStack>;
  };

  const inspectorPanel = selectedSummary && pairPeople.length === 2 ? (
    <Card role="complementary" aria-label="Relationship history" padding={5} elevation="low">
      <VStack gap={4}>
        <HStack gap={3} justify="between" align="start">
          <HStack gap={3} align="center">
            <HStack gap={1} align="center">
              {pairPeople.map(item => <CharacterAvatar key={item.id} project={project} character={item} size={40} decorative />)}
            </HStack>
            <VStack gap={0.5}>
              <Heading level={2}>{pairPeople.map(item => shortName(item.name)).join(' & ')}</Heading>
              <HStack gap={1.5} align="center" wrap="wrap">
                {selectedSummary.bond && <QuietDotTag label={selectedSummary.bond} />}
                <Text type="supporting" color="secondary" size="xsm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {selectedTurns.length > 0
                    ? `${selectedTurns.length} turn${selectedTurns.length === 1 ? '' : 's'}`
                    : 'No formal relationship yet'}
                  {selectedSummary.sharedScenes > 0 ? ` · ${selectedSummary.sharedScenes} shared scene${selectedSummary.sharedScenes === 1 ? '' : 's'}` : ''}
                </Text>
              </HStack>
            </VStack>
          </HStack>
          <IconButton variant="ghost" label="Close relationship history" icon={<Glyph icon={X} />} onClick={() => setPair('')} />
        </HStack>

        {/* Both-ways stance summary card */}
        <Card variant="muted" padding={3}>
          <VStack gap={2}>
            <HStack gap={1.5} align="center">
              <Glyph icon={ArrowLeftRight} size="xsm" color="secondary" />
              <Text type="label" color="secondary">Both sides of this relationship</Text>
            </HStack>
            {selectedSummary.asymmetric ? (
              <VStack gap={1.5}>
                <HStack gap={2} align="center" justify="between" wrap="wrap">
                  <Text size="sm" weight="medium">{shortName(selectedSummary.a.name)} → {shortName(selectedSummary.b.name)}</Text>
                  {selectedSummary.aToB?.relationship ? (
                    <QuietDotTag dotColor={relationshipStyle[selectedSummary.aToB.relationship].stroke} label={selectedSummary.aToB.relationship} />
                  ) : onCreatePoint ? (
                    <Button size="sm" variant="ghost" label="Set stance" onClick={() => onCreatePoint({
                      kind: 'relationship',
                      participants: [selectedSummary.a.id, selectedSummary.b.id],
                      direction: 'directed',
                      bond: selectedSummary.bond,
                      source: selectedSummary.firstSharedSource
                    })} />
                  ) : <Text type="supporting" color="secondary" size="xsm">Not set</Text>}
                </HStack>
                <HStack gap={2} align="center" justify="between" wrap="wrap">
                  <Text size="sm" weight="medium">{shortName(selectedSummary.b.name)} → {shortName(selectedSummary.a.name)}</Text>
                  {selectedSummary.bToA?.relationship ? (
                    <QuietDotTag dotColor={relationshipStyle[selectedSummary.bToA.relationship].stroke} label={selectedSummary.bToA.relationship} />
                  ) : onCreatePoint ? (
                    <Button size="sm" variant="ghost" label="Set reverse" onClick={() => onCreatePoint({
                      kind: 'relationship',
                      participants: [selectedSummary.b.id, selectedSummary.a.id],
                      direction: 'directed',
                      bond: selectedSummary.bond,
                      source: selectedSummary.firstSharedSource
                    })} />
                  ) : <Text type="supporting" color="secondary" size="xsm">Not set</Text>}
                </HStack>
              </VStack>
            ) : selectedSummary.mutual?.relationship ? (
              <HStack gap={2} align="center" justify="between" wrap="wrap">
                <Text size="sm" weight="medium">
                  {shortName(selectedSummary.a.name)} ↔ {shortName(selectedSummary.b.name)} (Mutual)
                </Text>
                <QuietDotTag dotColor={relationshipStyle[selectedSummary.mutual.relationship].stroke} label={selectedSummary.mutual.relationship} />
              </HStack>
            ) : (
              <Text type="supporting" color="secondary" size="xsm">
                Connected through {selectedSummary.interactions.length ? `${selectedSummary.interactions.length} recorded interaction${selectedSummary.interactions.length === 1 ? '' : 's'}` : `${selectedSummary.sharedScenes} shared script scene${selectedSummary.sharedScenes === 1 ? '' : 's'}`}. Define their relationship type below.
              </Text>
            )}
          </VStack>
        </Card>

        {onCreatePoint && (
          <HStack gap={2} wrap="wrap">
            <Button
              size="sm"
              variant="primary"
              icon={<Glyph icon={Plus} size="xsm" />}
              label={selectedTurns.length > 0 ? 'Add relationship turn' : 'Set relationship'}
              onClick={() => onCreatePoint({
                kind: 'relationship',
                participants: [selectedSummary.a.id, selectedSummary.b.id],
                direction: selectedSummary.asymmetric ? 'directed' : 'mutual',
                bond: selectedSummary.bond,
                source: selectedSummary.firstSharedSource
              })}
            />
            <Button
              size="sm"
              variant="secondary"
              icon={<Glyph icon={MessageSquare} size="xsm" />}
              label="Log interaction"
              onClick={() => onCreatePoint({
                kind: 'interaction',
                participants: [selectedSummary.a.id, selectedSummary.b.id],
                source: selectedSummary.firstSharedSource
              })}
            />
          </HStack>
        )}

        {selectedTurns.length > 0 && (
          <VStack as="ol" gap={3} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {selectedTurns.map(({ point, previous }, idx) => {
              const state = point.relationship ?? 'Trust';
              const fromChar = characters.find(c => c.id === point.participants[0]);
              const toChar = characters.find(c => c.id === point.participants[1]);
              const dirLabel = point.direction === 'directed' && fromChar && toChar
                ? `${shortName(fromChar.name)} → ${shortName(toChar.name)}`
                : 'Mutual ↔';
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
                    {code(point)}{point.direction === 'directed' ? ` · ${dirLabel}` : ''}{previous && previous !== point.relationship ? ` · from ${previous}` : ''}
                  </Text>
                  <HStack gap={1} align="center" wrap="wrap">
                    {stateTag(point)}
                    <CanonBadge id={point.id} states={states} />
                  </HStack>
                  <Text weight="semibold">{point.title}</Text>
                  {point.detail && <Text type="supporting" color="secondary">{point.detail}</Text>}
                  <HStack gap={2} align="center" wrap="wrap">
                    <SourceButton project={project} source={point.source} onOpen={onOpen} />
                    {onEdit && <Button size="sm" variant="ghost" label="Edit" onClick={() => onEdit(point)} />}
                  </HStack>
                </VStack>
              </HStack>;
            })}
          </VStack>
        )}

        <Divider />
        <VStack gap={2}>
          <Heading level={3}>Interactions between them</Heading>
          <PointRows
            rows={pairInteractions}
            project={project}
            onOpen={onOpen}
            onEdit={onEdit}
            states={states}
            compact
            empty="No recorded interactions between them in this view."
          />
          {selectedSummary.sharedScenes > 0 && selectedSummary.firstSharedSource && !pairInteractions.length && (
            <HStack gap={2} align="center" justify="between" wrap="wrap">
              <Text type="supporting" color="secondary" size="xsm">
                They speak together in {selectedSummary.sharedScenes} script scene{selectedSummary.sharedScenes === 1 ? '' : 's'}.
              </Text>
              <SourceButton project={project} source={selectedSummary.firstSharedSource} onOpen={onOpen} label="First shared scene" />
            </HStack>
          )}
        </VStack>

        <HStack gap={2} wrap="wrap">
          {pairPeople.map(item => <Button
            key={item.id}
            size="sm"
            variant="ghost"
            label={`Open ${shortName(item.name)}`}
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
                <Heading level={2}>{person.name}</Heading>
                <Text type="supporting" color="secondary">
                  {[person.role || 'Character', person.billing, person.status && person.status !== 'Active' ? person.status : undefined].filter((value, idx, list) => Boolean(value) && list.indexOf(value) === idx).join(' · ')}
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
            <SegmentedControlItem value="Connections" label="Links" />
            <SegmentedControlItem value="Overview" label="Info" />
            <SegmentedControlItem value="Journey" label="Arc" />
            <SegmentedControlItem value="Scenes" label="Scenes" />
            <SegmentedControlItem value="Notes" label="Notes" />
          </SegmentedControl>

          {inspectorTab === 'Connections' && <VStack gap={3}>
            <HStack gap={2} align="center" justify="between" wrap="wrap">
              <HStack gap={1.5} align="center">
                <Glyph icon={Users} size="xsm" color="accent" />
                <Heading level={4}>Everyone {shortName(person.name)} interacts with</Heading>
              </HStack>
              {onCreatePoint && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Glyph icon={Plus} size="xsm" />}
                  label="Add link"
                  onClick={() => onCreatePoint({ kind: 'relationship', participants: [person.id], direction: 'mutual' })}
                />
              )}
            </HStack>
            {connections.length > 0 ? (
              <VStack as="ul" gap={0} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {connections.map((conn, idx) => renderConnectionRow(conn, idx))}
              </VStack>
            ) : (
              <Text type="supporting" color="secondary">
                No relationships, interactions, or shared scenes recorded for {shortName(person.name)} in this view yet.
              </Text>
            )}
          </VStack>}

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
                {interactions.slice(0, 4).map((item, idx) => {
                  const partner = item.participants.map(id => characters.find(c => c.id === id)).find(c => c && c.id !== person.id);
                  return <VStack as="li" key={item.id} gap={0} style={{ listStyle: 'none' }}>
                    {idx > 0 && <Divider />}
                    <Item
                      density="compact"
                      label={<Text weight="semibold" size="sm">{partner ? `With ${shortName(partner.name)}` : item.title}</Text>}
                      description={<VStack gap={0.5} hAlign="start">
                        <Text type="supporting" color="secondary">{item.title}</Text>
                        <SourceButton project={project} source={item.source} onOpen={onOpen} />
                      </VStack>}
                      endContent={<EpisodeChip project={project} episodeId={item.source.episodeId} source={item.source} color="blue" />}
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
                    <HStack gap={2} align="center" style={{ minWidth: 0, flex: 1 }}>
                      <HStack as="span" style={{ flexShrink: 0 }}>
                        <EpisodeChip project={project} episodeId={item.source.episodeId} source={item.source} color={item.kind === 'arc' ? 'purple' : 'blue'} />
                      </HStack>
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
              onEdit={onEdit}
              states={states}
              compact
              empty="No arc milestones recorded in this view."
            />
            {personStats && personStats.openQuestions > 0 && <>
              <Divider />
              <HStack gap={2} align="center">
                <Glyph icon={Flag} size="xsm" color="warning" />
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
              onEdit={onEdit}
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
                {person.aliases.map(alias => <QuietDotTag key={alias} label={alias} />)}
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
