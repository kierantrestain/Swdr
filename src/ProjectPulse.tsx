import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { Divider } from '@astryxdesign/core/Divider';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { Item } from '@astryxdesign/core/Item';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { ArrowRight, CircleCheck, Clock3 } from 'lucide-react';
import { dailyBrief } from './pulse';
import type { Impact, PulseStep, PulseTarget, PulseTile } from './pulse';

const IMPACT: Record<Impact, { label: string; badge: 'error' | 'warning' | 'info' | 'neutral' }> = {
  blocker: { label: 'Blocker', badge: 'error' },
  risk: { label: 'Risk', badge: 'warning' },
  momentum: { label: 'Momentum', badge: 'info' },
  upkeep: { label: 'Upkeep', badge: 'neutral' }
};

const TONE_VALUE: Record<NonNullable<PulseTile['tone']>, string> = {
  good: 'var(--color-text-success)', warn: 'var(--color-text-warning)', bad: 'var(--color-text-error)'
};
const TONE_BAR: Record<NonNullable<PulseTile['tone']>, 'success' | 'warning' | 'error'> = { good: 'success', warn: 'warning', bad: 'error' };

function when(item: PulseStep): string | undefined {
  if (item.dueInDays === undefined) return undefined;
  return item.dueInDays <= 0 ? 'Today' : item.dueInDays === 1 ? 'Tomorrow' : item.dueInDays <= 7 ? `In ${item.dueInDays} days` : undefined;
}

/** Impact, timing and effort for one brief item. */
function Facts({ item }: { item: PulseStep }) {
  const due = when(item);
  return <HStack gap={2} align="center" wrap="wrap">
    <Badge variant={IMPACT[item.impact].badge} label={IMPACT[item.impact].label} />
    {due && <Badge variant="neutral" label={due} />}
    <HStack as="span" gap={1} align="center"><Icon icon={Clock3} size="xsm" color="secondary" /><Text type="supporting" color="secondary">~{item.minutes} min</Text></HStack>
  </HStack>;
}

function greeting(now: Date): string {
  const hour = now.getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

/**
 * The Overview's pulse: headline metrics, then the daily brief. The brief ranks what needs attention by impact and
 * urgency (see pulse.ts), leads with the one thing to do first and says why each item matters and how long it takes.
 */
export function ProjectPulse({ tiles, steps, onOpen, now = new Date() }: {
  tiles: PulseTile[];
  steps: PulseStep[];
  onOpen: (target: PulseTarget) => void;
  now?: Date;
}) {
  const brief = dailyBrief(steps);
  const date = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  // Responsive contract: on a phone the brief leads and the metrics follow two-up; from tablet width the metrics are the
  // at-a-glance strip above the brief.
  const phone = useMediaQuery('(max-width: 640px)');
  const metrics = <Grid columns={{ minWidth: 150, repeat: 'fit' }} gap={3}>
      {tiles.map(tile => <ClickableCard key={tile.id} label={`${tile.label}: ${tile.value}. ${tile.detail}`} padding={4} onClick={() => tile.target && onOpen(tile.target)}>
        <VStack gap={1} minHeight="100%">
          <Text type="supporting" color="secondary" weight="semibold">{tile.label}</Text>
          <Text size="2xl" weight="semibold" hasTabularNumbers style={tile.tone ? { color: TONE_VALUE[tile.tone] } : undefined}>{tile.value}</Text>
          <Text type="supporting" color="secondary">{tile.detail}</Text>
          {tile.progress !== undefined && <ProgressBar label={`${tile.label} progress`} isLabelHidden value={tile.progress} variant={tile.tone ? TONE_BAR[tile.tone] : 'accent'} />}
        </VStack>
      </ClickableCard>)}
    </Grid>;

  const briefCard = <Card padding={5} role="region" aria-label="Daily brief">
      <VStack gap={4}>
        <HStack gap={3} justify="between" align="end" wrap="wrap">
          <VStack gap={0.5}>
            <Text type="label" color="accent">Daily brief · {date}</Text>
            <Heading level={2}>{greeting(now)}. {brief.summary}</Heading>
          </VStack>
        </HStack>

        {!brief.focus ? <HStack gap={3} align="center">
          <Icon icon={CircleCheck} color="success" />
          <Text color="secondary">You are clear: no blockers, risks or overdue upkeep. A good day to write.</Text>
        </HStack> : <>
          <Card variant="blue" padding={5} aria-label="Today's focus" role="region">
            <HStack gap={4} align="start" wrap="wrap" justify="between">
              <VStack gap={2} style={{ flex: '1 1 24rem', minWidth: 0 }}>
                <Text type="label" color="accent">Start here</Text>
                <Heading level={3}>{brief.focus.text}</Heading>
                <Text color="secondary">{brief.focus.why}</Text>
                <Facts item={brief.focus} />
              </VStack>
              <Button variant="primary" label={brief.focus.action} icon={<Icon icon={ArrowRight} />} onClick={() => onOpen(brief.focus!.target)} />
            </HStack>
          </Card>

          {brief.then.length > 0 && <VStack gap={1}>
            <Text type="label" color="secondary">Then</Text>
            <VStack as="ol" gap={0} style={{ margin: 0, padding: 0 }}>
              {brief.then.map((item, index) => <VStack as="li" key={item.id} gap={0} style={{ listStyle: 'none' }}>
                {index > 0 && <Divider />}
                <Item
                  startContent={<Badge variant="neutral" label={String(index + 2)} aria-label={`Priority ${index + 2}`} />}
                  label={<Text weight="semibold">{item.text}</Text>}
                  description={<VStack gap={1} hAlign="start"><Text type="supporting" color="secondary">{item.why}</Text><Facts item={item} />
                    {phone && <Button variant="ghost" size="sm" label={item.action} icon={<Icon icon={ArrowRight} size="xsm" />} onClick={() => onOpen(item.target)} />}</VStack>}
                  endContent={!phone && <Button variant="ghost" size="sm" label={item.action} icon={<Icon icon={ArrowRight} size="xsm" />} onClick={() => onOpen(item.target)} />}
                />
              </VStack>)}
            </VStack>
          </VStack>}
        </>}
      </VStack>
    </Card>;

  return <VStack as="section" gap={5} aria-label="Project pulse">
    {phone ? <>{briefCard}{metrics}</> : <>{metrics}{briefCard}</>}
  </VStack>;
}
