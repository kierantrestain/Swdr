import { Badge } from '@astryxdesign/core/Badge';
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@astryxdesign/core/Table';
import { TextInput } from '@astryxdesign/core/TextInput';
import { ImageOff, MapPin, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { newId } from '../model';
import type { Asset } from '../model';
import { Dialog, SourceButton } from './components';
import type { PaneProps } from './components';
import { locationStats, sceneEighthsMap } from './insights';
import type { LocationStats } from './insights';
import { PhotoDrop } from './media';
import { eighthsLabel, setProductionPlan } from './model';
import type { Location } from './model';
import { addAssets, assetUrl, removeAssets } from './photos';

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim();
}

function Thumb({ url, name }: { url?: string; name: string }) {
  return url ? <img className="production-thumb" src={url} alt="" aria-hidden="true" /> :
    <span className="production-thumb production-thumb-empty" aria-hidden="true" title={`No photo of ${name}`}><MapPin size={16} /></span>;
}

function settingBadges(stats?: LocationStats) {
  if (!stats?.settings.length) return <span className="production-muted">—</span>;
  return <span className="production-actions">{stats.settings.map(setting => <Badge key={setting} variant={setting === 'INT' ? 'neutral' : 'yellow'} label={setting} />)}</span>;
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

  return <section className="production-card production-directory" aria-label="Locations directory">
    <header className="production-directory-head">
      <div>
        <h3>Locations</h3>
        <p className="production-muted">{plan.locations.length} {plan.locations.length === 1 ? 'location' : 'locations'} · {addressed} with an address · {recced} recced with photos{unassigned ? ` · ${unassigned} scenes without a location` : ''}</p>
      </div>
      {!readOnly && <button type="button" className="production-button production-primary" onClick={() => setOpen('new')}><Plus size={16} /> Add location</button>}
    </header>
    <div className="production-directory-tools">
      <TextInput label="Search locations" isLabelHidden type="search" value={query} onChange={setQuery} placeholder="Search name, address or contact" hasClear width={340} />
    </div>
    {!plan.locations.length ? <p className="production-muted">No locations yet. Build the breakdown from the script to list every set its scene headings name, or add one by hand.</p> :
      <div className="production-table-scroll"><Table className="production-grid-table" hasHover>
        <TableHeader><TableRow isHeaderRow>
          <TableHeaderCell>Location</TableHeaderCell><TableHeaderCell>Setting</TableHeaderCell><TableHeaderCell>Scenes</TableHeaderCell>
          <TableHeaderCell>Day / night</TableHeaderCell><TableHeaderCell>Pages</TableHeaderCell><TableHeaderCell>Address</TableHeaderCell>
          <TableHeaderCell>Contact</TableHeaderCell><TableHeaderCell>Parking and notes</TableHeaderCell>
        </TableRow></TableHeader>
        <TableBody>{shown.map(location => {
          const stat = stats.get(location.id);
          return <TableRow key={location.id}>
            <TableCell><span className="production-person">
              <Thumb url={assetUrl(project, location.photoAssetIds?.[0])} name={location.name} />
              <span><button type="button" className="production-person-name" onClick={() => setOpen(location)} aria-label={`Open ${location.name}`}>{location.name}</button>
                <small>{location.photoAssetIds?.length ? `${location.photoAssetIds.length} recce ${location.photoAssetIds.length === 1 ? 'photo' : 'photos'}` : 'No recce photos'}
                  {location.notInScript && <> · <Badge variant="warning" label="Not in script" /></>}</small></span>
            </span></TableCell>
            <TableCell>{settingBadges(stat)}</TableCell>
            <TableCell><strong>{stat?.scenes.length ?? 0}</strong>{stat && <small className="production-scene-numbers">{stat.scenes.slice(0, 8).map(scene => scene.number).join(', ')}{stat.scenes.length > 8 ? '…' : ''}</small>}</TableCell>
            <TableCell>{stat ? `${stat.day} D · ${stat.night} N` : '—'}</TableCell>
            <TableCell>{eighthsLabel(stat?.eighths ?? 0)}</TableCell>
            <TableCell>{location.address || <span className="production-muted">Add address</span>}</TableCell>
            <TableCell>{location.contact || location.phone ? <span className="production-stack">{location.contact && <span>{location.contact}</span>}{location.phone && <small>{location.phone}</small>}</span> : <span className="production-muted">—</span>}</TableCell>
            <TableCell>{location.parking || location.notes ? <span className="production-stack">{location.parking && <span>{location.parking}</span>}{location.notes && <small>{location.notes}</small>}</span> : <span className="production-muted">—</span>}</TableCell>
          </TableRow>;
        })}</TableBody>
      </Table></div>}
    {plan.locations.length > 0 && !shown.length && <p className="production-muted">No locations match this search.</p>}
    {open && <LocationDialog key={open === 'new' ? 'new' : open.id} pane={pane} location={open === 'new' ? undefined : open}
      stats={open === 'new' ? undefined : stats.get(open.id)} onClose={() => setOpen(undefined)} />}
  </section>;
}

