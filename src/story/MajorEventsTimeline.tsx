import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Text } from '@astryxdesign/core/Text';
import { ToggleButton } from '@astryxdesign/core/ToggleButton';
import { Token } from '@astryxdesign/core/Token';
import { VStack } from '@astryxdesign/core/VStack';
import { ArrowRight, CalendarClock } from 'lucide-react';
import { useState } from 'react';
import type { Project, WorkspaceViewProps } from '../model';
import type { Character, StoryPoint } from './series-model';
import type { StoryStructure } from './story-profile';
import { Glyph, Pane, SourceButton } from './StoryControls';
import { CanonBadge, CharacterAvatar } from './StoryParts';
import type { CanonLookup } from './StoryParts';

const DOT_PALETTE = [
  { color: 'var(--color-accent)', token: 'blue' as const },
  { color: 'var(--color-success)', token: 'green' as const },
  { color: 'var(--color-warning)', token: 'yellow' as const },
  { color: 'var(--color-error)', token: 'red' as const }
];

/**
 * Connected horizontal timeline strip sitting beneath the Relationship Web:
 * lets writers filter major story events/beats by character and jump straight to the cited script line.
 */
export function MajorEventsTimeline({
  project,
  structure,
  events,
  characters,
  order,
  onOrderChange,
  flashbackFlags,
  states,
  onOpen,
  onOpenLedger
}: {
  project: Project;
  structure: StoryStructure;
  events: StoryPoint[];
  characters: Character[];
  order: 'reveal' | 'story';
  onOrderChange: (value: 'reveal' | 'story') => void;
  flashbackFlags: Map<string, string>;
  states: CanonLookup;
  onOpen: WorkspaceViewProps['onOpenSource'];
  onOpenLedger: () => void;
}) {
  const [filterPersonId, setFilterPersonId] = useState('');
  const personMap = new Map(characters.map(item => [item.id, item]));

  const filtered = filterPersonId
    ? events.filter(point => point.participants.includes(filterPersonId))
    : events;
  const visible = filtered.slice(0, 8);

  return <Pane label="Major events timeline" padding={5}>
    <HStack gap={3} justify="between" align="center" wrap="wrap">
      <HStack gap={2} align="center">
        <Glyph icon={CalendarClock} color="accent" />
        <Heading level={2}>{structure.terms.timelineTitle}</Heading>
        <Badge variant="neutral" label={String(filtered.length)} />
      </HStack>
      <HStack gap={2} align="center" wrap="wrap">
        <HStack gap={1} align="center" wrap="wrap" role="group" aria-label="Filter major events by character">
          <ToggleButton
            size="sm"
            label="All events"
            isPressed={!filterPersonId}
            onPressedChange={() => setFilterPersonId('')}
          >
            All events
          </ToggleButton>
          {characters.slice(0, 5).map(person => (
            <ToggleButton
              key={person.id}
              size="sm"
              label={person.name.split(' ')[0]}
              isPressed={filterPersonId === person.id}
              onPressedChange={pressed => setFilterPersonId(pressed ? person.id : '')}
            >
              {person.name.split(' ')[0]}
            </ToggleButton>
          ))}
        </HStack>
        <SegmentedControl label="Timeline order" size="sm" value={order} onChange={value => onOrderChange(value as 'reveal' | 'story')}>
          <SegmentedControlItem value="reveal" label="Reveal order" />
          <SegmentedControlItem value="story" label="Story time" />
        </SegmentedControl>
      </HStack>
    </HStack>

    {visible.length > 0 ? <VStack gap={3}>
      {/* Connected horizontal timeline rail */}
      {visible.length > 1 && <svg
        viewBox={`0 0 ${visible.length * 100} 20`}
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ width: '100%', height: '20px', display: 'block' }}
      >
        <line
          x1="50"
          y1="10"
          x2={visible.length * 100 - 50}
          y2="10"
          stroke="var(--color-border-emphasized)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        {visible.map((point, idx) => {
          const swatch = DOT_PALETTE[idx % DOT_PALETTE.length];
          return <circle
            key={point.id}
            cx={idx * 100 + 50}
            cy="10"
            r="5.5"
            fill={swatch.color}
            stroke="var(--color-background-surface)"
            strokeWidth="2.5"
          />;
        })}
      </svg>}

      <Grid columns={{ minWidth: 210, repeat: 'fit' }} gap={3}>
        {visible.map((point, idx) => {
          const swatch = DOT_PALETTE[idx % DOT_PALETTE.length];
          const unitLabel = structure.unitCodeOfSource(point.source);
          const participants = point.participants
            .map(id => personMap.get(id))
            .filter((item): item is Character => Boolean(item));
          const isFlashback = flashbackFlags.has(point.id);
          return <Card key={point.id} variant="muted" padding={3} role="article">
            <VStack gap={2} hAlign="start" style={{ height: '100%' }}>
              <HStack gap={1.5} align="center" wrap="wrap">
                <Token size="sm" color={swatch.token} label={unitLabel} />
                {isFlashback && <Token size="sm" color="yellow" label="Revealed out of order" />}
                <CanonBadge id={point.id} states={states} />
              </HStack>
              <Text weight="semibold" size="sm">{point.title}</Text>
              {point.detail && <Text type="supporting" color="secondary" size="xsm" maxLines={2}>{point.detail}</Text>}
              <VStack gap={1.5} hAlign="start" style={{ marginTop: 'auto', paddingTop: 'var(--spacing-1)' }}>
                {participants.length > 0 && <HStack gap={1} align="center">
                  {participants.slice(0, 3).map(person => (
                    <CharacterAvatar key={person.id} project={project} character={person} size={24} decorative />
                  ))}
                  <Text type="supporting" color="secondary" size="xsm" maxLines={1}>
                    {participants.map(p => p.name.split(' ')[0]).join(', ')}
                  </Text>
                </HStack>}
                <SourceButton project={project} source={point.source} onOpen={onOpen} />
              </VStack>
            </VStack>
          </Card>;
        })}
      </Grid>

      {filtered.length > visible.length && <HStack justify="end">
        <Button
          size="sm"
          variant="ghost"
          label={`View all ${filtered.length} events in Event ledger`}
          icon={<Glyph icon={ArrowRight} size="xsm" />}
          onClick={onOpenLedger}
        />
      </HStack>}
    </VStack> : (
      <Text type="supporting" color="secondary">
        {filterPersonId ? 'No major events involve this character in the visible scope.' : 'Record major story beats or events to populate the timeline.'}
      </Text>
    )}
  </Pane>;
}
