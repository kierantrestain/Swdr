import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Link } from '@astryxdesign/core/Link';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Table, pixel, proportional } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { ImagePlus, Plus, Trash2, UserRound } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { newId } from '../model';
import type { Project } from '../model';
import { Choice, Count, Dialog, FormError, Glyph, Pane } from './components';
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

interface PersonRow extends Record<string, unknown> { id: string; person: Person }
type PersonDraft = Record<'name' | 'role' | 'department' | 'email' | 'phone' | 'agent' | 'unavailable' | 'hold' | 'notes', string>;

/** A primary value with a supporting line beneath, or a dash. */
function Lines({ primary, secondary }: { primary?: string; secondary?: string }) {
  return primary || secondary ? <VStack gap={0}>{primary && <Text>{primary}</Text>}{secondary && <Text type="supporting" color="secondary">{secondary}</Text>}</VStack>
    : <Text color="secondary">—</Text>;
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

  const open = (person: Person) => <Link label={`Open ${person.name}`} onClick={() => setEditing({ person, type: person.type })}>{person.name}</Link>;
  const contact = (person: Person) => <Lines primary={person.email} secondary={person.phone} />;

  return <Pane label="Cast and crew directory" title="Cast & crew"
    description={`${cast.length} cast · ${crew.length} crew · ${withPhotos} of ${plan.people.length} with photos`}
    actions={!readOnly && <>
      <Button label="Add crew" icon={<Glyph icon={Plus} />} onClick={() => setEditing({ type: 'Crew' })} />
      <Button variant="primary" label="Add cast" icon={<Glyph icon={Plus} />} onClick={() => setEditing({ type: 'Cast' })} />
    </>}>
    <HStack gap={3} align="center" justify="between" wrap="wrap">
      <TextInput label="Search cast and crew" isLabelHidden type="search" value={query} onChange={setQuery} placeholder="Search name, artist, agent or department" hasClear width={340} />
      <SegmentedControl label="Show" value={filter} onChange={value => setFilter(value as Filter)}>
        {FILTERS.map(name => <SegmentedControlItem key={name} value={name} label={name} />)}
      </SegmentedControl>
    </HStack>
    {filter !== 'Crew' && <VStack gap={2}>
      <HStack gap={2} align="center"><Heading level={4}>Cast</Heading><Count value={shownCast.length} /></HStack>
      {!cast.length ? <Text color="secondary">No cast yet. Build the breakdown from the script to list every speaking role, or add cast by hand.</Text> :
        <Table<PersonRow> density="compact" hasHover idKey="id" data={shownCast.map(person => ({ id: person.id, person }))} columns={[
          { key: 'id', header: 'ID', width: pixel(56), renderCell: ({ person }) => <Badge label={String(ids.get(person.id) ?? '—')} /> },
          { key: 'character', header: 'Character', width: proportional(3, { minWidth: 200 }), renderCell: ({ person }) => {
            const stat = stats.get(person.id);
            return <HStack gap={3} align="center">
              <PersonAvatar project={project} person={person} size={40} decorative />
              <VStack gap={0} hAlign="start">{open(person)}
                <Text type="supporting" color="secondary">{stat?.scenes[0] ? `First seen sc. ${stat.scenes[0].number}` : 'Not tagged in a scene'}</Text></VStack>
            </HStack>;
          } },
          { key: 'artist', header: 'Artist', width: proportional(2), renderCell: ({ person }) => person.role || <Text color="secondary">Not cast</Text> },
          { key: 'contact', header: 'Contact', width: proportional(2), renderCell: ({ person }) => contact(person) },
          { key: 'agent', header: 'Agent', width: proportional(2), renderCell: ({ person }) => person.agent || <Text color="secondary">—</Text> },
          { key: 'scenes', header: 'Scenes', width: pixel(72), align: 'end', renderCell: ({ person }) => <Text weight="semibold">{stats.get(person.id)?.scenes.length ?? 0}</Text> },
          { key: 'pages', header: 'Pages', width: pixel(72), align: 'end', renderCell: ({ person }) => eighthsLabel(stats.get(person.id)?.eighths ?? 0) },
          { key: 'days', header: 'Days', width: pixel(64), align: 'end', renderCell: ({ person }) => stats.get(person.id)?.days ?? 0 },
          { key: 'status', header: 'Status', width: pixel(120), renderCell: ({ person }) => <StatusBadge person={person} /> }
        ]} />}
      {cast.length > 0 && !shownCast.length && <Text color="secondary">No cast match this search.</Text>}
    </VStack>}
    {filter !== 'Cast' && <VStack gap={2}>
      <HStack gap={2} align="center"><Heading level={4}>Crew</Heading><Count value={shownCrew.length} /></HStack>
      {!crew.length ? <Text color="secondary">Add crew by department so call sheets list every call.</Text> :
        departments.map(department => <VStack key={department} gap={1}>
          <Text type="label" color="secondary">{department}</Text>
          <Table<PersonRow> density="compact" hasHover idKey="id" aria-label={`${department} crew`}
            data={shownCrew.filter(person => (person.department || 'Unassigned') === department).map(person => ({ id: person.id, person }))} columns={[
              { key: 'name', header: 'Name', width: proportional(3, { minWidth: 200 }), renderCell: ({ person }) => <HStack gap={3} align="center">
                <PersonAvatar project={project} person={person} size={40} decorative />{open(person)}</HStack> },
              { key: 'role', header: 'Role', width: proportional(2), renderCell: ({ person }) => person.role || '—' },
              { key: 'contact', header: 'Contact', width: proportional(2), renderCell: ({ person }) => contact(person) },
              { key: 'unavailable', header: 'Unavailable', width: proportional(2), renderCell: ({ person }) => person.unavailable.length ? person.unavailable.join(', ') : <Text color="secondary">—</Text> },
              { key: 'status', header: 'Status', width: pixel(120), renderCell: ({ person }) => <StatusBadge person={person} /> }
            ]} />
        </VStack>)}
    </VStack>}
    {editing && <PersonDialog key={editing.person?.id ?? `new-${editing.type}`} pane={pane} person={editing.person} type={editing.type}
      scenes={editing.person ? stats.get(editing.person.id)?.scenes.map(scene => scene.number) ?? [] : []} onClose={() => setEditing(undefined)} />}
  </Pane>;
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
  const [status, setStatus] = useState<PersonStatus>(current?.status ?? (kind === 'Cast' ? 'To cast' : 'Confirmed'));
  const [draft, setDraft] = useState<PersonDraft>({
    name: current?.name ?? '', role: current?.role ?? '', department: current?.department ?? '', email: current?.email ?? '',
    phone: current?.phone ?? '', agent: current?.agent ?? '', unavailable: current?.unavailable.join(', ') ?? '',
    hold: current?.holdDates?.join(', ') ?? '', notes: current?.notes ?? ''
  });
  const field = (key: keyof PersonDraft) => ({ value: draft[key], onChange: (value: string) => setDraft({ ...draft, [key]: value }), isReadOnly: readOnly });
  const departments = [...new Set([...CREW_DEPARTMENTS, ...(draft.department ? [draft.department] : [])])];

  function setPhoto(assetId: string | undefined, added: Parameters<typeof addAssets>[1]) {
    if (!current) return;
    updateProject((draft, active) => {
      const previous = active.people.find(item => item.id === current.id)?.photoAssetId;
      const next = removeAssets(addAssets(draft, added), previous && previous !== assetId ? [previous] : []);
      return setPlanPeople(next, active, active.people.map(item => item.id === current.id ? { ...item, photoAssetId: assetId } : item));
    }, assetId ? `Photo saved for ${current.name}.` : `Photo removed for ${current.name}.`);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    const unavailable = dateList(draft.unavailable);
    const holdDates = dateList(draft.hold);
    if (![...unavailable, ...holdDates].every(isShootDate)) return setError('Enter dates as YYYY-MM-DD separated by spaces or commas.');
    const name = draft.name.trim();
    if (!name) return setError(kind === 'Cast' ? 'Enter the character name.' : 'Enter a name.');
    if (current?.type === 'Cast' && kind === 'Crew' && plan.catalogue.some(item => item.personId === current.id)) {
      return setError('Review this person’s cast items before changing their role type.');
    }
    const optional = (value: string) => value.trim() || undefined;
    const next: Person = {
      ...(current ?? {}), id: current?.id ?? newId(), source: current?.source ?? source, name, type: kind, role: draft.role.trim(),
      unavailable, holdDates, department: kind === 'Crew' ? optional(draft.department) : current?.department, email: optional(draft.email),
      phone: optional(draft.phone), agent: kind === 'Cast' ? optional(draft.agent) : current?.agent, notes: optional(draft.notes),
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

  return <Dialog title={current ? current.name : kind === 'Cast' ? 'Add cast member' : 'Add crew member'} width={760} onClose={onClose}>
    <HStack gap={5} align="start" wrap="wrap">
      <VStack as="aside" gap={3} width={200} hAlign="start">
        {current ? <>
          <PersonAvatar project={project} person={current} size={96} />
          {!readOnly && <PhotoDrop label={current.photoAssetId ? `Replace photo for ${current.name}` : `Upload photo for ${current.name}`}
            description="PNG or JPEG · resized to 512px" onAssets={assets => setPhoto(assets[0].id, assets)} />}
          {!readOnly && current.photoAssetId && <Link onClick={() => setPhoto(undefined, [])}><Glyph icon={Trash2} size="xsm" /> Remove photo</Link>}
          {current.type === 'Cast' && <Text type="supporting" color="secondary">{scenes.length ? `In scenes ${scenes.join(', ')}` : 'Not tagged in any scene yet.'}</Text>}
          {current.notInScript && <Banner status="warning" title="No longer in the script" description="This character no longer speaks in the active release. Their details are kept until you remove them." />}
        </> : <HStack gap={2} align="center"><Glyph icon={ImagePlus} color="secondary" /><Text color="secondary">Save first, then add a photo.</Text></HStack>}
      </VStack>
      <VStack as="form" gap={3} onSubmit={save} style={{ flex: '1 1 20rem', minWidth: 0 }}>
        <Grid columns={{ minWidth: 180, repeat: 'fit' }} gap={3}>
          <Choice label="Type" value={kind} onChange={value => setKind(value === 'Cast' ? 'Cast' : 'Crew')} isDisabled={readOnly}
            options={[{ value: 'Cast', label: 'Cast' }, { value: 'Crew', label: 'Crew' }]} />
          <Choice label="Status" value={status} onChange={value => setStatus(value as PersonStatus)} isDisabled={readOnly}
            options={PERSON_STATUSES.map(value => ({ value, label: value }))} />
          <TextInput label={kind === 'Cast' ? 'Character' : 'Name'} {...field('name')} isRequired />
          <TextInput label={kind === 'Cast' ? 'Artist' : 'Role'} {...field('role')} placeholder={kind === 'Cast' ? 'Actor playing the role' : 'Director of photography'} />
          {kind === 'Crew' && <Choice label="Department" value={draft.department} onChange={department => setDraft({ ...draft, department })} isDisabled={readOnly}
            placeholder="Choose a department" options={departments.map(value => ({ value, label: value }))} />}
          {kind === 'Cast' && <TextInput label="Agent" {...field('agent')} placeholder="Agency and agent" />}
          <TextInput label="Email" type="email" {...field('email')} />
          <TextInput label="Phone" type="tel" {...field('phone')} />
          <TextInput label="Unavailable dates" {...field('unavailable')} placeholder="YYYY-MM-DD, YYYY-MM-DD" />
          <TextInput label="Paid hold dates" {...field('hold')} placeholder="YYYY-MM-DD" />
        </Grid>
        <TextArea label="Notes" {...field('notes')} />
        <FormError>{error}</FormError>
        {!readOnly && <HStack gap={2} justify="end">
          {current && <Button label="Remove" icon={<Glyph icon={Trash2} />} onClick={remove} />}
          <Button type="submit" variant="primary" icon={<Glyph icon={UserRound} />} label={current ? 'Save person' : 'Add person'} />
        </HStack>}
      </VStack>
    </HStack>
  </Dialog>;
}

function setPlanPeople(project: Project, plan: ProductionPlan, people: Person[]): Project {
  return setProductionPlan(project, { ...plan, people });
}
