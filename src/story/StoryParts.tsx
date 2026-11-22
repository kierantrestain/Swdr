import { Avatar } from '@astryxdesign/core/Avatar';
import { Button } from '@astryxdesign/core/Button';
import { Divider } from '@astryxdesign/core/Divider';
import { HStack } from '@astryxdesign/core/HStack';
import { Item } from '@astryxdesign/core/Item';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { VStack } from '@astryxdesign/core/VStack';
import type { Project, WorkspaceViewProps } from '../model';
import { resolveCharacterPhoto } from './series-analysis';
import type { CanonState } from './series-analysis';
import type { Character, KnowledgeState, RelationshipState, StoryKind, StoryPoint } from './series-model';
import { episodeCode, orderedEpisodes } from './source';
import { storyStructure } from './story-profile';
import { SourceButton } from './StoryControls';

export const typeLabels: Record<StoryKind, string> = {
  event: 'Event',
  appearance: 'Appearance',
  interaction: 'Interaction',
  relationship: 'Relationship state',
  knowledge: 'Knowledge',
  arc: 'Arc milestone'
};

export type TokenColor = 'default' | 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'cyan' | 'blue' | 'purple' | 'pink' | 'gray';

/** Stroke token, dash pattern and Astryx Token colour so every relationship type reads distinctly in light and dark mode. */
export const relationshipStyle: Record<RelationshipState, {
  stroke: string;
  dash?: string;
  width: number;
  tokenColor: TokenColor;
  tint: string;
  ink: string;
}> = {
  Trust: {
    stroke: 'var(--color-accent)',
    width: 2.5,
    tokenColor: 'blue',
    tint: 'var(--color-accent-muted)',
    ink: 'var(--color-text-accent)'
  },
  Alliance: {
    stroke: 'var(--color-success)',
    width: 3,
    tokenColor: 'green',
    tint: 'var(--color-success-muted)',
    ink: 'var(--color-text-success)'
  },
  Romance: {
    stroke: 'var(--color-icon-pink)',
    width: 2.4,
    dash: '10 4 2 4',
    tokenColor: 'pink',
    tint: 'var(--color-background-pink)',
    ink: 'var(--color-text-pink)'
  },
  Conflict: {
    stroke: 'var(--color-error)',
    width: 2.8,
    tokenColor: 'red',
    tint: 'var(--color-error-muted)',
    ink: 'var(--color-text-error)'
  },
  Betrayal: {
    stroke: 'var(--color-text-error)',
    width: 2.8,
    dash: '8 5',
    tokenColor: 'red',
    tint: 'var(--color-error-muted)',
    ink: 'var(--color-text-error)'
  },
  Pressure: {
    stroke: 'var(--color-warning)',
    width: 2.4,
    dash: '4 4',
    tokenColor: 'orange',
    tint: 'var(--color-warning-muted)',
    ink: 'var(--color-text-warning)'
  },
  Distance: {
    stroke: 'var(--color-icon-secondary)',
    width: 2.2,
    dash: '2 6',
    tokenColor: 'gray',
    tint: 'var(--color-background-muted)',
    ink: 'var(--color-text-secondary)'
  }
};

export const knowledgeTokenColor: Record<KnowledgeState, TokenColor> = {
  Confirmed: 'green',
  Unresolved: 'yellow',
  Believes: 'purple',
  Refuted: 'red'
};

export const kindTokenColor: Record<StoryKind, TokenColor> = {
  event: 'blue',
  appearance: 'gray',
  interaction: 'teal',
  relationship: 'cyan',
  knowledge: 'yellow',
  arc: 'purple'
};

export type CanonLookup = Map<string, CanonState> | undefined;

/** Portrait avatar for a series character, resolving uploaded assets, cast photos and built-in portraits with initials fallback. */
export function CharacterAvatar({ project, character, size = 40, shape = 'circle', decorative, highlighted }: {
  project: Project;
  character: Pick<Character, 'name' | 'aliases' | 'photoAssetId' | 'portraitUrl'>;
  size?: 'xsm' | 'sm' | 'md' | 'lg' | 'xl' | 24 | 32 | 36 | 40 | 48 | 60 | 64 | 72 | 96;
  shape?: 'circle' | 'rounded' | 'square';
  decorative?: boolean;
  highlighted?: boolean;
}) {
  const src = resolveCharacterPhoto(project, character);
  const ringStyle = highlighted
    ? {
        display: 'inline-flex',
        borderRadius: shape === 'circle' ? 'var(--radius-full)' : 'var(--radius-container)',
        boxShadow: '0 0 0 3px var(--color-background-surface), 0 0 0 5px var(--color-accent), var(--shadow-med)'
      }
    : { display: 'inline-flex' };
  return <HStack as="span" align="center" aria-hidden={decorative || undefined} style={ringStyle}>
    <Avatar src={src} name={character.name} size={size} shape={shape} tooltip={false} />
  </HStack>;
}

