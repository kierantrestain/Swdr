import { Badge } from '@astryxdesign/core/Badge';
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@astryxdesign/core/Table';
import { TextInput } from '@astryxdesign/core/TextInput';
import { ImagePlus, Plus, Trash2, UserRound } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { newId } from '../model';
import type { Project } from '../model';
import { Dialog } from './components';
import type { PaneProps } from './components';
import { castStats, sceneEighthsMap } from './insights';
import { PersonAvatar, PhotoDrop } from './media';
import { PERSON_STATUSES, castNumbers, eighthsLabel, isShootDate, setProductionPlan } from './model';
import type { Person, PersonStatus, ProductionPlan } from './model';
import { addAssets, removeAssets } from './photos';

export const CREW_DEPARTMENTS = [
  'Production', 'Direction', 'Camera', 'Lighting and grip', 'Sound', 'Art', 'Wardrobe', 'Hair and make-up',
  'Locations', 'Transport', 'Catering', 'Post-production'
];

const FILTERS = ['Everyone', 'Cast', 'Crew', 'Needs attention'] as const;
type Filter = (typeof FILTERS)[number];

const STATUS_VARIANT: Record<PersonStatus, 'success' | 'info' | 'warning' | 'neutral'> = {
  Confirmed: 'success', Pencilled: 'info', 'Offer out': 'warning', 'To cast': 'neutral'
};

function dateList(value: string): string[] {
  return [...new Set(value.split(/[\s,]+/).filter(Boolean))].sort();
}

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim();
}

export function StatusBadge({ person }: { person: Person }) {
  if (person.notInScript) return <Badge variant="warning" label="Not in script" />;
  return person.status ? <Badge variant={STATUS_VARIANT[person.status]} label={person.status} /> : <Badge label={person.type === 'Cast' ? 'To cast' : 'Crew'} />;
}

