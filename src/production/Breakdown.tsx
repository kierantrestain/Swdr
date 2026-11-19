import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack } from '@astryxdesign/core/HStack';
import { Item } from '@astryxdesign/core/Item';
import { Link } from '@astryxdesign/core/Link';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Token } from '@astryxdesign/core/Token';
import { VStack } from '@astryxdesign/core/VStack';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { newId } from '../model';
import { Choice, Dialog, Empty, FormError, Glyph, Pane, PaneHeading, SourceButton, Split, displayDate } from './components';
import { ScriptLines } from './ScriptExtract';
import type { PaneProps } from './components';
import { CATALOGUE_CATEGORIES, castNumbers, eighthsLabel, estimateEighths, orderedDays, scriptTargets, settingLabel } from './model';
import type { BreakdownTag, CatalogueCategory, CatalogueItem, ProductionScene } from './model';
import { Locations } from './Locations';
import { People } from './People';
import { ScriptChangeBadge, ScriptChangeBanner, ScriptChangeDialog } from './ScriptChanges';

type Section = 'Scene tags' | 'Catalogue' | 'Cast & crew' | 'Locations';

type TokenColor = 'default' | 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'cyan' | 'blue' | 'purple' | 'pink' | 'gray';
/** Breakdown sheet colours, following the industry's category conventions where there is one (cast red, props purple). */
const CATEGORY_COLOR: Record<CatalogueCategory, TokenColor> = {
  Cast: 'red', Extras: 'green', Prop: 'purple', Wardrobe: 'orange', 'Hair and make-up': 'pink', 'Set dressing': 'yellow',
  Equipment: 'gray', Vehicle: 'yellow', Stunts: 'orange', 'Special effects': 'teal', Animals: 'green', Sound: 'cyan', VFX: 'blue', Other: 'default'
};

export function CategoryChip({ category }: { category: CatalogueCategory | string }) {
  return <Token size="sm" label={category} color={CATEGORY_COLOR[category as CatalogueCategory] ?? 'default'} />;
}

function itemLabel(item: CatalogueItem | undefined, ids: Map<string, number>): string {
  if (!item) return 'Unknown item';
  const id = item.category === 'Cast' && item.personId ? ids.get(item.personId) : undefined;
  return id ? `${id}. ${item.name}` : item.name;
}

