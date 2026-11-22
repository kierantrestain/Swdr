import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useState } from 'react';
import type { Project, WorkspaceViewProps } from '../model';
import { sortStory } from './series-model';
import type { StoryPoint, StoryState } from './series-model';
import type { StoryStructure, StoryUnit } from './story-profile';
import { Pane, PaneHeading } from './StoryControls';
import { CharacterAvatar, PointRows } from './StoryParts';
import type { CanonLookup } from './StoryParts';

interface Thread {
  id: string;
  title: string;
  start: number;
  end: number;
  open: boolean;
  records: StoryPoint[];
}

const LANE_COLORS = [
  'var(--color-accent)',
  'var(--color-warning)',
  'var(--color-error)',
  'var(--color-success)',
  'var(--color-icon-purple)'
];

export function ArcTimeline({ project, structure, data, units, onOpen, onEdit, onDossier, states }: {
  project: Project;
  structure: StoryStructure;
  data: StoryState;
  units: StoryUnit[];
  onOpen: WorkspaceViewProps['onOpenSource'];
  onEdit?: (point: StoryPoint) => void;
  onDossier?: (characterId: string) => void;
  states: CanonLookup;
}) {
  const [selected, setSelected] = useState<{ title: string; records: StoryPoint[] }>();
  const columnByUnitId = new Map(units.map((unit, index) => [unit.id, index]));
  const columnOf = (point: StoryPoint) => {
    const unit = structure.unitOfSource(point.source);
    return unit ? columnByUnitId.get(unit.id) : undefined;
  };
  const groupShortOf = (num: number) => structure.groups.find(g => g.number === num)?.shortLabel ?? `${structure.terms.groupLabel[0]}${num}`;
  const count = units.length;

  const rows = data.characters.map(person => {
    const own = sortStory(project, data.points.filter(point => point.participants.includes(person.id)), 'reveal');
    const milestones = own.filter(point => point.kind === 'arc' && columnOf(point) !== undefined);
    const facts = new Map<string, StoryPoint[]>();
    for (const point of own.filter(item => item.kind === 'knowledge' && item.factKey)) {
      const key = point.factKey!.trim().toLowerCase();
      facts.set(key, [...(facts.get(key) ?? []), point]);
    }
    const threads: Thread[] = [];
    for (const [key, records] of facts) {
      const first = records.findIndex(point => point.knowledge === 'Unresolved' || point.knowledge === 'Believes');
      if (first < 0) continue;
      const answer = records.slice(first + 1).find(point => point.knowledge === 'Confirmed' || point.knowledge === 'Refuted');
      const start = columnOf(records[first]);
      if (start === undefined) continue;
      const end = answer ? columnOf(answer) ?? count - 1 : count - 1;
      threads.push({
        id: `${person.id}:${key}`,
        title: records[first].title,
        start,
        end: Math.max(start, end),
        open: !answer,
        records: records.slice(first, answer ? records.indexOf(answer) + 1 : undefined)
      });
    }
    return {
      person,
      milestones,
      threads,
      present: new Set(own.map(columnOf).filter((value): value is number => value !== undefined))
    };
  });

  const lanes = rows.filter(row => row.milestones.length || row.threads.length);
  const quiet = rows.filter(row => !row.milestones.length && !row.threads.length);
  const openCount = lanes.reduce((sum, row) => sum + row.threads.filter(thread => thread.open).length, 0);
  const colTemplate = `repeat(${Math.max(1, count)}, minmax(0, 1fr))`;

  return <Pane label="Arc timeline" padding={5}>
    <PaneHeading
      title="Arc timeline"
      description={`Arc milestones and story questions by reveal ${structure.terms.unitSingular} · ${openCount} question${openCount === 1 ? '' : 's'} still open`}
      level={2}
      actions={<HStack gap={4} align="center" wrap="wrap">
        <HStack as="span" gap={1.5} align="center">
          <Card padding={0} aria-hidden="true" style={{ width: '16px', height: '10px', borderRadius: 'var(--radius-full)', background: 'var(--color-accent-muted)', border: '1px solid var(--color-accent)' }} />
          <Text type="supporting" color="secondary" size="xsm">Milestone</Text>
        </HStack>
        <HStack as="span" gap={1.5} align="center">
          <Card padding={0} aria-hidden="true" style={{ width: '16px', height: '10px', borderRadius: 'var(--radius-full)', background: 'var(--color-warning-muted)', border: '1.5px dashed var(--color-warning)' }} />
          <Text type="supporting" color="secondary" size="xsm">Open question</Text>
        </HStack>
        <HStack as="span" gap={1.5} align="center">
          <Card padding={0} aria-hidden="true" style={{ width: '16px', height: '10px', borderRadius: 'var(--radius-full)', background: 'var(--color-success-muted)', border: '1px solid var(--color-success)' }} />
          <Text type="supporting" color="secondary" size="xsm">Answered</Text>
        </HStack>
      </HStack>}
    />

    {lanes.length > 0 && count > 0 ? <VStack style={{ overflowX: 'auto' }}>
      <VStack gap={0} style={{ minWidth: `${Math.max(700, 196 + count * (structure.bucketed ? 54 : 32))}px` }}>
        {/* Narrative unit axis */}
        <Grid columns={1} style={{ gridTemplateColumns: '196px minmax(0, 1fr)', alignItems: 'end', paddingBottom: 'var(--spacing-2)' }}>
          <Text type="supporting" color="secondary" size="xsm" weight="semibold">Character</Text>
          <Grid columns={count} gap={0} style={{ gridTemplateColumns: colTemplate }} aria-hidden="true">
            {units.map(unit => (
              <VStack
                key={unit.id}
                gap={0}
                hAlign="center"
                style={{
                  borderLeft: unit.isGroupStart ? '2px solid var(--color-border-emphasized)' : undefined,
                  paddingTop: 'var(--spacing-0-5)'
                }}
              >
                <Text size="xsm" weight="semibold" color={unit.isGroupStart ? 'primary' : 'secondary'}>
                  {unit.isGroupStart ? groupShortOf(unit.groupNumber) : '\u00a0'}
                </Text>
                <Text size="xsm" color="secondary">{unit.shortAxis}</Text>
              </VStack>
            ))}
          </Grid>
        </Grid>

        {/* Character arc lanes */}
        {lanes.map(({ person, milestones, threads, present }, laneIdx) => {
          const laneStroke = LANE_COLORS[laneIdx % LANE_COLORS.length];
          const presentIndices = [...present].sort((a, b) => a - b);
          return <VStack key={person.id} gap={0}>
            <Divider />
            <Grid
              role="group"
              aria-label={`${person.name} arc`}
              columns={1}
              style={{ gridTemplateColumns: '196px minmax(0, 1fr)', paddingBlock: 'var(--spacing-3)', alignItems: 'start' }}
            >
              <HStack gap={2} align="center" style={{ paddingRight: 'var(--spacing-2)' }}>
                <CharacterAvatar project={project} character={person} size={32} decorative />
                <VStack gap={0} style={{ minWidth: 0 }}>
                  {onDossier ? (
                    <button
                      type="button"
                      onClick={() => onDossier(person.id)}
                      style={{
                        padding: 0, minHeight: 0, border: 'none', background: 'transparent',
                        textAlign: 'left', cursor: 'pointer'
                      }}
                    >
                      <Text weight="semibold" size="sm" maxLines={1}>{person.name}</Text>
                    </button>
                  ) : (
                    <Text weight="semibold" size="sm" maxLines={1}>{person.name}</Text>
                  )}
                  <Text type="supporting" color="secondary" size="xsm" maxLines={1}>{person.role}</Text>
                </VStack>
              </HStack>

              <VStack gap={1.5}>
                {/* Connected presence & arc curve rail */}
                <HStack style={{ position: 'relative', width: '100%', height: '18px' }} aria-hidden="true">
                  <svg
                    viewBox={`0 0 ${count * 40} 18`}
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '18px', display: 'block' }}
                  >
                    <line x1="20" y1="9" x2={count * 40 - 20} y2="9" stroke="var(--color-border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                    {presentIndices.length > 1 && (
                      <polyline
                        fill="none"
                        stroke={laneStroke}
                        strokeWidth="2"
                        opacity="0.55"
                        vectorEffect="non-scaling-stroke"
                        points={presentIndices.map(idx => `${idx * 40 + 20},9`).join(' ')}
                      />
                    )}
                  </svg>
                  <Grid columns={count} gap={0} style={{ gridTemplateColumns: colTemplate, position: 'relative', width: '100%', height: '18px', alignItems: 'center', justifyItems: 'center' }}>
                    {units.map((unit, idx) => {
                      const isMilestone = milestones.some(point => columnOf(point) === idx);
                      const isPresent = present.has(idx);
                      return <svg key={unit.id} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" style={{ display: 'block' }}>
                        <circle
                          cx="6"
                          cy="6"
                          r={isMilestone ? 4.6 : isPresent ? 3.3 : 1.7}
                          fill={isMilestone ? laneStroke : isPresent ? 'var(--color-accent)' : 'var(--color-border-emphasized)'}
                          stroke={isMilestone ? 'var(--color-background-surface)' : 'none'}
                          strokeWidth={isMilestone ? 1.5 : 0}
                        />
                      </svg>;
                    })}
                  </Grid>
                </HStack>

                {/* Story question span bars & milestone pills */}
                <Grid columns={count} gap={1} style={{ gridTemplateColumns: colTemplate, gridAutoFlow: 'row dense', rowGap: 'var(--spacing-1-5)' }}>
                  {threads.map(thread => (
                    <button
                      type="button"
                      key={thread.id}
                      title={thread.title}
                      aria-label={`${thread.open ? 'Open question' : 'Answered question'}: ${thread.title}, from ${units[thread.start].code}${thread.open ? '' : ` to ${units[thread.end].code}`}`}
                      onClick={() => setSelected({ title: thread.title, records: thread.records })}
                      style={{
                        gridColumn: `${thread.start + 1} / ${thread.end + 2}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        minHeight: 0,
                        height: '26px',
                        padding: '0 var(--spacing-2-5, 10px)',
                        borderRadius: 'var(--radius-full)',
                        border: thread.open ? '1.5px dashed var(--color-warning)' : '1px solid var(--color-border-success)',
                        background: thread.open
                          ? 'color-mix(in srgb, var(--color-warning) 12%, var(--color-background-surface))'
                          : 'color-mix(in srgb, var(--color-success) 14%, var(--color-background-surface))',
                        color: thread.open ? 'var(--color-text-warning)' : 'var(--color-text-success)',
                        fontSize: 'var(--font-size-xs)',
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        cursor: 'pointer'
                      }}
                    >
                      {thread.open ? `? ${thread.title}` : `✓ ${thread.title}`}
                    </button>
                  ))}

                  {milestones.map(point => {
                    const start = columnOf(point)!;
                    const span = Math.min(6, count);
                    const atEnd = count > span && start > count - span;
                    const columns = atEnd
                      ? `${Math.max(1, start - span + 2)} / ${start + 2}`
                      : `${start + 1} / ${Math.min(count, start + span) + 1}`;
                    const isDraft = Boolean(states?.get(point.id) && states.get(point.id) !== 'approved');
                    return <button
                      type="button"
                      key={point.id}
                      title={point.title}
                      aria-label={`${person.name} arc milestone in ${units[start].code}: ${point.title}`}
                      onClick={() => setSelected({ title: `${person.name} · ${point.title}`, records: [point] })}
                      style={{
                        gridColumn: columns,
                        display: 'flex',
                        flexDirection: atEnd ? 'row-reverse' : 'row',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        gap: 'var(--spacing-1-5)',
                        minWidth: 0,
                        minHeight: 0,
                        height: '26px',
                        padding: '0 var(--spacing-2)',
                        borderRadius: 'var(--radius-element)',
                        border: isDraft ? '1.5px dashed var(--color-warning)' : '1px solid var(--color-border-info)',
                        background: 'var(--color-accent-muted)',
                        color: 'var(--color-text-accent)',
                        overflow: 'hidden',
                        cursor: 'pointer'
                      }}
                    >
                      <Card
                        padding={0}
                        aria-hidden="true"
                        style={{
                          flex: 'none',
                          width: '6px',
                          height: '6px',
                          borderRadius: 'var(--radius-full)',
                          background: 'var(--color-accent)',
                          border: 'none'
                        }}
                      />
                      <Text as="span" size="xsm" weight="semibold" color="accent" maxLines={1}>
                        {point.title}
                      </Text>
                    </button>;
                  })}
                </Grid>
              </VStack>
            </Grid>
          </VStack>;
        })}
      </VStack>
    </VStack> : <Text type="supporting" color="secondary">Record arc milestones or open questions to build the timeline.</Text>}

    {quiet.length > 0 && <Text type="supporting" color="secondary">
      No arc milestones yet: {quiet.map(row => row.person.name).join(', ')}
    </Text>}

    {selected && <>
      <Divider />
      <Card variant="muted" padding={4} role="region" aria-label="Selected arc detail" aria-live="polite">
        <VStack gap={3}>
          <Heading level={3}>{selected.title}</Heading>
          <PointRows
            rows={selected.records}
            project={project}
            onOpen={onOpen}
            onEdit={onEdit}
            states={states}
            showKind
            people={data.characters}
            empty="No linked records."
          />
        </VStack>
      </Card>
    </>}
  </Pane>;
}
