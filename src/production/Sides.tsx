import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { HStack } from '@astryxdesign/core/HStack';
import { Item } from '@astryxdesign/core/Item';
import { Table, pixel, proportional } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import { VStack } from '@astryxdesign/core/VStack';
import { Download, Printer } from 'lucide-react';
import { useState } from 'react';
import { Choice, Dialog, Empty, Glyph, Pane, Paper, SourceButton, Split, displayDate } from './components';
import type { PaneProps } from './components';
import { castByScene, sceneEighthsMap } from './insights';
import { PersonAvatar } from './media';
import { castNumbers, dayStrips, eighthsLabel, orderedDays, settingLabel, sidesFor } from './model';
import { ScriptExtract } from './ScriptExtract';
import type { ProductionScene } from './model';

interface SceneRow extends Record<string, unknown> { id: string; scene: ProductionScene }

export function Sides({ plan, project, snapshot, source, readOnly, onOpenSource, issueOutput }: PaneProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [dayId, setDayId] = useState('');
  const [preview, setPreview] = useState(false);
  const scenes = plan.scenes.filter(scene => scene.status === 'active');
  const eighths = sceneEighthsMap(project, plan, snapshot);
  const cast = castByScene(plan);
  const ids = castNumbers(plan);
  const days = orderedDays(plan);
  const dayOf = new Map(plan.strips.map(strip => [strip.sceneId, days.findIndex(day => day.id === strip.dayId) + 1]));
  const sides = sidesFor(project, plan, selected);
  const pages = sides.reduce((sum, scene) => sum + (eighths.get(scene.id) ?? 0), 0);
  const selectedCast = [...new Map(sides.flatMap(scene => cast.get(scene.id) ?? []).map(person => [person.id, person])).values()]
    .sort((a, b) => (ids.get(a.id) ?? 0) - (ids.get(b.id) ?? 0));
  const text = [
    project.title, snapshot.label, `Source revision ${source.revisionId}`, '',
    ...sides.flatMap(scene => [`${scene.number}  ${scene.heading}`, ...scene.blocks.filter(block => block.kind !== 'scene').map(block => block.text), ''])
  ].join('\n');
  if (!scenes.length) return <Empty>No active scenes are available for sides.</Empty>;
  const toggle = (id: string, on: boolean) => { setDayId(''); setSelected(on ? [...selected, id] : selected.filter(item => item !== id)); };
  const allOn = selected.length === scenes.length;
  const chooseDay = (value: string) => {
    setDayId(value);
    setSelected(value ? [...new Set(dayStrips(plan, value).map(strip => strip.sceneId))] : []);
  };

  return <><Split main={<Pane title="Scene sides" description="Choose scenes, or a shoot day, for a printable extract of the issued script."
      actions={<Choice label="Select by shoot day" value={dayId} onChange={chooseDay} placeholder="Choose a day" width={260}
        options={days.map((day, index) => ({ value: day.id, label: `Day ${index + 1} · ${displayDate(day.date)} · ${day.label}` }))} />}>
      <HStack gap={4} align="center" wrap="wrap" aria-live="polite">
        <Text weight="semibold">{sides.length} of {scenes.length} scenes</Text>
        <Text color="secondary">{eighthsLabel(pages)} pages</Text>
        <Text color="secondary">{selectedCast.length ? `Cast ${selectedCast.map(person => ids.get(person.id)).join(', ')}` : 'No cast selected'}</Text>
        <Button variant="ghost" size="sm" label={allOn ? 'Clear selection' : 'Select all'}
          onClick={() => { setDayId(''); setSelected(allOn ? [] : scenes.map(scene => scene.id)); }} />
      </HStack>
      <Table<SceneRow> density="compact" hasHover idKey="id" data={scenes.map(scene => ({ id: scene.id, scene }))} columns={[
        { key: 'include', header: 'Include', width: pixel(88), renderCell: ({ scene }) => <CheckboxInput size="sm" isLabelHidden
          label={`${scene.number} · ${scene.heading || 'Untitled scene'}`} value={selected.includes(scene.id)} onChange={on => toggle(scene.id, on)} /> },
        { key: 'number', header: 'Sc.', width: pixel(48), renderCell: ({ scene }) => <Text weight="semibold">{scene.number}</Text> },
        { key: 'heading', header: 'Scene heading', width: proportional(3), renderCell: ({ scene }) => <VStack gap={0} hAlign="start">
          <SourceButton source={scene.source} onOpenSource={onOpenSource}>{scene.heading || 'Untitled scene'}</SourceButton>
          <Text type="supporting" color="secondary">{settingLabel(scene.heading)}</Text>
        </VStack> },
        { key: 'pages', header: 'Pages', width: pixel(64), renderCell: ({ scene }) => eighthsLabel(eighths.get(scene.id) ?? 0) },
        { key: 'cast', header: 'Cast', width: proportional(1, { minWidth: 96 }), renderCell: ({ scene }) => {
          const people = cast.get(scene.id) ?? [];
          return people.length ? <Tooltip content={people.map(person => `${ids.get(person.id)} ${person.name}`).join(', ')}>
            <HStack gap={1} align="center">
              {people.slice(0, 4).map(person => <PersonAvatar key={person.id} project={project} person={person} size={24} decorative />)}
              <Text type="supporting">{people.map(person => ids.get(person.id)).join(', ')}</Text>
            </HStack>
          </Tooltip> : <Text color="secondary">—</Text>;
        } },
        { key: 'day', header: 'Day', width: pixel(64), renderCell: ({ scene }) => dayOf.get(scene.id) ? `Day ${dayOf.get(scene.id)}` : <Text color="secondary">—</Text> }
      ]} />
    </Pane>} side={<Pane title="Preview" label="Sides preview" actions={<>
      <Button variant="primary" label="Preview sides" icon={<Glyph icon={Printer} />} isDisabled={!sides.length} onClick={() => setPreview(true)} />
      {!readOnly && <Button label="Issue sides text" icon={<Glyph icon={Download} />} isDisabled={!sides.length} onClick={() => issueOutput('sides', 'swdr-scene-sides.txt', text)} />}
    </>}>
      {selectedCast.length > 0 && <VStack as="ul" gap={2} aria-label="Cast in these sides" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {selectedCast.map(person => <Item as="li" key={person.id} startContent={<PersonAvatar project={project} person={person} size={32} decorative />}
          label={`${ids.get(person.id)}. ${person.name}`} description={person.role || undefined} />)}
      </VStack>}
      {sides.length ? <Paper><ScriptExtract scenes={sides} /></Paper>
        : <Text color="secondary">Selected scenes appear here as they will print.</Text>}
    </Pane>} />
    {preview && <Dialog title="Scene sides" width={760} onClose={() => setPreview(false)} print>
      <Paper>
        <VStack gap={4}>
          <VStack gap={1}>
            <Text as="h2" size="xl" weight="semibold" color="primary">{project.title}</Text>
            <Text color="secondary">{snapshot.document.title} · {snapshot.label} · {sides.length} {sides.length === 1 ? 'scene' : 'scenes'} · {eighthsLabel(pages)} pages</Text>
            <Text type="supporting" color="secondary">Source revision {source.revisionId}</Text>
          </VStack>
          <ScriptExtract scenes={sides} />
        </VStack>
      </Paper>
      <HStack justify="end"><Button variant="primary" label="Print sides" icon={<Glyph icon={Printer} />} onClick={() => window.print()} /></HStack>
    </Dialog>}
  </>;
}
