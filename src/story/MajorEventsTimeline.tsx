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
import { episodeCode, orderedEpisodes } from './source';
import { Glyph, Pane, SourceButton } from './StoryControls';
import { CanonBadge, CharacterAvatar } from './StoryParts';
import type { CanonLookup, TokenColor } from './StoryParts';

const BEAT_TONES: Array<{ dot: string; token: TokenColor }> = [
  { dot: 'var(--color-accent)', token: 'blue' },
  { dot: 'var(--color-success)', token: 'green' },
  { dot: 'var(--color-warning)', token: 'orange' },
  { dot: 'var(--color-error)', token: 'red' }
];

/**
 * Connected series timeline beneath the Relationship Web: lets writers scan major story beats
 * in reveal order or story time, filter by character, and jump straight to the cited script line.
 */
export function MajorEventsTimeline({
  project,
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
  const episodes = orderedEpisodes(project);
  const episodeMap = new Map(episodes.map(item => [item.id, item]));
  const personMap = new Map(characters.map(item => [item.id, item]));

  const filtered = filterPersonId
    ? events.filter(point => point.participants.includes(filterPersonId))
    : events;
  const visible = filtered.slice(0, 8);

  return <Pane label="Major events timeline" padding={5}>
    <HStack gap={3} justify="between" align="center" wrap="wrap">
      <HStack gap={2} align="center">
        <Glyph icon={CalendarClock} color="accent" />
        <Heading level={2}>Major events — Series timeline</Heading>
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
              onPressedChange={() => setFilterPersonId(filterPersonId === person.id ? '' : person.id)}
            >
              {person.name.split(' ')[0]}
            </ToggleButton>
          ))}
        </HStack>
        <SegmentedControl label="Event order" size="sm" value={order} onChange={value => onOrderChange(value as 'reveal' | 'story')}>
          <SegmentedControlItem value="reveal" label="Reveal order" />
          <SegmentedControlItem value="story" label="Story time" />
        </SegmentedControl>
      </HStack>
    </HStack>

    {visible.length > 0 ? <VStack gap={3}>
      {visible.length > 1 && <svg
        viewBox={`0 0 ${visible.length * 120} 24`}
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ width: '100%', height: '24px', display: 'block' }}
      >
        <line
          x1="60"
          y1="12"
          x2={visible.length * 120 - 60}
          y2="12"
          stroke="var(--color-border-emphasized)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        {visible.map((point, index) => {
          const isFlashback = flashbackFlags.has(point.id);
          const color = isFlashback ? 'var(--color-warning)' : BEAT_TONES[index % BEAT_TONES.length].dot;
          return <circle
            key={point.id}
            cx={index * 120 + 60}
            cy="12"
            r="6"
            fill={color}
            stroke="var(--color-background-surface)"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
          />;
        })}
      </svg>}

      <Grid columns={{ minWidth: 215, repeat: 'fit' }} gap={3}>
        {visible.map((point, index) => {
          const episode = point.source.episodeId ? episodeMap.get(point.source.episodeId) : undefined;
          const isFlashback = flashbackFlags.has(point.id);
          const tone = isFlashback ? { dot: 'var(--color-warning)', token: 'yellow' as TokenColor } : BEAT_TONES[index % BEAT_TONES.length];
          const participants = point.participants
            .map(id => personMap.get(id))
            .filter((item): item is Character => Boolean(item));
          return <Card role="article" key={point.id} variant="muted" padding={3}>
            <VStack gap={2} minHeight="100%" justify="between">
              <VStack gap={1.5} hAlign="start">
                <HStack gap={1.5} align="center" wrap="wrap">
                  <Token size="sm" color={tone.token} label={episode ? episodeCode(episode) : 'Script'} />
                  {isFlashback && <Token size="sm" color="yellow" label="Revealed out of order" />}
                  <CanonBadge id={point.id} states={states} />
                </HStack>
                <Heading level={4}>{point.title}</Heading>
                {point.detail && <Text type="supporting" color="secondary" maxLines={2}>{point.detail}</Text>}
              </VStack>

              <VStack gap={1.5} hAlign="start">
                {participants.length > 0 && <HStack gap={1} align="center">
                  {participants.slice(0, 3).map(person => (
                    <CharacterAvatar key={person.id} project={project} character={person} size={24} decorative />
                  ))}
                  <Text type="supporting" color="secondary" size="xsm">
                    {participants.map(person => person.name.split(' ')[0]).join(', ')}
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
    </VStack> : <Text type="supporting" color="secondary">No events in this view.</Text>}
  </Pane>;
}