export function Breakdown(pane: PaneProps) {
  const { plan, project, snapshot, source, readOnly, update, onOpenSource, changes, reviewScript, syncScript } = pane;
  const [section, setSection] = useState<Section>('Scene tags');
  const [sceneId, setSceneId] = useState('');
  const [reviewing, setReviewing] = useState<BreakdownTag>();
  const [error, setError] = useState('');
  const [changeFocus, setChangeFocus] = useState<string>();
  const [tagDraft, setTagDraft] = useState({ itemId: '', blockId: '', notes: '' });
  const [itemDraft, setItemDraft] = useState<{ name: string; category: CatalogueCategory; personId: string; notes: string }>({ name: '', category: 'Prop', personId: '', notes: '' });
  const castIds = castNumbers(plan);
  const scene = plan.scenes.find(item => item.id === sceneId) ?? plan.scenes.find(item => item.status === 'active');
  const target = scriptTargets(project, snapshot.document).find(item => item.id === (scene?.source.sceneId ?? scene?.source.shotId));
  const tagBlocks = target?.source.sceneId ? target.blocks.filter(block => block.text.trim() && block.kind !== 'note') : [];
  const change = scene && changes.find(item => item.sceneId === scene.id);
  const sceneTags = scene ? plan.tags.filter(tag => tag.sceneId === scene.id) : [];
  const categoryOf = (tag: BreakdownTag) => plan.catalogue.find(entry => entry.id === tag.itemId)?.category ?? 'Other';
  const days = orderedDays(plan);
  const placements = scene ? plan.strips.filter(strip => strip.sceneId === scene.id).flatMap(strip => {
    const index = days.findIndex(day => day.id === strip.dayId);
    return index < 0 ? [] : [`Day ${index + 1} · ${displayDate(days[index].date)}`];
  }) : [];

  const startReview = (tag?: BreakdownTag) => { setReviewing(tag); setTagDraft({ itemId: '', blockId: tag?.source.blockId ?? '', notes: tag?.notes ?? '' }); };

  function attachTag(event: FormEvent, activeScene: ProductionScene, editing?: BreakdownTag) {
    event.preventDefault();
    const { blockId } = tagDraft;
    const itemId = editing?.itemId ?? (tagDraft.itemId || plan.catalogue[0]?.id);
    if (activeScene.status !== 'active' || !plan.catalogue.some(item => item.id === itemId)) return setError('Choose an active scene and a catalogue item.');
    if (blockId && !tagBlocks.some(block => block.id === blockId)) return setError('Choose a block from the current source scene.');
    const tag: BreakdownTag = {
      id: editing?.id ?? newId(), sceneId: activeScene.id, itemId, notes: tagDraft.notes.trim(),
      source: blockId ? { ...activeScene.source, blockId } : activeScene.source, reviewed: true
    };
    if (update(current => ({
      ...current,
      tags: editing ? current.tags.map(item => item.id === tag.id ? tag : item) : [...current.tags, tag]
    }), editing ? 'Tag re-linked to the active revision.' : 'Tag added.')) {
      setTagDraft({ itemId: tagDraft.itemId, blockId: '', notes: '' });
      setReviewing(undefined);
      setError('');
    }
  }

  function addItem(event: FormEvent) {
    event.preventDefault();
    const name = itemDraft.name.trim();
    const { category, personId } = itemDraft;
    if (!name || !CATALOGUE_CATEGORIES.includes(category)) return setError('Enter a name and category.');
    if (category === 'Cast' && !plan.people.some(person => person.id === personId && person.type === 'Cast')) {
      return setError('Add a cast member under Cast & crew, then link that person here.');
    }
    const item = { id: newId(), name, category, personId: category === 'Cast' ? personId : undefined, notes: itemDraft.notes.trim(), source };
    if (update(current => ({ ...current, catalogue: [...current.catalogue, item] }), 'Catalogue item added.')) {
      setItemDraft({ name: '', category, personId: '', notes: '' }); setError('');
    }
  }

  const blockOptions = [{ value: '', label: 'Whole scene' }, ...tagBlocks.map(block => ({ value: block.id, label: block.text.slice(0, 120) }))];
  const sourceLine = <Choice label="Source line" value={tagDraft.blockId} onChange={blockId => setTagDraft({ ...tagDraft, blockId })} options={blockOptions} />;
  const tagNotes = <TextInput label="Notes" value={tagDraft.notes} onChange={notes => setTagDraft({ ...tagDraft, notes })} />;

  return <VStack gap={4}>
    <HStack gap={3} justify="between" align="center" wrap="wrap">
      <SegmentedControl label="Breakdown areas" value={section} onChange={value => { setSection(value as Section); setError(''); }}>
        <SegmentedControlItem value="Scene tags" label="Scene tags" />
        <SegmentedControlItem value="Catalogue" label="Catalogue" />
        <SegmentedControlItem value="Cast & crew" label={`Cast & crew ${plan.people.length}`} />
        <SegmentedControlItem value="Locations" label={`Locations ${plan.locations.length}`} />
      </SegmentedControl>
      {!readOnly && syncScript && <Button label={plan.breakdownSyncedAt ? 'Sync from script' : 'Build breakdown from script'} icon={<Glyph icon={RefreshCw} />} onClick={syncScript}
        tooltip={plan.breakdownSyncedAt ? `Last built ${plan.breakdownSyncedAt.slice(0, 16).replace('T', ' ')}` : undefined} />}
    </HStack>
    {section === 'Scene tags' && <>
      <ScriptChangeBanner changes={changes} release={snapshot.label} onOpen={() => setChangeFocus('')} />
      {changeFocus !== undefined && <ScriptChangeDialog plan={plan} changes={changes} focus={changeFocus || undefined} release={snapshot.label}
        onClose={() => setChangeFocus(undefined)} onReview={reviewScript} />}
      {!scene && <Empty>The released script has no scenes available for breakdown.</Empty>}
      {scene && <Split main={<Pane>
        <Choice label="Scene" value={scene.id} onChange={value => { setSceneId(value); setError(''); }}
          options={plan.scenes.map(item => ({ value: item.id, label: `${item.number} · ${item.heading || 'Untitled scene'}${item.status === 'omitted' ? ' (omitted)' : ''}` }))} />
        <PaneHeading title={scene.heading || 'Untitled scene'} actions={<SourceButton source={scene.source} onOpenSource={onOpenSource} />} />
        <HStack gap={2} align="center" wrap="wrap">
          <Text type="supporting" color="secondary">{[settingLabel(scene.heading), target && `Est. ${eighthsLabel(estimateEighths(target.blocks))} pages`, placements.length ? placements.join(', ') : 'Not scheduled']
            .filter(Boolean).join(' · ')}</Text>
          {change && <ScriptChangeBadge change={change} onOpen={() => setChangeFocus(change.sceneId)} />}
        </HStack>
        <Card variant="muted" padding={4} role="region" aria-label="Released script excerpt">
          <VStack gap={2}>
            <ScriptLines blocks={target?.blocks.filter(block => block.kind !== 'note' && block.kind !== 'scene') ?? []} />
            {scene.status === 'omitted' && <Text>Omitted from the active release. Open Source to read the original snapshot.</Text>}
          </VStack>
        </Card>
      </Pane>} side={<Pane title="Breakdown sheet" actions={<Text color="secondary">{sceneTags.length} {sceneTags.length === 1 ? 'element' : 'elements'}</Text>}>
        {!sceneTags.length && <Text color="secondary">No tags on this scene.</Text>}
        {CATALOGUE_CATEGORIES.filter(category => sceneTags.some(tag => categoryOf(tag) === category)).map(category => <VStack key={category} gap={1}>
          <HStack><CategoryChip category={category} /></HStack>
          {sceneTags.filter(tag => categoryOf(tag) === category).map(tag => {
            const item = plan.catalogue.find(entry => entry.id === tag.itemId);
            return <Item key={tag.id} label={itemLabel(item, castIds)}
              description={tag.notes || tag.reviewed === false ? `${tag.notes}${tag.notes && tag.reviewed === false ? ' · ' : ''}${tag.reviewed === false ? 'Source review required' : ''}` : undefined}
              endContent={<HStack gap={3} align="center">
                <SourceButton source={tag.source} onOpenSource={onOpenSource} />
                {!readOnly && scene.status === 'active' && tag.reviewed === false && <Link onClick={() => { setError(''); startReview(tag); }}>Re-link</Link>}
                {!readOnly && <Link label={`Remove ${item?.name ?? 'breakdown'} tag`} onClick={() => update(current => ({
                  ...current, tags: current.tags.filter(entry => entry.id !== tag.id)
                }), 'Tag removed.')}>Remove</Link>}
              </HStack>} />;
          })}
        </VStack>)}
        {!readOnly && scene.status === 'active' && (plan.catalogue.length ? <VStack as="form" gap={3} onSubmit={event => attachTag(event, scene)}>
          <Choice label="Catalogue item" value={tagDraft.itemId || plan.catalogue[0].id} onChange={itemId => setTagDraft({ ...tagDraft, itemId })}
            options={plan.catalogue.map(item => ({ value: item.id, label: `${itemLabel(item, castIds)} · ${item.category}` }))} />
          {sourceLine}
          {tagNotes}
          {!reviewing && <FormError>{error}</FormError>}
          <HStack><Button type="submit" variant="primary" label="Add breakdown tag" /></HStack>
        </VStack> : <Text><Link onClick={() => setSection('Catalogue')}>Add a catalogue item</Link> to tag this scene.</Text>)}
      </Pane>} />}
      {scene && reviewing && <Dialog title="Review breakdown tag" width={560} onClose={() => startReview(undefined)}>
        <VStack as="form" gap={3} onSubmit={event => attachTag(event, scene, reviewing)}>
          {sourceLine}
          {tagNotes}
          <FormError>{error}</FormError>
          <HStack justify="end"><Button type="submit" variant="primary" label="Confirm source" /></HStack>
        </VStack>
      </Dialog>}
    </>}
    {section === 'Catalogue' && <Split main={<Pane title="Catalogue">
      {!plan.catalogue.length && <Text color="secondary">Add an item to tag it in the released script.</Text>}
      <VStack gap={1}>{plan.catalogue.map(item => <Item key={item.id} label={itemLabel(item, castIds)}
        description={<HStack gap={2} align="center"><CategoryChip category={item.category} />{item.notes && <Text type="supporting" color="secondary">{item.notes}</Text>}</HStack>}
        endContent={<SourceButton source={item.source} onOpenSource={onOpenSource} />} />)}</VStack>
    </Pane>} side={!readOnly && <Pane title="Add catalogue item">
      <VStack as="form" gap={3} onSubmit={addItem}>
        <TextInput label="Item name" value={itemDraft.name} onChange={name => setItemDraft({ ...itemDraft, name })} isRequired />
        <Grid columns={{ minWidth: 160, repeat: 'fit' }} gap={3}>
          <Choice label="Category" value={itemDraft.category} onChange={value => setItemDraft({ ...itemDraft, category: value as CatalogueCategory })}
            options={CATALOGUE_CATEGORIES.map(category => ({ value: category, label: category }))} />
          <Choice label="Cast member" value={itemDraft.personId} onChange={personId => setItemDraft({ ...itemDraft, personId })}
            options={[{ value: '', label: 'None' }, ...plan.people.filter(person => person.type === 'Cast').map(person => ({ value: person.id, label: person.name }))]} />
        </Grid>
        <TextArea label="Notes" value={itemDraft.notes} onChange={notes => setItemDraft({ ...itemDraft, notes })} />
        <FormError>{error}</FormError>
        <HStack><Button type="submit" variant="primary" label="Add catalogue item" /></HStack>
      </VStack>
    </Pane>} />}
    {section === 'Cast & crew' && <People {...pane} />}
    {section === 'Locations' && <Locations {...pane} />}
  </VStack>;
}
