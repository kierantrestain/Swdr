import { AlertTriangle, ArrowRightLeft, CalendarDays, GripVertical, Plus, Rows3, Table2 } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import type { DragEvent, FormEvent, KeyboardEvent } from 'react';
import { newId } from '../model';
import { Dialog, Empty, SourceButton, displayDate } from './components';
import type { PaneProps } from './components';
import {
  castNumbers, dayStrips, eighthsLabel, estimateEighths, isShootDate, minutesAfterMidnight, orderedDays, placeStrip,
  sceneCast, sceneSetting, scheduleConflicts, scriptTargets
} from './model';
import type { ProductionScene, ShootDay, Strip } from './model';
import { ScriptChangeBadge, ScriptChangeBanner, ScriptChangeDialog } from './ScriptChanges';
import { DayScenePicker } from './DayScenePicker';
import { PersonAvatar } from './media';
import { ActionMenu, CastIds, StripLegend } from './StripParts';
import type { MenuAction } from './StripParts';

type Edit = { type: 'day'; detail?: ShootDay } | { type: 'strip'; dayId: string; detail?: Strip } | { type: 'unit' };
type View = 'Strips' | 'Table' | 'Calendar';
type DragItem = { stripId?: string; sceneId: string };
type DropTarget = { dayId: string | null; index: number };

const VIEWS: Array<{ name: View; icon: typeof Rows3 }> = [
  { name: 'Strips', icon: Rows3 }, { name: 'Table', icon: Table2 }, { name: 'Calendar', icon: CalendarDays }
];

function readText(data: FormData, key: string): string {
  return String(data.get(key) ?? '').trim();
}

