import { useState } from 'react';
import type { Project } from '../model';
import { castByScene } from './insights';
import { PersonAvatar } from './media';
import { castNumbers, dayStrips, defaultStripMinutes, eighthsLabel, sceneSetting } from './model';
import type { Person, ProductionPlan, ProductionScene } from './model';

/**
 * Picks the scenes for a shoot day inside the day dialog: unscheduled scenes and the day's own, with a
 * running page total, estimated shooting time and the cast the day calls. Checked scenes post as `scenes`.
 */
export function DayScenePicker({ project, plan, dayId, scenes, eighthsOf }: {
  project: Project;
  plan: ProductionPlan;
  dayId?: string;
  scenes: ProductionScene[];
  eighthsOf: (scene: ProductionScene) => number;
}) {
  const onDay = new Set(dayId ? dayStrips(plan, dayId).map(strip => strip.sceneId) : []);
  const scheduled = new Set(plan.strips.map(strip => strip.sceneId));
  const offered = scenes.filter(scene => onDay.has(scene.id) || !scheduled.has(scene.id));
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(onDay));
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
  const toggle = (id: string, on: boolean) => setChosen(current => {
    const next = new Set(current);
    if (on) next.add(id); else next.delete(id);
    return next;
  });

  return <fieldset className="production-day-picker">
    <legend>Scenes for this day</legend>
    <input type="hidden" name="scene-picker" value="1" />
    {!offered.length ? <p className="production-muted">Every scene is already scheduled on another day.</p> : <>
      <div className="production-day-picker-tools">
        <span className="production-muted">{offered.length - onDay.size} unscheduled{onDay.size ? ` · ${onDay.size} on this day` : ''}</span>
        {locations.length > 1 && <select aria-label="Show scenes at" value={location} onChange={event => setLocation(event.target.value)}>
          <option value="">All locations</option>{locations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>}
      </div>
      <ul className="production-day-picker-list">{visible.map(scene => {
        const setting = sceneSetting(scene.heading);
        const sceneCast: Person[] = cast.get(scene.id) ?? [];
        return <li key={scene.id} className={`production-tone-${setting.tone}`}>
          <label>
            <input type="checkbox" name="scenes" value={scene.id} checked={chosen.has(scene.id)} onChange={event => toggle(scene.id, event.target.checked)} />
            <strong>{scene.number}</strong>
            <span className="production-day-picker-heading">{scene.heading || 'Untitled scene'}</span>
            <span className="production-muted">{eighthsLabel(eighthsOf(scene))} pg</span>
            <span className="production-muted">{sceneCast.length ? sceneCast.map(person => ids.get(person.id)).join(', ') : '—'}</span>
          </label>
        </li>;
      })}</ul>
      <div className="production-day-picker-total" aria-live="polite">
        <strong>{picked.length} {picked.length === 1 ? 'scene' : 'scenes'} · {eighthsLabel(eighths)} pages</strong>
        <span>about {Math.floor(minutes / 60)}h {String(minutes % 60).padStart(2, '0')}m</span>
        <span className="production-face-row">{people.length ? <>{people.slice(0, 6).map(person => <PersonAvatar key={person.id} project={project} person={person} size={24} decorative />)}
          <span>Cast {people.map(person => ids.get(person.id)).join(', ')}</span></> : 'No cast called'}</span>
      </div>
    </>}
  </fieldset>;
}
