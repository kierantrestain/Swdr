import { CalendarDays, Plus } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { newId } from '../model';
import { Dialog, Empty, SourceButton, displayDate } from './components';
import type { PaneProps } from './components';
import { dayStrips, eighthsLabel, isShootDate, minutesAfterMidnight, orderedDays, sceneCast, scheduleConflicts } from './model';
import type { ShootDay, Strip } from './model';

type Edit = { type: 'day'; detail?: ShootDay } | { type: 'strip'; dayId: string; detail?: Strip } | { type: 'unit' };

function rowTone(heading: string): string {
  const external = /^(EXT\.|EXT\/INT\.)/.test(heading.toUpperCase());
  const night = /\b(NIGHT|DUSK|EVENING)\b/i.test(heading);
  if (external) return night ? 'production-row-blue' : 'production-row-green';
  return night ? 'production-row-lilac' : 'production-row-sand';
}

function readText(data: FormData, key: string): string {
  return String(data.get(key) ?? '').trim();
}

export function Stripboard(pane: PaneProps) {
  const { plan, source, readOnly, update, onOpenSource } = pane;
  const [unitFilter, setUnitFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [castFilter, setCastFilter] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [showUnscheduled, setShowUnscheduled] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);
  const [edit, setEdit] = useState<Edit>();
  const [error, setError] = useState('');
  const days = orderedDays(plan);
  const visibleDays = days.filter(day => !unitFilter || day.unitId === unitFilter);
  const scenes = plan.scenes.filter(scene => scene.status === 'active');
  const scheduled = new Set(plan.strips.map(strip => strip.sceneId));
  const unscheduled = scenes.filter(scene => !scheduled.has(scene.id));
  const conflicts = scheduleConflicts(plan);
  const conflictedStrips = new Set(conflicts.flatMap(conflict => conflict.stripIds));

  function open(next: Edit) {
    setError('');
    setEdit(next);
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
      const day: ShootDay = { id, date, label, unitId, callTime, notes: readText(form, 'notes'), source };
      if (update(current => ({
        ...current,
        days: edit.detail ? current.days.map(item => item.id === id ? day : item) : [...current.days, day]
      }), 'Shoot day saved.')) setEdit(undefined);
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
          <option value="">All cast</option>{plan.people.filter(person => person.type === 'Cast').map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
      </div>
      <div className="production-actions">
        <button type="button" className="production-button" aria-pressed={showCalendar} onClick={() => setShowCalendar(value => !value)}>
          <CalendarDays size={16} /> Calendar</button>
        <button type="button" className="production-button" aria-pressed={showUnscheduled} onClick={() => setShowUnscheduled(value => !value)}>
          Unscheduled ({unscheduled.length})</button>
      </div>
    </div>
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
    {showUnscheduled && <section className="production-inset" aria-label="Unscheduled scenes">
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
    {showCalendar ? <div className="production-calendar">
      {visibleDays.map((day, index) => <article key={day.id} className="production-inset">
        <small>{displayDate(day.date)}</small>
        <h3>Day {index + 1} · {day.label}</h3>
        <p>{plan.units.find(unit => unit.id === day.unitId)?.name} · Crew call {day.callTime}</p>
        <p>{dayStrips(plan, day.id).length} scheduled scenes</p>
        {!readOnly && <button type="button" className="production-button" onClick={() => open({ type: 'day', detail: day })}>Edit day</button>}
      </article>)}
    </div> : visibleDays.map(day => {
      const all = dayStrips(plan, day.id);
      const strips = all.filter(strip => (!locationFilter || locationFilter === strip.locationId) && (!castFilter || sceneCast(plan, strip.sceneId).some(person => person.id === castFilter)));
      const eighths = strips.reduce((sum, strip) => sum + strip.eighths, 0);
      return <section key={day.id} className="production-day">
        <header className="production-day-band">
          <h3>Day {days.findIndex(item => item.id === day.id) + 1} · {day.label}</h3>
          <span>{displayDate(day.date)} · {plan.units.find(unit => unit.id === day.unitId)?.name} · {strips.length} scenes · {eighthsLabel(eighths)} pages</span>
        </header>
        <div className="production-table-scroll">
          <table className="production-table">
            <thead><tr><th>Scene</th><th>Start</th><th>Scene heading</th><th>Location</th><th>Pages</th><th>Cast</th>{!readOnly && <th>Edit</th>}</tr></thead>
            <tbody>{strips.map(strip => {
              const scene = scenes.find(item => item.id === strip.sceneId)!;
              const names = sceneCast(plan, scene.id).map(person => person.name);
              return <tr key={strip.id} className={rowTone(scene.heading)}>
                <td><strong>{scene.number}</strong></td>
                <td>{strip.startTime}<small>{strip.minutes} min</small></td>
                <td><SourceButton source={scene.source} onOpenSource={onOpenSource}>{scene.heading || 'Untitled scene'}</SourceButton></td>
                <td>{plan.locations.find(location => location.id === strip.locationId)?.name || '—'}</td>
                <td>{eighthsLabel(strip.eighths)}</td>
                <td>{names.join(', ') || '—'}{conflictedStrips.has(strip.id) && <small className="production-clash">Review conflict</small>}</td>
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
        </>}
        {edit.type === 'strip' && <>
          <label>Scene<select name="scene" defaultValue={edit.detail?.sceneId ?? unscheduled[0]?.id ?? scenes[0]?.id} required autoFocus>
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
            <label>Page eighths<input name="eighths" type="number" min={0} step={1} defaultValue={edit.detail?.eighths ?? 1} required /></label>
          </div>
        </>}
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