function LocationDialog({ pane, location, stats, onClose }: { pane: PaneProps; location?: Location; stats?: LocationStats; onClose: () => void }) {
  const { project, plan, source, readOnly, update, updateProject, onOpenSource } = pane;
  const [error, setError] = useState('');
  const current = location && plan.locations.find(item => item.id === location.id);
  const photos = current?.photoAssetIds ?? [];

  function setPhotos(change: (ids: string[]) => string[], added: Asset[], removed: string[], message: string) {
    if (!current) return;
    updateProject((draft, active) => removeAssets(setProductionPlan(addAssets(draft, added), {
      ...active, locations: active.locations.map(item => item.id === current.id ? { ...item, photoAssetIds: change(item.photoAssetIds ?? []) } : item)
    }), removed), message);
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = text(form, 'name');
    if (!name) return setError('Enter a location name.');
    const next: Location = {
      ...(current ?? {}), id: current?.id ?? newId(), source: current?.source ?? source, name, address: text(form, 'address'), notes: text(form, 'notes'),
      contact: text(form, 'contact') || undefined, phone: text(form, 'phone') || undefined, parking: text(form, 'parking') || undefined
    };
    if (update(active => ({
      ...active, locations: current ? active.locations.map(item => item.id === next.id ? next : item) : [...active.locations, next]
    }), 'Location saved.')) onClose();
  }

  function remove() {
    if (!current) return;
    if (plan.strips.some(strip => strip.locationId === current.id)) return setError('Move scheduled scenes to another location before removing this one.');
    if (updateProject((draft, active) => removeAssets(setProductionPlan(draft, {
      ...active, locations: active.locations.filter(item => item.id !== current.id),
      scenes: active.scenes.map(scene => scene.locationId === current.id ? { ...scene, locationId: undefined } : scene)
    }), current.photoAssetIds ?? []), `${current.name} removed.`)) onClose();
  }

  return <Dialog title={current ? current.name : 'Add location'} onClose={onClose}>
    {current && <section className="production-recce" aria-label="Recce photos">
      {photos.length > 0 && <ul className="production-gallery">{photos.map((id, index) => <li key={id}>
        {assetUrl(project, id) ? <img src={assetUrl(project, id)} alt={`${current.name} recce photo ${index + 1}`} /> : <span className="production-thumb-empty"><ImageOff size={18} aria-hidden="true" /></span>}
        {!readOnly && <button type="button" className="production-icon production-gallery-remove" aria-label={`Remove recce photo ${index + 1}`}
          onClick={() => setPhotos(ids => ids.filter(item => item !== id), [], [id], 'Recce photo removed.')}><X size={14} /></button>}
      </li>)}</ul>}
      {!readOnly && <PhotoDrop multiple label={`Add recce photos of ${current.name}`} description="Several at once · each resized to 512px"
        onAssets={assets => setPhotos(ids => [...ids, ...assets.map(asset => asset.id)], assets, [], `${assets.length} recce ${assets.length === 1 ? 'photo' : 'photos'} added.`)} />}
    </section>}
    <form className="production-form" onSubmit={save}>
      <label>Location name<input name="name" defaultValue={current?.name} required autoFocus readOnly={readOnly} /></label>
      <label>Address<input name="address" defaultValue={current?.address} placeholder="Street, town and postcode" readOnly={readOnly} /></label>
      <div className="production-form-row">
        <label>Location contact<input name="contact" defaultValue={current?.contact} placeholder="Owner or location manager" readOnly={readOnly} /></label>
        <label>Phone<input name="phone" type="tel" defaultValue={current?.phone} readOnly={readOnly} /></label>
      </div>
      <label>Parking and basecamp<input name="parking" defaultValue={current?.parking} placeholder="Unit base, crew parking, access" readOnly={readOnly} /></label>
      <label>Notes<textarea name="notes" rows={2} defaultValue={current?.notes} placeholder="Power, noise, permits, toilets" readOnly={readOnly} /></label>
      {stats && <div className="production-inset">
        <h4>Scenes here · {stats.scenes.length} · {eighthsLabel(stats.eighths)} pages</h4>
        <ul className="production-scene-chips">{stats.scenes.map(scene => <li key={scene.id}>
          <SourceButton source={scene.source} onOpenSource={onOpenSource}>{scene.number} · {scene.heading}</SourceButton></li>)}</ul>
      </div>}
      {error && <p className="production-form-error" role="alert">{error}</p>}
      {!readOnly && <div className="production-actions production-right">
        {current && <button type="button" className="production-button" onClick={remove}><Trash2 size={16} /> Remove</button>}
        <button type="submit" className="production-button production-primary">{current ? 'Save location' : 'Add location'}</button>
      </div>}
    </form>
  </Dialog>;
}