export function People(pane: PaneProps) {
  const { project, plan, snapshot, readOnly } = pane;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('Everyone');
  const [editing, setEditing] = useState<{ person?: Person; type: Person['type'] }>();
  const ids = castNumbers(plan);
  const eighths = sceneEighthsMap(project, plan, snapshot);
  const stats = castStats(plan, eighths);
  const needle = query.trim().toLocaleLowerCase('en-GB');
  const matches = (person: Person) => (!needle || [person.name, person.role, person.department, person.email, person.phone, person.agent]
    .some(value => value?.toLocaleLowerCase('en-GB').includes(needle))) &&
    (filter !== 'Needs attention' || person.notInScript || !person.photoAssetId || (person.type === 'Cast' && !person.role));
  const cast = plan.people.filter(person => person.type === 'Cast');
  const crew = plan.people.filter(person => person.type === 'Crew');
  const shownCast = filter === 'Crew' ? [] : cast.filter(matches);
  const shownCrew = filter === 'Cast' ? [] : crew.filter(matches);
  const departments = [...new Set([...CREW_DEPARTMENTS, ...shownCrew.map(person => person.department || 'Unassigned')])]
    .filter(department => shownCrew.some(person => (person.department || 'Unassigned') === department));
  const withPhotos = plan.people.filter(person => person.photoAssetId).length;

  return <section className="production-card production-directory" aria-label="Cast and crew directory">
    <header className="production-directory-head">
      <div>
        <h3>Cast & crew</h3>
        <p className="production-muted">{cast.length} cast · {crew.length} crew · {withPhotos} of {plan.people.length} with photos</p>
      </div>
      {!readOnly && <div className="production-actions">
        <button type="button" className="production-button" onClick={() => setEditing({ type: 'Crew' })}><Plus size={16} /> Add crew</button>
        <button type="button" className="production-button production-primary" onClick={() => setEditing({ type: 'Cast' })}><Plus size={16} /> Add cast</button>
      </div>}
    </header>
    <div className="production-directory-tools">
      <TextInput label="Search cast and crew" isLabelHidden type="search" value={query} onChange={setQuery} placeholder="Search name, artist, agent or department" hasClear width={340} />
      <div className="production-segmented" role="group" aria-label="Show">
        {FILTERS.map(name => <button key={name} type="button" aria-pressed={filter === name} onClick={() => setFilter(name)}>{name}</button>)}
      </div>
    </div>
    {filter !== 'Crew' && <>
      <h4 className="production-table-title">Cast <span className="production-count">{shownCast.length}</span></h4>
      {!cast.length ? <p className="production-muted">No cast yet. Build the breakdown from the script to list every speaking role, or add cast by hand.</p> :
        <div className="production-table-scroll"><Table className="production-grid-table" density="compact" hasHover>
          <TableHeader><TableRow isHeaderRow>
            <TableHeaderCell>ID</TableHeaderCell><TableHeaderCell>Character</TableHeaderCell><TableHeaderCell>Artist</TableHeaderCell>
            <TableHeaderCell>Contact</TableHeaderCell><TableHeaderCell>Agent</TableHeaderCell><TableHeaderCell>Scenes</TableHeaderCell>
            <TableHeaderCell>Pages</TableHeaderCell><TableHeaderCell>Days</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell>
          </TableRow></TableHeader>
          <TableBody>{shownCast.map(person => {
            const stat = stats.get(person.id);
            return <TableRow key={person.id}>
              <TableCell><span className="production-cast-id">{ids.get(person.id)}</span></TableCell>
              <TableCell><span className="production-person">
                <PersonAvatar project={project} person={person} size={40} decorative />
                <span><button type="button" className="production-person-name" onClick={() => setEditing({ person, type: 'Cast' })} aria-label={`Open ${person.name}`}>{person.name}</button>
                  <small>{stat?.scenes[0] ? `First seen sc. ${stat.scenes[0].number}` : 'Not tagged in a scene'}</small></span>
              </span></TableCell>
              <TableCell>{person.role || <span className="production-muted">Not cast</span>}</TableCell>
              <TableCell>{person.email || person.phone ? <span className="production-stack">{person.email && <span>{person.email}</span>}{person.phone && <small>{person.phone}</small>}</span> : <span className="production-muted">—</span>}</TableCell>
              <TableCell>{person.agent || <span className="production-muted">—</span>}</TableCell>
              <TableCell><strong>{stat?.scenes.length ?? 0}</strong></TableCell>
              <TableCell>{eighthsLabel(stat?.eighths ?? 0)}</TableCell>
              <TableCell>{stat?.days ?? 0}</TableCell>
              <TableCell><StatusBadge person={person} /></TableCell>
            </TableRow>;
          })}</TableBody>
        </Table></div>}
      {cast.length > 0 && !shownCast.length && <p className="production-muted">No cast match this search.</p>}
    </>}
    {filter !== 'Cast' && <>
      <h4 className="production-table-title">Crew <span className="production-count">{shownCrew.length}</span></h4>
      {!crew.length ? <p className="production-muted">Add crew by department so call sheets list every call.</p> :
        <div className="production-table-scroll"><Table className="production-grid-table" density="compact" hasHover>
          <TableHeader><TableRow isHeaderRow>
            <TableHeaderCell>Name</TableHeaderCell><TableHeaderCell>Role</TableHeaderCell><TableHeaderCell>Contact</TableHeaderCell>
            <TableHeaderCell>Unavailable</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell>
          </TableRow></TableHeader>
          {departments.map(department => <TableBody key={department}>
            <TableRow><TableCell colSpan={5} className="production-group-row">{department}</TableCell></TableRow>
            {shownCrew.filter(person => (person.department || 'Unassigned') === department).map(person => <TableRow key={person.id}>
              <TableCell><span className="production-person">
                <PersonAvatar project={project} person={person} size={40} decorative />
                <button type="button" className="production-person-name" onClick={() => setEditing({ person, type: 'Crew' })} aria-label={`Open ${person.name}`}>{person.name}</button>
              </span></TableCell>
              <TableCell>{person.role || '—'}</TableCell>
              <TableCell>{person.email || person.phone ? <span className="production-stack">{person.email && <span>{person.email}</span>}{person.phone && <small>{person.phone}</small>}</span> : <span className="production-muted">—</span>}</TableCell>
              <TableCell>{person.unavailable.length ? person.unavailable.join(', ') : <span className="production-muted">—</span>}</TableCell>
              <TableCell><StatusBadge person={person} /></TableCell>
            </TableRow>)}
          </TableBody>)}
        </Table></div>}
    </>}
    {editing && <PersonDialog key={editing.person?.id ?? `new-${editing.type}`} pane={pane} person={editing.person} type={editing.type}
      scenes={editing.person ? stats.get(editing.person.id)?.scenes.map(scene => scene.number) ?? [] : []} onClose={() => setEditing(undefined)} />}
  </section>;
}

