import { AspectRatio } from '@astryxdesign/core/AspectRatio';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Center } from '@astryxdesign/core/Center';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack } from '@astryxdesign/core/HStack';
import { Link } from '@astryxdesign/core/Link';
import { Table, pixel, proportional } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { ImageOff, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { newId } from '../model';
import type { Asset } from '../model';
import { Dialog, FormError, Glyph, Pane, SourceButton } from './components';
import type { PaneProps } from './components';
import { locationStats, sceneEighthsMap } from './insights';
import type { LocationStats } from './insights';
import { PhotoDrop } from './media';
import { eighthsLabel, setProductionPlan } from './model';
import type { Location } from './model';
import { addAssets, assetUrl, removeAssets } from './photos';

type LocationDraft = Record<'name' | 'address' | 'contact' | 'phone' | 'parking' | 'notes', string>;
interface LocationRow extends Record<string, unknown> { id: string; location: Location }

/** Supporting lines under a primary value in a table cell. */
function Lines({ primary, secondary }: { primary?: string; secondary?: string }) {
  return primary || secondary ? <VStack gap={0}>{primary && <Text>{primary}</Text>}{secondary && <Text type="supporting" color="secondary">{secondary}</Text>}</VStack>
    : <Text color="secondary">—</Text>;
}

function settingBadges(stats?: LocationStats) {
  if (!stats?.settings.length) return <Text color="secondary">—</Text>;
  return <HStack gap={1}>{stats.settings.map(setting => <Badge key={setting} variant={setting === 'INT' ? 'neutral' : 'yellow'} label={setting} />)}</HStack>;
}

export function Locations(pane: PaneProps) {
  const { project, plan, snapshot, readOnly } = pane;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Location | 'new'>();
  const eighths = sceneEighthsMap(project, plan, snapshot);
  const stats = locationStats(plan, eighths);
  const needle = query.trim().toLocaleLowerCase('en-GB');
  const shown = plan.locations.filter(location => !needle || [location.name, location.address, location.contact, location.notes]
    .some(value => value?.toLocaleLowerCase('en-GB').includes(needle)));
  const unassigned = plan.scenes.filter(scene => scene.status === 'active' && !scene.locationId).length;
  const recced = plan.locations.filter(location => location.photoAssetIds?.length).length;
  const addressed = plan.locations.filter(location => location.address).length;

  return <Pane label="Locations directory" title="Locations"
    description={`${plan.locations.length} ${plan.locations.length === 1 ? 'location' : 'locations'} · ${addressed} with an address · ${recced} recced with photos${unassigned ? ` · ${unassigned} scenes without a location` : ''}`}
    actions={!readOnly && <Button variant="primary" label="Add location" icon={<Glyph icon={Plus} />} onClick={() => setOpen('new')} />}>
    <TextInput label="Search locations" isLabelHidden type="search" value={query} onChange={setQuery} placeholder="Search name, address or contact" hasClear width={340} />
    {!plan.locations.length ? <Text color="secondary">No locations yet. Build the breakdown from the script to list every set its scene headings name, or add one by hand.</Text> :
      <Table<LocationRow> density="compact" hasHover idKey="id" data={shown.map(location => ({ id: location.id, location }))} columns={[
        { key: 'location', header: 'Location', width: proportional(3, { minWidth: 220 }), renderCell: ({ location }) => {
          const photos = location.photoAssetIds?.length ?? 0;
          return <HStack gap={3} align="center">
            <Avatar src={assetUrl(project, location.photoAssetIds?.[0])} name={location.name} size={40} tooltip={false} aria-hidden="true" />
            <VStack gap={0} hAlign="start">
              <Link label={`Open ${location.name}`} onClick={() => setOpen(location)}>{location.name}</Link>
              <HStack gap={1} align="center" wrap="wrap">
                <Text type="supporting" color="secondary">{photos ? `${photos} recce ${photos === 1 ? 'photo' : 'photos'}` : 'No recce photos'}</Text>
                {location.notInScript && <Badge variant="warning" label="Not in script" />}
              </HStack>
            </VStack>
          </HStack>;
        } },
        { key: 'setting', header: 'Setting', width: pixel(96), renderCell: ({ location }) => settingBadges(stats.get(location.id)) },
        { key: 'scenes', header: 'Scenes', width: pixel(96), renderCell: ({ location }) => {
          const stat = stats.get(location.id);
          return <Lines primary={String(stat?.scenes.length ?? 0)} secondary={stat ? `${stat.scenes.slice(0, 8).map(scene => scene.number).join(', ')}${stat.scenes.length > 8 ? '…' : ''}` : undefined} />;
        } },
        { key: 'daynight', header: 'Day / night', width: pixel(96), renderCell: ({ location }) => {
          const stat = stats.get(location.id);
          return stat ? `${stat.day} D · ${stat.night} N` : '—';
        } },
        { key: 'pages', header: 'Pages', width: pixel(72), renderCell: ({ location }) => eighthsLabel(stats.get(location.id)?.eighths ?? 0) },
        { key: 'address', header: 'Address', width: proportional(2), renderCell: ({ location }) => location.address || <Text color="secondary">Add address</Text> },
        { key: 'contact', header: 'Contact', width: proportional(2), renderCell: ({ location }) => <Lines primary={location.contact} secondary={location.phone} /> },
        { key: 'notes', header: 'Parking and notes', width: proportional(2), renderCell: ({ location }) => <Lines primary={location.parking} secondary={location.notes} /> }
      ]} />}
    {plan.locations.length > 0 && !shown.length && <Text color="secondary">No locations match this search.</Text>}
    {open && <LocationDialog key={open === 'new' ? 'new' : open.id} pane={pane} location={open === 'new' ? undefined : open}
      stats={open === 'new' ? undefined : stats.get(open.id)} onClose={() => setOpen(undefined)} />}
  </Pane>;
}

function LocationDialog({ pane, location, stats, onClose }: { pane: PaneProps; location?: Location; stats?: LocationStats; onClose: () => void }) {
  const { project, plan, source, readOnly, update, updateProject, onOpenSource } = pane;
  const [error, setError] = useState('');
  const current = location && plan.locations.find(item => item.id === location.id);
  const photos = current?.photoAssetIds ?? [];
  const [draft, setDraft] = useState<LocationDraft>({
    name: current?.name ?? '', address: current?.address ?? '', contact: current?.contact ?? '',
    phone: current?.phone ?? '', parking: current?.parking ?? '', notes: current?.notes ?? ''
  });
  const field = (key: keyof LocationDraft) => ({ value: draft[key], onChange: (value: string) => setDraft({ ...draft, [key]: value }), isReadOnly: readOnly });

  function setPhotos(change: (ids: string[]) => string[], added: Asset[], removed: string[], message: string) {
    if (!current) return;
    updateProject((draftProject, active) => removeAssets(setProductionPlan(addAssets(draftProject, added), {
      ...active, locations: active.locations.map(item => item.id === current.id ? { ...item, photoAssetIds: change(item.photoAssetIds ?? []) } : item)
    }), removed), message);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    const name = draft.name.trim();
    if (!name) return setError('Enter a location name.');
    const next: Location = {
      ...(current ?? {}), id: current?.id ?? newId(), source: current?.source ?? source, name, address: draft.address.trim(), notes: draft.notes.trim(),
      contact: draft.contact.trim() || undefined, phone: draft.phone.trim() || undefined, parking: draft.parking.trim() || undefined
    };
    if (update(active => ({
      ...active, locations: current ? active.locations.map(item => item.id === next.id ? next : item) : [...active.locations, next]
    }), 'Location saved.')) onClose();
  }

  function remove() {
    if (!current) return;
    if (plan.strips.some(strip => strip.locationId === current.id)) return setError('Move scheduled scenes to another location before removing this one.');
    if (updateProject((draftProject, active) => removeAssets(setProductionPlan(draftProject, {
      ...active, locations: active.locations.filter(item => item.id !== current.id),
      scenes: active.scenes.map(scene => scene.locationId === current.id ? { ...scene, locationId: undefined } : scene)
    }), current.photoAssetIds ?? []), `${current.name} removed.`)) onClose();
  }

  return <Dialog title={current ? current.name : 'Add location'} width={640} onClose={onClose}>
    {current && <VStack as="section" gap={3} aria-label="Recce photos">
      {photos.length > 0 && <Grid columns={{ minWidth: 120, repeat: 'fill' }} gap={2}>{photos.map((id, index) => <VStack key={id} gap={1}>
        <AspectRatio ratio={4 / 3}>
          {assetUrl(project, id)
            ? <img src={assetUrl(project, id)} alt={`${current.name} recce photo ${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-element)' }} />
            : <Card variant="muted" padding={0}><Center height="100%"><Glyph icon={ImageOff} color="secondary" /></Center></Card>}
        </AspectRatio>
        {!readOnly && <Button size="sm" variant="ghost" label={`Remove recce photo ${index + 1}`} icon={<Glyph icon={X} />}
          onClick={() => setPhotos(ids => ids.filter(item => item !== id), [], [id], 'Recce photo removed.')}>Remove</Button>}
      </VStack>)}</Grid>}
      {!readOnly && <PhotoDrop multiple label={`Add recce photos of ${current.name}`} description="Several at once · each resized to 512px"
        onAssets={assets => setPhotos(ids => [...ids, ...assets.map(asset => asset.id)], assets, [], `${assets.length} recce ${assets.length === 1 ? 'photo' : 'photos'} added.`)} />}
    </VStack>}
    <VStack as="form" gap={3} onSubmit={save}>
      <TextInput label="Location name" {...field('name')} isRequired />
      <TextInput label="Address" {...field('address')} placeholder="Street, town and postcode" />
      <Grid columns={{ minWidth: 200, repeat: 'fit' }} gap={3}>
        <TextInput label="Location contact" {...field('contact')} placeholder="Owner or location manager" />
        <TextInput label="Phone" type="tel" {...field('phone')} />
      </Grid>
      <TextInput label="Parking and basecamp" {...field('parking')} placeholder="Unit base, crew parking, access" />
      <TextArea label="Notes" {...field('notes')} placeholder="Power, noise, permits, toilets" />
      {stats && <Pane variant="muted" title={`Scenes here · ${stats.scenes.length} · ${eighthsLabel(stats.eighths)} pages`}>
        <HStack gap={3} wrap="wrap">{stats.scenes.map(scene =>
          <SourceButton key={scene.id} source={scene.source} onOpenSource={onOpenSource}>{scene.number} · {scene.heading}</SourceButton>)}</HStack>
      </Pane>}
      <FormError>{error}</FormError>
      {!readOnly && <HStack gap={2} justify="end">
        {current && <Button label="Remove" icon={<Glyph icon={Trash2} />} onClick={remove} />}
        <Button type="submit" variant="primary" label={current ? 'Save location' : 'Add location'} />
      </HStack>}
    </VStack>
  </Dialog>;
}