function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function Stripboard(pane: PaneProps) {
  const { project, plan, snapshot, source, readOnly, update, onOpenSource, changes, reviewScript } = pane;
  const [unitFilter, setUnitFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [castFilter, setCastFilter] = useState('');
  const [view, setView] = useState<View>('Strips');
  const [showUnscheduled, setShowUnscheduled] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);
  const [edit, setEdit] = useState<Edit>();
  const [error, setError] = useState('');
  const [drag, setDrag] = useState<DragItem>();
  const [drop, setDrop] = useState<DropTarget>();
  const [changeFocus, setChangeFocus] = useState<string>();
  const [announcement, setAnnouncement] = useState('');
  const [focusGrip, setFocusGrip] = useState<string>();
  const hintId = useId();
  const days = orderedDays(plan);
  const visibleDays = days.filter(day => !unitFilter || day.unitId === unitFilter);
  const scenes = plan.scenes.filter(scene => scene.status === 'active');
  const scheduled = new Set(plan.strips.map(strip => strip.sceneId));
  const unscheduled = scenes.filter(scene => !scheduled.has(scene.id));
  const conflicts = scheduleConflicts(plan);
  const conflictedStrips = new Set(conflicts.flatMap(conflict => conflict.stripIds));
  const castIds = castNumbers(plan);
  const changeById = new Map(changes.map(change => [change.sceneId, change]));
  const castPeople = plan.people.filter(person => person.type === 'Cast');
  const script = useMemo(() => new Map(scriptTargets(project, snapshot.document).map(target => [target.id, {
    eighths: estimateEighths(target.blocks),
    synopsis: target.blocks.find(block => block.kind === 'action' && block.text.trim())?.text.trim() ?? ''
  }])), [project, snapshot]);
  const scriptFor = (scene: ProductionScene) => {
    const found = script.get(scene.source.sceneId ?? scene.source.shotId ?? '');
    return found ? { ...found, eighths: scene.eighths ?? found.eighths } : scene.eighths ? { eighths: scene.eighths, synopsis: '' } : undefined;
  };
  const dayNumber = (dayId: string) => days.findIndex(day => day.id === dayId) + 1;
  const unitName = (unitId: string) => plan.units.find(unit => unit.id === unitId)?.name ?? '';
  const locationName = (id?: string) => plan.locations.find(location => location.id === id)?.name ?? '';
  const matches = (strip: Strip) => (!locationFilter || locationFilter === strip.locationId) &&
    (!castFilter || sceneCast(plan, strip.sceneId).some(person => person.id === castFilter));

  useEffect(() => {
    if (!focusGrip) return;
    document.querySelector<HTMLElement>(`[data-grip="${CSS.escape(focusGrip)}"]`)?.focus();
    setFocusGrip(undefined);
  }, [focusGrip, plan]);

  function open(next: Edit) {
    setError('');
    setEdit(next);
  }

  function move(item: DragItem, dayId: string | null, index: number, message: string) {
    if (readOnly) return;
    const scene = plan.scenes.find(candidate => candidate.id === item.sceneId);
    const eighths = scene ? scriptFor(scene)?.eighths ?? 1 : 1;
    if (update(current => placeStrip(current, item, dayId, index, eighths), message)) {
      setAnnouncement(message);
      if (item.stripId && dayId) setFocusGrip(item.stripId);
    }
  }

  function step(strip: Strip, scene: ProductionScene, delta: -1 | 1) {
    const list = dayStrips(plan, strip.dayId);
    const position = list.findIndex(item => item.id === strip.id);
    const target = position + delta;
    const item = { stripId: strip.id, sceneId: scene.id };
    if (target >= 0 && target < list.length) {
      return move(item, strip.dayId, target, `Scene ${scene.number} moved to slot ${target + 1} on day ${dayNumber(strip.dayId)}.`);
    }
    const dayIndex = visibleDays.findIndex(day => day.id === strip.dayId);
    const next = visibleDays[dayIndex + delta];
    if (!next) return setAnnouncement(`Scene ${scene.number} is already at the ${delta < 0 ? 'start' : 'end'} of the schedule.`);
    move(item, next.id, delta < 0 ? dayStrips(plan, next.id).length : 0, `Scene ${scene.number} moved to day ${dayNumber(next.id)}.`);
  }

  function moveActions(strip: Strip, scene: ProductionScene): MenuAction[] {
    const list = dayStrips(plan, strip.dayId);
    const position = list.findIndex(item => item.id === strip.id);
    const item = { stripId: strip.id, sceneId: scene.id };
    return [
      { label: 'Move earlier', onSelect: () => step(strip, scene, -1), disabled: position === 0 && visibleDays[0]?.id === strip.dayId },
      { label: 'Move later', onSelect: () => step(strip, scene, 1), disabled: position === list.length - 1 && visibleDays.at(-1)?.id === strip.dayId },
      ...visibleDays.filter(day => day.id !== strip.dayId).map(day => ({
        label: `Move to day ${dayNumber(day.id)} · ${day.label}`,
        onSelect: () => move(item, day.id, dayStrips(plan, day.id).length, `Scene ${scene.number} moved to day ${dayNumber(day.id)}.`)
      })),
      { label: 'Return to unscheduled', onSelect: () => move(item, null, 0, `Scene ${scene.number} returned to unscheduled.`) }
    ];
  }

  function gripKeys(event: KeyboardEvent<HTMLButtonElement>, strip: Strip, scene: ProductionScene) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    step(strip, scene, event.key === 'ArrowUp' ? -1 : 1);
  }

  function dragProps(item: DragItem) {
    if (readOnly) return {};
    return {
      draggable: true,
      onDragStart: (event: DragEvent<HTMLElement>) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', item.stripId ?? item.sceneId);
        setDrag(item);
      },
      onDragEnd: () => { setDrag(undefined); setDrop(undefined); }
    };
  }

  function target(next: DropTarget) {
    setDrop(current => current?.dayId === next.dayId && current.index === next.index ? current : next);
  }

  function overStrip(event: DragEvent<HTMLElement>, dayId: string, strip: Strip) {
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    const others = dayStrips(plan, dayId).filter(item => item.id !== drag.stripId);
    const index = others.findIndex(item => item.id === strip.id);
    const box = event.currentTarget.getBoundingClientRect();
    target({ dayId, index: index < 0 ? others.length : index + (event.clientY > box.top + box.height / 2 ? 1 : 0) });
  }

  function overDay(event: DragEvent<HTMLElement>, dayId: string) {
    if (!drag) return;
    event.preventDefault();
    target({ dayId, index: dayStrips(plan, dayId).filter(item => item.id !== drag.stripId).length });
  }

  function dropOn(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const item = drag;
    const place = drop;
    setDrag(undefined);
    setDrop(undefined);
    if (!item || !place) return;
    const scene = plan.scenes.find(candidate => candidate.id === item.sceneId);
    const label = scene ? `Scene ${scene.number}` : 'Scene';
    move(item, place.dayId, place.index, place.dayId ? `${label} scheduled on day ${dayNumber(place.dayId)}.` : `${label} returned to unscheduled.`);
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edit || readOnly) return;
    const form = new FormData(event.currentTarget);
    if (edit.type === 'unit') {
      const name = readText(form, 'name');
      if (!name) return setError('Enter a unit name.');
      if (plan.units.some(unit => unit.name.toLowerCase() === name.toLowerCase())) return setError('Use a distinct unit name.');
      const unit = { id: newId(), name, source };
      if (update(current => ({ ...current, units: [...current.units, unit] }), 'Unit added.')) setEdit(undefined);
      return;
    }
    if (edit.type === 'day') {
      const date = readText(form, 'date');
      const label = readText(form, 'label');
      const unitId = readText(form, 'unit');
      const callTime = readText(form, 'call');
      const id = edit.detail?.id ?? newId();
      if (!label || !unitId || !isShootDate(date) || !Number.isFinite(minutesAfterMidnight(callTime))) {
        return setError('Enter a label, unit, calendar date and call time.');
      }
      if (plan.days.some(day => day.date === date && day.unitId === unitId && day.id !== id)) {
        return setError('This unit already has a shoot day on that date.');
      }
      const day: ShootDay = {
        id, date, label, unitId, callTime, notes: readText(form, 'notes'), source,
        weather: readText(form, 'weather') || undefined, hospital: readText(form, 'hospital') || undefined, parking: readText(form, 'parking') || undefined
      };
      const chosen = new Set(form.getAll('scenes').map(String));
      const offered = form.has('scene-picker');
      if (update(current => {
        let next = { ...current, days: edit.detail ? current.days.map(item => item.id === id ? day : item) : [...current.days, day] };
        if (!offered) return next;
        for (const strip of dayStrips(next, id).filter(item => !chosen.has(item.sceneId))) {
          next = placeStrip(next, { stripId: strip.id, sceneId: strip.sceneId }, null, 0);
        }
        const already = new Set(dayStrips(next, id).map(strip => strip.sceneId));
        for (const scene of scenes.filter(item => chosen.has(item.id) && !already.has(item.id))) {
          const existing = next.strips.find(strip => strip.sceneId === scene.id);
          next = placeStrip(next, { stripId: existing?.id, sceneId: scene.id }, id, dayStrips(next, id).length, scriptFor(scene)?.eighths ?? 1);
        }
        return next;
      }, chosen.size ? `Shoot day saved with ${chosen.size} ${chosen.size === 1 ? 'scene' : 'scenes'}.` : 'Shoot day saved.')) setEdit(undefined);
      return;
    }
    const selected = scenes.find(scene => scene.id === readText(form, 'scene'));
    const dayId = readText(form, 'day');
    const id = edit.detail?.id ?? newId();
    const startTime = readText(form, 'start');
    const minutes = Number(form.get('minutes'));
    const eighths = Number(form.get('eighths'));
    if (!selected || !plan.days.some(day => day.id === dayId)) return setError('Choose a scene and shoot day.');
    if (!Number.isInteger(minutes) || minutes < 1 || !Number.isInteger(eighths) || eighths < 0 ||
        !Number.isFinite(minutesAfterMidnight(startTime)) || minutesAfterMidnight(startTime) + minutes > 1440) {
      return setError('Set a valid start, duration and whole number of page eighths.');
    }
    const strip: Strip = {
      id, sceneId: selected.id, dayId, startTime, minutes, eighths, locationId: readText(form, 'location') || undefined, source: selected.source
    };
    if (update(current => ({
      ...current,
      strips: edit.detail ? current.strips.map(item => item.id === id ? strip : item) : [...current.strips, strip]
    }), 'Schedule saved.')) setEdit(undefined);
  }

  function stripCells(scene: ProductionScene, eighths: number, location: string, compact = false) {
    const setting = sceneSetting(scene.heading);
    const synopsis = scriptFor(scene)?.synopsis;
    return <>
      <span className="production-strip-number">{scene.number}</span>
      {!compact && <span className="production-strip-ie">{setting.interior || '—'}</span>}
      <span className="production-strip-set">
        <SourceButton source={scene.source} onOpenSource={onOpenSource}>{setting.set || 'Untitled scene'}</SourceButton>
        <small>{(compact ? [[setting.interior, setting.time].filter(Boolean).join(' '), synopsis] : [location, synopsis])
          .filter(Boolean).join(' · ') || 'No location assigned'}</small>
      </span>
      {!compact && <span className="production-strip-dn">{setting.time || '—'}</span>}
      <span className="production-strip-pages" aria-label={`${eighthsLabel(eighths)} pages`}>{eighthsLabel(eighths)}</span>
      {!compact && <span className="production-strip-cast"><CastIds cast={sceneCast(plan, scene.id)} ids={castIds} /></span>}
    </>;
  }

  function scheduledStrip(strip: Strip, day: ShootDay, all: Strip[]) {
    const scene = scenes.find(item => item.id === strip.sceneId)!;
    const change = changeById.get(scene.id);
    const others = drag ? all.filter(item => item.id !== drag.stripId) : all;
    const dropBefore = drop?.dayId === day.id && others[drop.index]?.id === strip.id && drag?.stripId !== strip.id;
    const classes = ['production-strip', `production-tone-${sceneSetting(scene.heading).tone}`,
      drag?.stripId === strip.id ? 'is-dragging' : '', dropBefore ? 'is-drop-before' : '', conflictedStrips.has(strip.id) ? 'is-conflict' : ''];
    return <li key={strip.id} className={classes.filter(Boolean).join(' ')} {...dragProps({ stripId: strip.id, sceneId: scene.id })}
      onDragOver={event => overStrip(event, day.id, strip)} aria-label={`Scene ${scene.number}, ${scene.heading || 'untitled'}, ${strip.startTime}`}>
      {!readOnly ? <button type="button" className="production-grip" data-grip={strip.id} aria-label={`Reorder scene ${scene.number}`}
        aria-describedby={hintId} onKeyDown={event => gripKeys(event, strip, scene)}><GripVertical size={15} aria-hidden="true" /></button>
        : <span className="production-grip" aria-hidden="true" />}
      {stripCells(scene, strip.eighths, locationName(strip.locationId ?? scene.locationId))}
      <span className="production-strip-time">{strip.startTime}<small>{strip.minutes} min</small></span>
      <span className="production-strip-flags">
        {conflictedStrips.has(strip.id) && <span className="production-strip-conflict" title="Review the schedule conflict for this scene">
          <AlertTriangle size={13} aria-hidden="true" /> Conflict</span>}
        {change && <ScriptChangeBadge change={change} onOpen={() => setChangeFocus(change.sceneId)} />}
      </span>
      {!readOnly && <span className="production-strip-actions">
        <button type="button" className="production-link" onClick={() => open({ type: 'strip', dayId: day.id, detail: strip })}
          aria-label={`Edit scheduled scene ${scene.number}`}>Edit</button>
        <ActionMenu label={`Move scene ${scene.number}`} actions={moveActions(strip, scene)} />
      </span>}
    </li>;
  }

  function stripDay(day: ShootDay) {
    const all = dayStrips(plan, day.id);
    const strips = all.filter(matches);
    const eighths = strips.reduce((sum, strip) => sum + strip.eighths, 0);
    const last = all.at(-1);
    const wrap = last ? minutesAfterMidnight(last.startTime) + last.minutes : NaN;
    const dropEnd = drop?.dayId === day.id && drop.index >= all.filter(item => item.id !== drag?.stripId).length;
    return <section key={day.id} className="production-day production-strip-day" aria-label={`Day ${dayNumber(day.id)} · ${day.label}`}>
      <header className="production-day-band">
        <h3>Day {dayNumber(day.id)} · {day.label}</h3>
        <span>{displayDate(day.date)} · {unitName(day.unitId)} · Call {day.callTime}{Number.isFinite(wrap) && ` · Wrap est. ${clock(wrap)}`}</span>
      </header>
      <ol className={`production-strip-list${dropEnd ? ' is-drop-end' : ''}`} onDragOver={event => overDay(event, day.id)} onDrop={dropOn}>
        {strips.flatMap((strip, index) => {
          const previous = strips[index - 1];
          const moveTo = previous?.locationId && strip.locationId && previous.locationId !== strip.locationId ? locationName(strip.locationId) : '';
          return [
            ...(moveTo ? [<li key={`${strip.id}-move`} className="production-company-move"><ArrowRightLeft size={13} aria-hidden="true" /> Company move to {moveTo}</li>] : []),
            scheduledStrip(strip, day, all)
          ];
        })}
        {strips.length === 0 && <li className="production-strip-empty">{all.length ? 'No scenes match these filters.' : readOnly ? 'No scenes scheduled for this day.' : 'Drag a scene here, or use Schedule scene.'}</li>}
      </ol>
      <footer className="production-day-total">
        <span>End of day {dayNumber(day.id)} · {strips.length} {strips.length === 1 ? 'scene' : 'scenes'} · {eighthsLabel(eighths)} pages</span>
        {!readOnly && <span className="production-actions">
          <button type="button" className="production-link" onClick={() => open({ type: 'strip', dayId: day.id })}><Plus size={14} aria-hidden="true" /> Schedule scene</button>
          <button type="button" className="production-link" onClick={() => open({ type: 'day', detail: day })}>Edit day</button>
        </span>}
      </footer>
    </section>;
  }

  function poolStrip(scene: ProductionScene) {
    const eighths = scriptFor(scene)?.eighths ?? 1;
    const tone = sceneSetting(scene.heading).tone;
    return <li key={scene.id} className={`production-strip production-strip-pool production-tone-${tone}${drag?.sceneId === scene.id && !drag.stripId ? ' is-dragging' : ''}`}
      {...dragProps({ sceneId: scene.id })} aria-label={`Unscheduled scene ${scene.number}, ${scene.heading || 'untitled'}`}>
      <span className="production-grip" aria-hidden="true">{!readOnly && <GripVertical size={15} />}</span>
      {stripCells(scene, eighths, '', true)}
      {!readOnly && visibleDays.length > 0 && <span className="production-strip-actions">
        <ActionMenu label={`Schedule scene ${scene.number}`} actions={visibleDays.map(day => ({
          label: `Add to day ${dayNumber(day.id)} · ${day.label}`,
          onSelect: () => move({ sceneId: scene.id }, day.id, dayStrips(plan, day.id).length, `Scene ${scene.number} scheduled on day ${dayNumber(day.id)}.`)
        }))} />
      </span>}
      {changeById.get(scene.id) && <span className="production-strip-flags"><ScriptChangeBadge change={changeById.get(scene.id)!} onOpen={() => setChangeFocus(scene.id)} /></span>}
    </li>;
  }

  const totalEighths = plan.strips.filter(strip => scenes.some(scene => scene.id === strip.sceneId)).reduce((sum, strip) => sum + strip.eighths, 0);

  return <>
    <div className="production-toolbar">
      <div className="production-actions production-filters">
        <select aria-label="Filter by unit" value={unitFilter} onChange={event => setUnitFilter(event.target.value)}>
          <option value="">All units</option>{plan.units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
        </select>
        <select aria-label="Filter by location" value={locationFilter} onChange={event => setLocationFilter(event.target.value)}>
          <option value="">All locations</option>{plan.locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select>
        <select aria-label="Filter by cast" value={castFilter} onChange={event => setCastFilter(event.target.value)}>
          <option value="">All cast</option>{castPeople.map(person => <option key={person.id} value={person.id}>{castIds.get(person.id)}. {person.name}</option>)}
        </select>
      </div>
      <div className="production-actions">
        {view === 'Table' && <button type="button" className="production-button" aria-pressed={showUnscheduled} onClick={() => setShowUnscheduled(value => !value)}>
          Unscheduled ({unscheduled.length})</button>}
        <div className="production-segmented" role="group" aria-label="Stripboard view">
          {VIEWS.map(({ name, icon: Icon }) => <button key={name} type="button" aria-pressed={view === name} onClick={() => setView(name)}>
            <Icon size={15} aria-hidden="true" /> {name}</button>)}
        </div>
      </div>
    </div>
    <ScriptChangeBanner changes={changes} release={snapshot.label} onOpen={() => setChangeFocus('')} />
    {!!conflicts.length && <div className="production-alert" role="status">
      <strong>{conflicts.length} schedule {conflicts.length === 1 ? 'conflict' : 'conflicts'}</strong>
      <span>{conflicts[0].message}</span>
      <button type="button" className="production-button" aria-expanded={showConflicts} onClick={() => setShowConflicts(value => !value)}>Review</button>
      {showConflicts && <ul>{conflicts.map((conflict, index) => {
        const strip = plan.strips.find(item => item.id === conflict.stripIds[0]);
        const omitted = strip && !scenes.some(scene => scene.id === strip.sceneId);
        return <li key={`${conflict.kind}-${index}`}>{conflict.message} {' '}
          {!readOnly && omitted && <button type="button" className="production-link" onClick={() => update(current => ({
            ...current, strips: current.strips.filter(item => item.id !== strip.id)
          }), 'Omitted scene removed from the live schedule.')}>Remove omitted strip</button>}
        </li>;
      })}</ul>}
    </div>}
    {view !== 'Calendar' && <div className="production-board-summary">
      <span>{days.length} shoot {days.length === 1 ? 'day' : 'days'} · {scenes.length - unscheduled.length} of {scenes.length} scenes scheduled · {eighthsLabel(totalEighths)} pages</span>
      <StripLegend />
    </div>}
    {view === 'Table' && showUnscheduled && <section className="production-inset" aria-label="Unscheduled scenes">
      <h3>Unscheduled scenes</h3>
      {unscheduled.length === 0 ? <p>Every active scene is on the schedule.</p> :
        <ul>{unscheduled.map(scene => <li key={scene.id}>
          <SourceButton source={scene.source} onOpenSource={onOpenSource}>{scene.number} · {scene.heading || 'Untitled scene'}</SourceButton>
        </li>)}</ul>}
    </section>}
    {visibleDays.length === 0 && <Empty action={!readOnly && <button type="button" className="production-button production-primary" onClick={() => open({ type: 'day' })}>
      <Plus size={16} /> Add shoot day</button>}>
      Add a dated shoot day, then schedule scenes from the released script.
    </Empty>}
    {view === 'Calendar' && <div className="production-calendar">
      {visibleDays.map(day => <article key={day.id} className="production-inset">
        <small>{displayDate(day.date)}</small>
        <h3>Day {dayNumber(day.id)} · {day.label}</h3>
        <p>{unitName(day.unitId)} · Crew call {day.callTime}</p>
        <p>{dayStrips(plan, day.id).length} scheduled scenes · {eighthsLabel(dayStrips(plan, day.id).reduce((sum, strip) => sum + strip.eighths, 0))} pages</p>
        {!readOnly && <button type="button" className="production-button" onClick={() => open({ type: 'day', detail: day })}>Edit day</button>}
      </article>)}
    </div>}
    {view === 'Strips' && (visibleDays.length > 0 || unscheduled.length > 0) && <div className="production-board">
      <div className="production-board-days">
        {!readOnly && <p id={hintId} className="production-visually-hidden">
          Drag strips between days, or focus a strip&rsquo;s handle and press the up or down arrow key. The actions menu moves a strip to another day.
        </p>}
        {visibleDays.map(stripDay)}
      </div>
      <aside className={`production-boneyard${drop?.dayId === null ? ' is-drop-target' : ''}`} aria-label="Unscheduled scenes"
        onDragOver={event => { if (drag?.stripId) { event.preventDefault(); target({ dayId: null, index: 0 }); } }} onDrop={dropOn}>
        <h3>Unscheduled <span className="production-count">{unscheduled.length}</span></h3>
        {unscheduled.length === 0
          ? <p className="production-muted">Every active scene is on the schedule.{!readOnly && ' Drag a strip here to take it off.'}</p>
          : <ol className="production-strip-list">{unscheduled.map(poolStrip)}</ol>}
        {castPeople.length > 0 && <div className="production-cast-key">
          <h3>Cast IDs</h3>
          <ul>{castPeople.map(person => <li key={person.id}><span className="production-cast-id">{castIds.get(person.id)}</span>
            <PersonAvatar project={project} person={person} size={32} decorative />
            <span><strong>{person.name}</strong>{person.role && <small>{person.role}</small>}</span></li>)}</ul>
        </div>}
      </aside>
    </div>}
    {view === 'Table' && visibleDays.map(day => {
      const all = dayStrips(plan, day.id);
      const strips = all.filter(matches);
      const eighths = strips.reduce((sum, strip) => sum + strip.eighths, 0);
      return <section key={day.id} className="production-day">
        <header className="production-day-band">
          <h3>Day {dayNumber(day.id)} · {day.label}</h3>
          <span>{displayDate(day.date)} · {unitName(day.unitId)} · {strips.length} {strips.length === 1 ? 'scene' : 'scenes'} · {eighthsLabel(eighths)} pages</span>
        </header>
        <div className="production-table-scroll">
          <table className="production-table">
            <thead><tr><th>Scene</th><th>Start</th><th>Scene heading</th><th>Location</th><th>Pages</th><th>Cast</th>{!readOnly && <th>Edit</th>}</tr></thead>
            <tbody>{strips.map(strip => {
              const scene = scenes.find(item => item.id === strip.sceneId)!;
              const cast = sceneCast(plan, scene.id);
              const change = changeById.get(scene.id);
              return <tr key={strip.id} className={`production-tone-${sceneSetting(scene.heading).tone}`}>
                <td><strong>{scene.number}</strong></td>
                <td>{strip.startTime}<small>{strip.minutes} min</small></td>
                <td><SourceButton source={scene.source} onOpenSource={onOpenSource}>{scene.heading || 'Untitled scene'}</SourceButton>
                  {change && <ScriptChangeBadge change={change} onOpen={() => setChangeFocus(change.sceneId)} />}</td>
                <td>{locationName(strip.locationId) || '—'}</td>
                <td>{eighthsLabel(strip.eighths)}</td>
                <td>{cast.map(person => `${castIds.get(person.id)} · ${person.name}`).join(', ') || '—'}{conflictedStrips.has(strip.id) && <small className="production-clash">Review conflict</small>}</td>
                {!readOnly && <td><button type="button" className="production-link" onClick={() => open({ type: 'strip', dayId: day.id, detail: strip })} aria-label={`Edit scheduled scene ${scene.number}`}>Edit</button></td>}
              </tr>;
            })}</tbody>
          </table>
        </div>
        {strips.length === 0 && <p className="production-day-empty">{all.length ? 'No scenes match these filters.' : 'No scenes scheduled for this day.'}</p>}
        {!readOnly && <div className="production-day-tools">
          <button type="button" className="production-button" onClick={() => open({ type: 'strip', dayId: day.id })}><Plus size={16} /> Schedule scene</button>
          <button type="button" className="production-link" onClick={() => open({ type: 'day', detail: day })}>Edit day</button>
        </div>}
      </section>;
    })}
    <div className="production-actions">
      {!readOnly && !!visibleDays.length && <button type="button" className="production-button" onClick={() => open({ type: 'day' })}><Plus size={16} /> Add shoot day</button>}
      {!readOnly && <button type="button" className="production-button" onClick={() => open({ type: 'unit' })}><Plus size={16} /> Add unit</button>}
    </div>
    <p className="production-visually-hidden" aria-live="polite">{announcement}</p>
    {changeFocus !== undefined && <ScriptChangeDialog plan={plan} changes={changes} focus={changeFocus || undefined} release={snapshot.label}
      onClose={() => setChangeFocus(undefined)} onReview={reviewScript} />}
    {edit && <Dialog title={edit.type === 'unit' ? 'Add unit' : edit.type === 'day' ? (edit.detail ? 'Edit shoot day' : 'Add shoot day') : (edit.detail ? 'Edit scheduled scene' : 'Schedule scene')} onClose={() => setEdit(undefined)}>
      <form className="production-form" onSubmit={save}>
        {edit.type === 'unit' && <label>Unit name<input name="name" required autoFocus placeholder="Unit B" /></label>}
        {edit.type === 'day' && <>
          <label>Day label<input name="label" defaultValue={edit.detail?.label} required autoFocus placeholder="Harbour and control room" /></label>
          <div className="production-form-row">
            <label>Shoot date<input name="date" type="date" defaultValue={edit.detail?.date} required /></label>
            <label>Unit<select name="unit" defaultValue={edit.detail?.unitId || unitFilter || plan.units[0]?.id} required>
              {plan.units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select></label>
            <label>Crew call<input name="call" type="time" defaultValue={edit.detail?.callTime ?? '08:00'} required /></label>
          </div>
          <label>Call-sheet notes<textarea name="notes" defaultValue={edit.detail?.notes} rows={3} placeholder="Basecamp, access and safety details" /></label>
          <div className="production-form-row">
            <label>Weather<input name="weather" defaultValue={edit.detail?.weather} placeholder="Forecast, sunrise and sunset" /></label>
            <label>Nearest hospital<input name="hospital" defaultValue={edit.detail?.hospital} placeholder="Name, address and A&E distance" /></label>
          </div>
          <label>Parking and basecamp<input name="parking" defaultValue={edit.detail?.parking} placeholder="Unit base, crew parking and shuttle" /></label>
          <DayScenePicker project={project} plan={plan} dayId={edit.detail?.id} scenes={scenes} eighthsOf={scene => scriptFor(scene)?.eighths ?? 1} />
        </>}
        {edit.type === 'strip' && <StripFields edit={edit} scenes={scenes} unscheduled={unscheduled} days={days} plan={plan}
          estimate={scene => scriptFor(scene)?.eighths ?? 1} />}
        {error && <p className="production-form-error" role="alert">{error}</p>}
        <div className="production-actions production-right">
          {edit.type === 'strip' && edit.detail && <button type="button" className="production-button" onClick={() => {
            const id = edit.detail?.id;
            if (update(current => ({ ...current, strips: current.strips.filter(item => item.id !== id) }), 'Scene returned to unscheduled.')) setEdit(undefined);
          }}>Remove from day</button>}
          <button type="submit" className="production-button production-primary">{edit.type === 'unit' ? 'Add unit' : edit.type === 'day' ? 'Save shoot day' : 'Save scheduled scene'}</button>
        </div>
      </form>
    </Dialog>}
  </>;
}

function StripFields({ edit, scenes, unscheduled, days, plan, estimate }: {
  edit: Extract<Edit, { type: 'strip' }>;
  scenes: ProductionScene[];
  unscheduled: ProductionScene[];
  days: ShootDay[];
  plan: PaneProps['plan'];
  estimate: (scene: ProductionScene) => number;
}) {
  const initial = scenes.find(scene => scene.id === (edit.detail?.sceneId ?? unscheduled[0]?.id ?? scenes[0]?.id));
  const [eighths, setEighths] = useState(String(edit.detail?.eighths ?? (initial ? estimate(initial) : 1)));
  return <>
    <label>Scene<select name="scene" defaultValue={initial?.id} required autoFocus onChange={event => {
      const scene = scenes.find(item => item.id === event.target.value);
      if (!edit.detail && scene) setEighths(String(estimate(scene)));
    }}>
      {scenes.map(scene => <option key={scene.id} value={scene.id}>{scene.number} · {scene.heading || 'Untitled scene'}</option>)}
    </select></label>
    <div className="production-form-row">
      <label>Shoot day<select name="day" defaultValue={edit.dayId} required>
        {days.map(day => <option key={day.id} value={day.id}>{day.date} · {plan.units.find(unit => unit.id === day.unitId)?.name} · {day.label}</option>)}
      </select></label>
      <label>Location<select name="location" defaultValue={edit.detail?.locationId ?? ''}>
        <option value="">Unassigned</option>{plan.locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
      </select></label>
    </div>
    <div className="production-form-row">
      <label>Start time<input name="start" type="time" defaultValue={edit.detail?.startTime ?? '09:00'} required /></label>
      <label>Minutes<input name="minutes" type="number" min={1} step={1} defaultValue={edit.detail?.minutes ?? 30} required /></label>
      <label>Page eighths<input name="eighths" type="number" min={0} step={1} value={eighths} onChange={event => setEighths(event.target.value)} required /></label>
    </div>
  </>;
}