function PersonDialog({ pane, person, type, scenes, onClose }: {
  pane: PaneProps;
  person?: Person;
  type: Person['type'];
  scenes: string[];
  onClose: () => void;
}) {
  const { project, plan, source, readOnly, update, updateProject } = pane;
  const [kind, setKind] = useState<Person['type']>(person?.type ?? type);
  const [error, setError] = useState('');
  const current = person && plan.people.find(item => item.id === person.id);

  function setPhoto(assetId: string | undefined, added: Parameters<typeof addAssets>[1]) {
    if (!current) return;
    updateProject((draft, active) => {
      const previous = active.people.find(item => item.id === current.id)?.photoAssetId;
      const next = removeAssets(addAssets(draft, added), previous && previous !== assetId ? [previous] : []);
      return setPlanPeople(next, active, active.people.map(item => item.id === current.id ? { ...item, photoAssetId: assetId } : item));
    }, assetId ? `Photo saved for ${current.name}.` : `Photo removed for ${current.name}.`);
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const unavailable = dateList(text(form, 'unavailable'));
    const holdDates = dateList(text(form, 'hold'));
    if (![...unavailable, ...holdDates].every(isShootDate)) return setError('Enter dates as YYYY-MM-DD separated by spaces or commas.');
    const name = text(form, 'name');
    if (!name) return setError(kind === 'Cast' ? 'Enter the character name.' : 'Enter a name.');
    if (current?.type === 'Cast' && kind === 'Crew' && plan.catalogue.some(item => item.personId === current.id)) {
      return setError('Review this person’s cast items before changing their role type.');
    }
    const status = text(form, 'status') as PersonStatus;
    const next: Person = {
      ...(current ?? {}), id: current?.id ?? newId(), source: current?.source ?? source, name, type: kind, role: text(form, 'role'),
      unavailable, holdDates, department: text(form, 'department') || undefined, email: text(form, 'email') || undefined,
      phone: text(form, 'phone') || undefined, agent: text(form, 'agent') || undefined, notes: text(form, 'notes') || undefined,
      status: PERSON_STATUSES.includes(status) ? status : undefined
    };
    if (update(active => ({
      ...active,
      people: current ? active.people.map(item => item.id === next.id ? next : item) : [...active.people, next],
      catalogue: current ? active.catalogue.map(item => item.personId === next.id && item.category === 'Cast' ? { ...item, name } : item) : active.catalogue
    }), 'Personnel saved.')) onClose();
  }

  function remove() {
    if (!current) return;
    if (plan.catalogue.some(item => item.personId === current.id && plan.tags.some(tag => tag.itemId === item.id && !tag.auto))) {
      return setError('Remove this person’s breakdown tags before deleting them.');
    }
    const items = new Set(plan.catalogue.filter(item => item.personId === current.id).map(item => item.id));
    if (updateProject((draft, active) => removeAssets(setPlanPeople(draft, {
      ...active, catalogue: active.catalogue.filter(item => !items.has(item.id)), tags: active.tags.filter(tag => !items.has(tag.itemId))
    }, active.people.filter(item => item.id !== current.id)), [current.photoAssetId]), `${current.name} removed.`)) onClose();
  }

  return <Dialog title={current ? current.name : kind === 'Cast' ? 'Add cast member' : 'Add crew member'} onClose={onClose}>
    <div className="production-person-dialog">
      <aside className="production-photo-panel">
        {current ? <>
          <PersonAvatar project={project} person={current} size={96} />
          {!readOnly && <PhotoDrop label={current.photoAssetId ? `Replace photo for ${current.name}` : `Upload photo for ${current.name}`}
            description="PNG or JPEG · resized to 512px" onAssets={assets => setPhoto(assets[0].id, assets)} />}
          {!readOnly && current.photoAssetId && <button type="button" className="production-link" onClick={() => setPhoto(undefined, [])}>
            <Trash2 size={14} aria-hidden="true" /> Remove photo</button>}
          {current.type === 'Cast' && <p className="production-muted">{scenes.length ? `In scenes ${scenes.join(', ')}` : 'Not tagged in any scene yet.'}</p>}
          {current.notInScript && <p className="production-form-error">This character no longer speaks in the active release. Their details are kept until you remove them.</p>}
        </> : <p className="production-muted production-photo-hint"><ImagePlus size={18} aria-hidden="true" /> Save first, then add a photo.</p>}
      </aside>
      <form className="production-form" onSubmit={save}>
        <div className="production-form-row">
          <label>Type<select name="type" value={kind} onChange={event => setKind(event.target.value === 'Cast' ? 'Cast' : 'Crew')} disabled={readOnly}><option>Cast</option><option>Crew</option></select></label>
          <label>Status<select name="status" defaultValue={current?.status ?? (kind === 'Cast' ? 'To cast' : 'Confirmed')} disabled={readOnly}>
            {PERSON_STATUSES.map(status => <option key={status}>{status}</option>)}</select></label>
        </div>
        <div className="production-form-row">
          <label>{kind === 'Cast' ? 'Character' : 'Name'}<input name="name" required defaultValue={current?.name} autoFocus readOnly={readOnly} /></label>
          <label>{kind === 'Cast' ? 'Artist' : 'Role'}<input name="role" defaultValue={current?.role} placeholder={kind === 'Cast' ? 'Actor playing the role' : 'Director of photography'} readOnly={readOnly} /></label>
        </div>
        {kind === 'Crew' && <label>Department<input name="department" list="production-departments" defaultValue={current?.department} readOnly={readOnly} />
          <datalist id="production-departments">{CREW_DEPARTMENTS.map(department => <option key={department} value={department} />)}</datalist></label>}
        <div className="production-form-row">
          <label>Email<input name="email" type="email" defaultValue={current?.email} readOnly={readOnly} /></label>
          <label>Phone<input name="phone" type="tel" defaultValue={current?.phone} readOnly={readOnly} /></label>
        </div>
        {kind === 'Cast' && <label>Agent<input name="agent" defaultValue={current?.agent} placeholder="Agency and agent" readOnly={readOnly} /></label>}
        <div className="production-form-row">
          <label>Unavailable dates<input name="unavailable" placeholder="YYYY-MM-DD, YYYY-MM-DD" defaultValue={current?.unavailable.join(', ')} readOnly={readOnly} /></label>
          <label>Paid hold dates<input name="hold" placeholder="YYYY-MM-DD" defaultValue={current?.holdDates?.join(', ')} readOnly={readOnly} /></label>
        </div>
        <label>Notes<textarea name="notes" rows={2} defaultValue={current?.notes} readOnly={readOnly} /></label>
        {error && <p className="production-form-error" role="alert">{error}</p>}
        {!readOnly && <div className="production-actions production-right">
          {current && <button type="button" className="production-button" onClick={remove}><Trash2 size={16} /> Remove</button>}
          <button type="submit" className="production-button production-primary"><UserRound size={16} /> {current ? 'Save person' : 'Add person'}</button>
        </div>}
      </form>
    </div>
  </Dialog>;
}

function setPlanPeople(project: Project, plan: ProductionPlan, people: Person[]): Project {
  return setProductionPlan(project, { ...plan, people });
}
