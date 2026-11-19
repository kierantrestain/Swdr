import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { HStack } from '@astryxdesign/core/HStack';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { FilePenLine, GitCompareArrows } from 'lucide-react';
import { Dialog, Glyph, displayDate } from './components';
import { eighthsLabel, orderedDays } from './model';
import type { ProductionPlan, ScriptChange } from './model';

/** A compact flag on a strip or breakdown scene whose script changed after release. */
export function ScriptChangeBadge({ change, onOpen }: { change: ScriptChange; onOpen: () => void }) {
  return <Button size="sm" variant="ghost" label={`Review script change for scene ${change.number}`} onClick={onOpen}>
    <Badge variant="purple" icon={<Glyph icon={FilePenLine} size="xsm" />} label={change.status === 'removed' ? 'Cut in draft' : 'Script changed'} />
  </Button>;
}

/** Summary banner shown above the stripboard or breakdown while the draft is ahead of production. */
export function ScriptChangeBanner({ changes, release, onOpen }: { changes: ScriptChange[]; release: string; onOpen: () => void }) {
  if (!changes.length) return null;
  const count = changes.length;
  return <Banner status="info" role="status" icon={<Glyph icon={FilePenLine} />} title={`Script changed since ${release}`}
    description={`${count} ${count === 1 ? 'scene' : 'scenes'} in production ${count === 1 ? 'has' : 'have'} edits in the writing draft: ${changes.map(change => change.number).join(', ')}.`}
    endContent={<Button label="Review script changes" onClick={onOpen} />} />;
}

function stripSummary(plan: ProductionPlan, sceneId: string): string {
  const days = orderedDays(plan);
  const placements = plan.strips.filter(strip => strip.sceneId === sceneId).flatMap(strip => {
    const index = days.findIndex(day => day.id === strip.dayId);
    return index < 0 ? [] : [`Day ${index + 1} · ${displayDate(days[index].date)} at ${strip.startTime}`];
  });
  return placements.length ? placements.join('; ') : 'Not scheduled';
}

/** Lists what changed for each affected scene and hands off to the release review. */
export function ScriptChangeDialog({ plan, changes, focus, release, onClose, onReview }: {
  plan: ProductionPlan;
  changes: ScriptChange[];
  focus?: string;
  release: string;
  onClose: () => void;
  onReview?: () => void;
}) {
  const ordered = focus ? [...changes].sort((a, b) => Number(b.sceneId === focus) - Number(a.sceneId === focus)) : changes;
  return <Dialog title="Script changes since release" width={640} onClose={onClose}>
    <Text color="secondary">Production still uses {release}. Issue the current writing draft to confirm how each scene&rsquo;s breakdown, shots and strips carry forward.</Text>
    <VStack gap={3} role="list">
      {ordered.map(change => {
        const tags = plan.tags.filter(tag => tag.sceneId === change.sceneId).length;
        const shots = plan.shots.filter(shot => shot.sceneId === change.sceneId).length;
        return <Card role="listitem" key={change.sceneId} variant={change.sceneId === focus ? 'purple' : 'muted'} padding={4}>
          <VStack gap={3}>
            <HStack gap={2} justify="between" align="center" wrap="wrap">
              <Text weight="semibold">{change.number} · {change.heading || 'Untitled scene'}</Text>
              <Badge variant={change.status === 'removed' ? 'error' : 'purple'} label={change.status === 'removed' ? 'Removed from draft' : 'Edited'} />
            </HStack>
            <MetadataList>
              {change.headingAfter !== undefined && <MetadataListItem label="Heading">{change.headingAfter || 'Untitled scene'}</MetadataListItem>}
              {change.eighthsAfter !== undefined && <MetadataListItem label="Est. length">
                {change.eighthsAfter === change.eighthsBefore ? `${eighthsLabel(change.eighthsAfter)} pages (unchanged)` : `${eighthsLabel(change.eighthsBefore)} → ${eighthsLabel(change.eighthsAfter)} pages`}
              </MetadataListItem>}
              {change.charactersAdded.length > 0 && <MetadataListItem label="New speaking roles">{change.charactersAdded.join(', ')}</MetadataListItem>}
              {change.charactersRemoved.length > 0 && <MetadataListItem label="No longer speaking">{change.charactersRemoved.join(', ')}</MetadataListItem>}
              <MetadataListItem label="Schedule">{stripSummary(plan, change.sceneId)}</MetadataListItem>
              <MetadataListItem label="Linked work">{tags} breakdown {tags === 1 ? 'tag' : 'tags'} · {shots} {shots === 1 ? 'shot' : 'shots'}</MetadataListItem>
            </MetadataList>
          </VStack>
        </Card>;
      })}
    </VStack>
    <HStack gap={2} justify="end">
      <Button label="Close" onClick={onClose} />
      {onReview && <Button variant="primary" icon={<Glyph icon={GitCompareArrows} />} label="Issue draft and review links" onClick={() => { onClose(); onReview(); }} />}
    </HStack>
  </Dialog>;
}
