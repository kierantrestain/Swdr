import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Text } from '@astryxdesign/core/Text';
import { ToggleButton } from '@astryxdesign/core/ToggleButton';
import { VStack } from '@astryxdesign/core/VStack';
import { ArrowRight, CalendarClock } from 'lucide-react';
import { useState } from 'react';
import type { Project, WorkspaceViewProps } from '../model';
import type { Character, StoryPoint } from './series-model';
import type { StoryStructure } from './story-profile';
import { Choice, Glyph, Pane, SourceButton } from './StoryControls';
import { CanonBadge, CharacterAvatar, QuietDotTag } from './StoryParts';
import type { CanonLookup } from './StoryParts';

/**
 * Editorial Story Beat Rail sitting beneath the Relationship Web:
 * neutral timeline track with tabular unit codes, highlighting only flashbacks in amber
 * so the writer's eye goes straight to chronology and narrative turns.
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
  onEdit,
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
  onEdit?: (point: StoryPoint) => void;
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
        <Glyph icon={CalendarClock} color="secondary" />
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
          {characters.slice(0, 6).map(person => (
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
        {characters.length > 6 && (
          <Choice
            label="More characters"
            isLabelHidden
            size="sm"
            width={156}
            value={characters.slice(6).some(c => c.id === filterPersonId) ? filterPersonId : ''}
            onChange={setFilterPersonId}
            options={[{ value: '', label: `More (${characters.length - 6})…` }, ...characters.slice(6).map(person => ({ value: person.id, label: person.name }))]}
          />
        )}
        <SegmentedControl label="Timeline order" size="sm" value={order} onChange={value => onOrderChange(value as 'reveal' | 'story')}>
          <SegmentedControlItem value="reveal" label="Reveal order" />
          <SegmentedControlItem value="story" label="Story time" />
        </SegmentedControl>
      </HStack>
    </HStack>

    {visible.length > 0 ? <VStack gap={3}>
      {/* Calm editorial timeline rail: neutral markers, amber only on out-of-order flashbacks */}
      {visible.length > 1 && <svg
        viewBox={`0 0 ${visible.length * 100} 18`}
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ width: '100%', height: '18px', display: 'block' }}
      >
        <line
          x1="50"
          y1="9"
          x2={visible.length * 100 - 50}
          y2="9"
          stroke="var(--color-border)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        {visible.map((point, idx) => {
          const isFlashback = flashbackFlags.has(point.id);
          return <circle
            key={point.id}
            cx={idx * 100 + 50}
            cy="9"
            r={isFlashback ? '5' : '4'}
            fill={isFlashback ? 'var(--color-warning)' : 'var(--color-text-primary)'}
            stroke="var(--color-background-surface)"
            strokeWidth="2"
          />;
        })}
      </svg>}

      <Grid columns={{ minWidth: 220, repeat: 'fit' }} gap={3}>
        {visible.map(point => {
          const unitLabel = structure.unitCodeOfSource(point.source);
          const participants = point.participants
            .map(id => personMap.get(id))
            .filter((item): item is Character => Boolean(item));
          const isFlashback = flashbackFlags.has(point.id);
          return <Card key={point.id} padding={3} role="article" style={{ background: 'var(--color-background-surface)', border: '1px solid var(--color-border)' }}>
            <VStack gap={2} hAlign="start" style={{ height: '100%' }}>
              <HStack gap={1.5} align="center" wrap="wrap">
                <QuietDotTag label={unitLabel} mono />
                {isFlashback && <QuietDotTag label="Flashback" dotColor="var(--color-warning)" />}
                <CanonBadge id={point.id} states={states} />
              </HStack>
              <Text weight="semibold" size="sm">{point.title}</Text>
              {point.detail && <Text type="supporting" color="secondary" size="xsm" maxLines={2}>{point.detail}</Text>}
              <VStack gap={1.5} hAlign="start" style={{ marginTop: 'auto', paddingTop: 'var(--spacing-1)', width: '100%' }}>
                {participants.length > 0 && <HStack gap={1.5} align="center">
                  {participants.slice(0, 3).map(person => (
                    <CharacterAvatar key={person.id} project={project} character={person} size={24} decorative />
                  ))}
                  <Text type="supporting" color="secondary" size="xsm" maxLines={1}>
                    {participants.map(p => p.name.split(' ')[0]).join(', ')}
                  </Text>
                </HStack>}
                <HStack gap={2} align="center" justify="between" style={{ width: '100%' }}>
                  <SourceButton project={project} source={point.source} onOpen={onOpen} />
                  {onEdit && <Button size="sm" variant="ghost" label="Edit" onClick={() => onEdit(point)} />}
                </HStack>
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