/** Marks records that belong to the working draft or have changed since the latest approved canon. */
export function CanonBadge({ id, states }: { id: string; states: CanonLookup }) {
  const state = states?.get(id);
  if (!state || state === 'approved') return null;
  return <Token
    size="sm"
    color={state === 'draft' ? 'orange' : 'blue'}
    label={state === 'draft' ? 'Draft · not in canon' : 'Changed since canon'}
  />;
}

export interface PointPrefill {
  kind: StoryKind;
  participants?: string[];
  direction?: import('./series-model').RelationshipDirection;
  bond?: string;
  relationship?: RelationshipState;
  source?: import('../model').SourceRef;
  title?: string;
}

/** Semantic tag for a story point's knowledge state, relationship state (with optional bond/direction), or record kind. */
export function stateTag(point: StoryPoint, showKind = false) {
  if (point.knowledge) return <Token size="sm" color={knowledgeTokenColor[point.knowledge]} label={point.knowledge} />;
  if (point.relationship) {
    const dirSymbol = point.direction === 'directed' ? '→ ' : '↔ ';
    const label = point.bond ? `${dirSymbol}${point.relationship} · ${point.bond}` : `${dirSymbol}${point.relationship}`;
    return <Token size="sm" color={relationshipStyle[point.relationship].tokenColor} label={label} />;
  }
  if (showKind) return <Token size="sm" color={kindTokenColor[point.kind]} label={typeLabels[point.kind]} />;
  return null;
}

/** Compact narrative unit chip (e.g. S1E04 for series, Act I · Sc 4 for film, I.2 for stage play). */
export function EpisodeChip({ project, episodeId, source, color = 'blue' }: {
  project: Project;
  episodeId?: string;
  source?: import('../model').SourceRef;
  color?: TokenColor;
}) {
  const episode = episodeId ? orderedEpisodes(project).find(item => item.id === episodeId) : undefined;
  const label = episode
    ? episodeCode(episode)
    : source
      ? storyStructure(project, source.documentId).unitCodeOfSource(source)
      : 'Script';
  return <Token size="sm" color={color} label={label} />;
}

/** Dense structured list of story records using Astryx Item rows and Dividers (never card-wrapped lists). */
export function PointRows({ rows, project, onOpen, onEdit, empty, showKind = false, states, people, flags, compact = false }: {
  rows: StoryPoint[];
  project: Project;
  onOpen: WorkspaceViewProps['onOpenSource'];
  onEdit?: (point: StoryPoint) => void;
  empty: string;
  showKind?: boolean;
  states?: CanonLookup;
  people?: Character[];
  flags?: Map<string, string>;
  compact?: boolean;
}) {
  if (!rows.length) return <Text type="supporting" color="secondary">{empty}</Text>;
  return <VStack as="ul" gap={0} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
    {rows.map((point, index) => {
      const matched = people
        ? point.participants.map(id => people.find(person => person.id === id)).filter((item): item is Character => Boolean(item))
        : [];
      const names = matched.map(person => person.name);
      const summary = [names.join(' · '), point.detail].filter(Boolean).join(' — ');
      const tag = stateTag(point, showKind);
      const flag = flags?.get(point.id);
      const hasCanonBadge = Boolean(states?.get(point.id) && states.get(point.id) !== 'approved');
      return <VStack as="li" key={point.id} gap={0} style={{ listStyle: 'none' }}>
        {index > 0 && <Divider />}
        <Item
          density={compact ? 'compact' : 'balanced'}
          startContent={!compact && matched.length > 0 ? <HStack gap={0.5} align="center">
            {matched.slice(0, 2).map(person => <CharacterAvatar key={person.id} project={project} character={person} size={24} decorative />)}
          </HStack> : undefined}
          label={<VStack gap={1} hAlign="start">
            {(tag || flag || hasCanonBadge) && <HStack gap={1} align="center" wrap="wrap">
              {tag}
              {flag && <Token size="sm" color="yellow" label={flag} />}
              <CanonBadge id={point.id} states={states} />
            </HStack>}
            <Text weight="semibold">{point.title}</Text>
          </VStack>}
          description={summary ? <Text type="supporting" color="secondary">{summary}</Text> : undefined}
          endContent={<HStack gap={2} align="center" wrap="wrap">
            <SourceButton project={project} source={point.source} onOpen={onOpen} />
            {onEdit && <Button size="sm" variant="ghost" label="Edit" onClick={() => onEdit(point)} />}
          </HStack>}
        />
      </VStack>;
    })}
  </VStack>;
}
