import type { Project, Snapshot } from '../model';
import { dayOutOfDays, estimateEighths, sceneSetting, scriptTargets } from './model';
import type { Person, ProductionPlan, ProductionScene } from './model';

/** Cast tagged in each scene (reviewed tags only), keyed by production scene ID. */
export function castByScene(plan: ProductionPlan): Map<string, Person[]> {
  const people = new Map(plan.people.filter(person => person.type === 'Cast').map(person => [person.id, person]));
  const personByItem = new Map(plan.catalogue.flatMap(item => item.category === 'Cast' && item.personId && people.has(item.personId) ? [[item.id, item.personId]] : []));
  const result = new Map<string, Person[]>();
  for (const tag of plan.tags) {
    if (tag.reviewed === false) continue;
    const personId = personByItem.get(tag.itemId);
    if (!personId) continue;
    const list = result.get(tag.sceneId) ?? [];
    if (!list.some(person => person.id === personId)) list.push(people.get(personId)!);
    result.set(tag.sceneId, list);
  }
  const order = [...people.keys()];
  for (const list of result.values()) list.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return result;
}

/** Page eighths for each scene: from the layout when the breakdown measured it, else an estimate. */
export function sceneEighthsMap(project: Project, plan: ProductionPlan, snapshot: Snapshot): Map<string, number> {
  const estimates = new Map(scriptTargets(project, snapshot.document).map(target => [target.id, estimateEighths(target.blocks)]));
  return new Map(plan.scenes.map(scene => [scene.id, scene.eighths ?? estimates.get(scene.source.sceneId ?? scene.source.shotId ?? '') ?? 1]));
}

export interface CastStats {
  scenes: ProductionScene[];
  eighths: number;
  days: number;
}

export function castStats(plan: ProductionPlan, eighths: Map<string, number>): Map<string, CastStats> {
  const byScene = castByScene(plan);
  const worked = new Map(dayOutOfDays(plan).rows.map(row => [row.person.id, row.worked]));
  const stats = new Map<string, CastStats>();
  for (const scene of plan.scenes) {
    if (scene.status !== 'active') continue;
    for (const person of byScene.get(scene.id) ?? []) {
      const entry = stats.get(person.id) ?? { scenes: [], eighths: 0, days: worked.get(person.id) ?? 0 };
      entry.scenes.push(scene);
      entry.eighths += eighths.get(scene.id) ?? 0;
      stats.set(person.id, entry);
    }
  }
  return stats;
}

export interface LocationStats {
  scenes: ProductionScene[];
  settings: string[];
  day: number;
  night: number;
  eighths: number;
}

export function locationStats(plan: ProductionPlan, eighths: Map<string, number>): Map<string, LocationStats> {
  const stats = new Map<string, LocationStats>();
  for (const scene of plan.scenes) {
    if (scene.status !== 'active' || !scene.locationId) continue;
    const entry = stats.get(scene.locationId) ?? { scenes: [], settings: [], day: 0, night: 0, eighths: 0 };
    const setting = sceneSetting(scene.heading);
    entry.scenes.push(scene);
    if (setting.interior && !entry.settings.includes(setting.interior)) entry.settings.push(setting.interior);
    if (setting.tone.endsWith('night')) entry.night++;
    else entry.day++;
    entry.eighths += eighths.get(scene.id) ?? 0;
    stats.set(scene.locationId, entry);
  }
  return stats;
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toLocaleUpperCase('en-GB');
}
