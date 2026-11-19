import { Card } from '@astryxdesign/core/Card';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useState } from 'react';
import type { Project } from '../model';
import { Choice } from './components';
import { castByScene } from './insights';
import { PersonAvatar } from './media';
import { castNumbers, dayStrips, defaultStripMinutes, eighthsLabel, sceneSetting } from './model';
import type { Person, ProductionPlan, ProductionScene } from './model';
import { toneStyle } from './StripParts';

/** The scenes a shoot day dialog offers: those on the day already and every unscheduled one. */
export function offeredScenes(plan: ProductionPlan, scenes: ProductionScene[], dayId?: string): { offered: ProductionScene[]; onDay: Set<string> } {
  const onDay = new Set(dayId ? dayStrips(plan, dayId).map(strip => strip.sceneId) : []);
  const scheduled = new Set(plan.strips.map(strip => strip.sceneId));
  return { offered: scenes.filter(scene => onDay.has(scene.id) || !scheduled.has(scene.id)), onDay };
}

/**
 * Picks the scenes for a shoot day inside the day dialog: unscheduled scenes and the day's own, with a running page
 * total, estimated shooting time and the cast the day calls.
 */
export function DayScenePicker({ project, plan, dayId, scenes, eighthsOf, chosen, onChosenChange }: {
  project: Project;
  plan: ProductionPlan;
  dayId?: string;
  scenes: ProductionScene[];
  eighthsOf: (scene: ProductionScene) => number;
  chosen: Set<string>;
  onChosenChange: (chosen: Set<string>) => void;
}) {
  const { offered, onDay } = offeredScenes(plan, scenes, dayId);
  const [location, setLocation] = useState('');
  const cast = castByScene(plan);
  const ids = castNumbers(plan);
  const locations = plan.locations.filter(item => offered.some(scene => scene.locationId === item.id));
  const visible = offered.filter(scene => !location || scene.locationId === location || chosen.has(scene.id));
  const picked = offered.filter(scene => chosen.has(scene.id));
  const eighths = picked.reduce((sum, scene) => sum + eighthsOf(scene), 0);
  const minutes = picked.reduce((sum, scene) => sum + defaultStripMinutes(eighthsOf(scene)), 0);
  const people = [...new Map(picked.flatMap(scene => cast.get(scene.id) ?? []).map(person => [person.id, person])).values()]
    .sort((a, b) => (ids.get(a.id) ?? 0) - (ids.get(b.id) ?? 0));
  const toggle = (id: string, on: boolean) => {
    const next = new Set(chosen);
    if (on) next.add(id); else next.delete(id);
    onChosenChange(next);
  };

  return <VStack as="fieldset" gap={3} aria-label="Scenes for this day" style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
    <Text weight="semibold">Scenes for this day</Text>
    {!offered.length ? <Text color="secondary">Every scene is already scheduled on another day.</Text> : <>
      <HStack gap={3} justify="between" align="center" wrap="wrap">
        <Text type="supporting" color="secondary">{offered.length - onDay.size} unscheduled{onDay.size ? ` · ${onDay.size} on this day` : ''}</Text>
        {locations.length > 1 && <Choice label="Show scenes at" isLabelHidden width={220} value={location} onChange={setLocation}
          options={[{ value: '', label: 'All locations' }, ...locations.map(item => ({ value: item.id, label: item.name }))]} />}
      </HStack>
      <VStack gap={1} isScrollable style={{ maxHeight: '16rem' }}>
        {visible.map(scene => {
          const setting = sceneSetting(scene.heading);
          const sceneCast: Person[] = cast.get(scene.id) ?? [];
          return <HStack key={scene.id} gap={3} align="center" paddingInline={3} paddingBlock={1.5} style={{ ...toneStyle(setting.tone), borderRadius: 'var(--radius-element)' }}>
            <CheckboxInput size="sm" label={`${scene.number} ${scene.heading || 'Untitled scene'}`} isLabelHidden value={chosen.has(scene.id)} onChange={on => toggle(scene.id, on)} />
            <Text weight="semibold" hasTabularNumbers>{scene.number}</Text>
            <VStack style={{ flex: 1, minWidth: 0 }}><Text maxLines={1}>{scene.heading || 'Untitled scene'}</Text></VStack>
            <Text type="supporting" color="secondary">{eighthsLabel(eighthsOf(scene))} pg</Text>
            <Text type="supporting" color="secondary">{sceneCast.length ? sceneCast.map(person => ids.get(person.id)).join(', ') : '—'}</Text>
          </HStack>;
        })}
      </VStack>
      <Card variant="muted" padding={3} aria-live="polite">
        <HStack gap={4} align="center" wrap="wrap">
          <Text weight="semibold">{picked.length} {picked.length === 1 ? 'scene' : 'scenes'} · {eighthsLabel(eighths)} pages</Text>
          <Text color="secondary">about {Math.floor(minutes / 60)}h {String(minutes % 60).padStart(2, '0')}m</Text>
          <HStack gap={1} align="center">{people.length ? <>
            {people.slice(0, 6).map(person => <PersonAvatar key={person.id} project={project} person={person} size={24} decorative />)}
            <Text type="supporting">Cast {people.map(person => ids.get(person.id)).join(', ')}</Text>
          </> : <Text type="supporting" color="secondary">No cast called</Text>}</HStack>
        </HStack>
      </Card>
    </>}
  </VStack>;
}
