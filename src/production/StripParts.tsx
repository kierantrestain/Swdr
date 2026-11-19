import { Badge } from '@astryxdesign/core/Badge';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import { VisuallyHidden } from '@astryxdesign/core/VisuallyHidden';
import { MoreHorizontal } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Glyph } from './components';
import type { Person, StripTone } from './model';

export const TONE_LABELS: Record<StripTone, string> = {
  'int-day': 'INT · Day', 'ext-day': 'EXT · Day', 'int-night': 'INT · Night', 'ext-night': 'EXT · Night'
};

/**
 * Stripboard colours, from the theme's palette tokens so they hold in light and dark: interior day plain, exterior day yellow,
 * interior night blue, exterior night green (the stripboard convention), each with a stronger edge on the leading side.
 */
export const TONE: Record<StripTone, { fill: string; edge: string }> = {
  'int-day': { fill: 'var(--color-background-surface)', edge: 'var(--color-border-gray)' },
  'ext-day': { fill: 'var(--color-background-yellow)', edge: 'var(--color-icon-yellow)' },
  'int-night': { fill: 'var(--color-background-blue)', edge: 'var(--color-icon-blue)' },
  'ext-night': { fill: 'var(--color-background-green)', edge: 'var(--color-icon-green)' }
};

/** The paint for one strip, or one scene in the day picker. */
export function toneStyle(tone: StripTone): CSSProperties {
  return { background: TONE[tone].fill, borderInlineStart: `var(--spacing-1) solid ${TONE[tone].edge}` };
}

/** Colour key shared by the strip and table views. */
export function StripLegend() {
  return <HStack as="ul" gap={4} wrap="wrap" aria-label="Strip colours" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
    {(Object.keys(TONE_LABELS) as StripTone[]).map(tone => <HStack as="li" key={tone} gap={1.5} align="center">
      <HStack as="span" aria-hidden="true" width={20} height={12} style={{ ...toneStyle(tone), borderRadius: 'var(--radius-element)', border: `var(--border-width) solid ${TONE[tone].edge}` }} />
      <Text type="supporting">{TONE_LABELS[tone]}</Text>
    </HStack>)}
  </HStack>;
}

/** Cast ID chips, as on a stripboard. Names stay available to assistive technology and on hover. */
export function CastIds({ cast, ids }: { cast: Person[]; ids: Map<string, number> }) {
  if (!cast.length) return <Text color="secondary">—</Text>;
  return <Tooltip content={cast.map(person => `${ids.get(person.id) ?? '?'} ${person.name}`).join(', ')}>
    <HStack as="span" gap={1} wrap="wrap">
      {cast.map(person => <Badge key={person.id} label={String(ids.get(person.id) ?? '?')} aria-hidden="true" />)}
      <VisuallyHidden>Cast {cast.map(person => `${ids.get(person.id) ?? ''} ${person.name}`).join(', ')}</VisuallyHidden>
    </HStack>
  </Tooltip>;
}

export interface MenuAction {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

/** The strip's actions menu: Astryx DropdownMenu, with arrow-key navigation for keyboard scheduling. */
export function ActionMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  return <DropdownMenu hasChevron={false} alignment="end"
    button={{ label, icon: <Glyph icon={MoreHorizontal} />, isIconOnly: true, variant: 'ghost', size: 'sm' }}
    items={actions.map(action => ({ label: action.label, onClick: action.onSelect, isDisabled: action.disabled }))} />;
}
