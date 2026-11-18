import { newId } from '../model';
import type { Block, Project } from '../model';
import { activeProductionSource, getProductionPlan, releasedScript, sceneSetting, scriptTargets, setProductionPlan } from './model';
import type { BreakdownTag, CatalogueItem, Location, Person, ProductionPlan, ProductionScene } from './model';
import { scriptPages } from './pages';

/** A character cue reduced to the role it names: extensions such as (V.O.), (O.S.) and (CONT'D) are dropped. */
export function cueName(text: string): string {
  return text.normalize('NFKC')
    .replace(/\(.*?\)/g, ' ')
    .replace(/\^/g, ' ')
    .replace(/\s+CONT['’]?D\.?$/i, '')
    .replace(/[:\s]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase('en-GB');
}

/** "DR. MAYA O'NEILL" → "Dr. Maya O'Neill". */
export function displayName(text: string): string {
  return text.toLocaleLowerCase('en-GB').replace(/(?<=^|[\s\-/.(]|(?:^|\s)[a-z]')[a-z]/g, letter => letter.toLocaleUpperCase('en-GB'));
}

function setKey(text: string): string {
  return text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleUpperCase('en-GB');
}

export interface SceneAnalysis {
  /** The production scene ID. */
  sceneId: string;
  number: string;
  position: number;
  eighths: number;
  characters: string[];
  set: string;
  setKey: string;
}

export interface ScriptAnalysis {
  pages: number;
  scenes: SceneAnalysis[];
  characters: Array<{ name: string; scenes: string[]; first: string; eighths: number }>;
  sets: Array<{ key: string; name: string; scenes: string[] }>;
}

function speakers(blocks: readonly Block[]): string[] {
  return [...new Set(blocks.filter(block => block.kind === 'character').map(block => cueName(block.text))
    .filter(name => name && name.length <= 60))];
}

/** Reads cast, sets and page eighths from the issued script a production plan uses. */
export function analyseScript(project: Project, plan: ProductionPlan): ScriptAnalysis {
  const snapshot = releasedScript(project, plan.documentId, plan.activeSnapshotId);
  if (!snapshot) throw new Error('The issued script is missing.');
  if (snapshot.document.kind === 'av') throw new Error('Script breakdown reads screenplays and stage plays.');
  const { pages, eighths } = scriptPages(snapshot.document);
  const targets = new Map(scriptTargets(project, snapshot.document).map(target => [target.id, target]));
  const scenes = plan.scenes.flatMap((scene, position): SceneAnalysis[] => {
    const target = scene.status === 'active' ? targets.get(scene.source.sceneId ?? '') : undefined;
    if (!target) return [];
    const { set } = sceneSetting(target.heading);
    return [{
      sceneId: scene.id, number: scene.number, position, eighths: eighths.get(target.id) ?? 1,
      characters: speakers(target.blocks), set: target.heading.trim() ? set : '', setKey: target.heading.trim() ? setKey(set) : ''
    }];
  });
  const characters = new Map<string, { name: string; scenes: string[]; first: string; firstAt: number; eighths: number }>();
  const sets = new Map<string, { key: string; name: string; scenes: string[] }>();
  for (const scene of scenes) {
    for (const name of scene.characters) {
      const entry = characters.get(name) ?? { name, scenes: [], first: scene.number, firstAt: scene.position, eighths: 0 };
      entry.scenes.push(scene.sceneId);
      entry.eighths += scene.eighths;
      characters.set(name, entry);
    }
    if (scene.setKey) {
      const entry = sets.get(scene.setKey) ?? { key: scene.setKey, name: displayName(scene.set), scenes: [] };
      entry.scenes.push(scene.sceneId);
      sets.set(scene.setKey, entry);
    }
  }
  return {
    pages, scenes,
    characters: [...characters.values()].sort((a, b) => b.scenes.length - a.scenes.length || a.firstAt - b.firstAt)
      .map(({ name, scenes: ids, first, eighths: total }) => ({ name, scenes: ids, first, eighths: total })),
    sets: [...sets.values()]
  };
}

export interface BreakdownSummary {
  scenes: number;
  pages: number;
  eighths: number;
  cast: number;
  locations: number;
  addedCast: string[];
  addedLocations: string[];
  removedCast: string[];
  removedLocations: string[];
  tagsAdded: number;
}

export function summaryMessage(summary: BreakdownSummary): string {
  const parts = [
    `${summary.scenes} ${summary.scenes === 1 ? 'scene' : 'scenes'} (${summary.pages} ${summary.pages === 1 ? 'page' : 'pages'})`,
    `${summary.cast} speaking ${summary.cast === 1 ? 'role' : 'roles'}${summary.addedCast.length && summary.addedCast.length !== summary.cast ? ` (${summary.addedCast.length} new)` : ''}`,
    `${summary.locations} ${summary.locations === 1 ? 'location' : 'locations'}${summary.addedLocations.length && summary.addedLocations.length !== summary.locations ? ` (${summary.addedLocations.length} new)` : ''}`
  ];
  const flagged = summary.removedCast.length + summary.removedLocations.length;
  return `Breakdown built from the script: ${parts.join(', ')}.${flagged ? ` ${flagged} no longer in the script ${flagged === 1 ? 'is' : 'are'} flagged for review.` : ''}`;
}

/**
 * Builds or refreshes the breakdown from the issued script: one cast member per speaking role (cast IDs
 * by scene count on first build), one location per set named in the scene headings, the cast tagged in
 * each scene, and page eighths from the page layout. Manual details are kept; anything that has left the
 * script is flagged rather than deleted.
 */
export function syncBreakdown(project: Project, plan: ProductionPlan, at = new Date().toISOString()): { plan: ProductionPlan; summary: BreakdownSummary } {
  const analysis = analyseScript(project, plan);
  const baseSource = activeProductionSource(project, plan);
  const people: Person[] = plan.people.map(person => ({ ...person }));
  const addedCast: string[] = [];
  const castByName = new Map<string, Person>();
  for (const character of analysis.characters) {
    let person = people.find(item => item.type === 'Cast' && item.scriptName === character.name)
      ?? people.find(item => item.type === 'Cast' && !item.scriptName && cueName(item.name) === character.name);
    if (!person) {
      person = { id: newId(), source: baseSource, name: displayName(character.name), type: 'Cast', role: '', unavailable: [], status: 'To cast' };
      people.push(person);
      addedCast.push(person.name);
    }
    person.scriptName = character.name;
    delete person.notInScript;
    castByName.set(character.name, person);
  }
  const removedCast: string[] = [];
  for (const person of people) {
    if (person.type === 'Cast' && person.scriptName && !castByName.has(person.scriptName)) {
      if (!person.notInScript) removedCast.push(person.name);
      person.notInScript = true;
    }
  }

  const catalogue: CatalogueItem[] = [...plan.catalogue];
  const itemByPerson = new Map<string, string>();
  for (const person of castByName.values()) {
    let item = catalogue.find(entry => entry.category === 'Cast' && entry.personId === person.id);
    if (!item) {
      item = { id: newId(), source: baseSource, category: 'Cast', name: person.name, personId: person.id, notes: '' };
      catalogue.push(item);
    }
    itemByPerson.set(person.id, item.id);
  }

  const wanted = new Set<string>();
  const sceneById = new Map(plan.scenes.map(scene => [scene.id, scene]));
  for (const scene of analysis.scenes) {
    for (const name of scene.characters) wanted.add(`${scene.sceneId}|${itemByPerson.get(castByName.get(name)!.id)}`);
  }
  const autoItems = new Set(itemByPerson.values());
  const analysed = new Set(analysis.scenes.map(scene => scene.sceneId));
  const tags: BreakdownTag[] = plan.tags.filter(tag => !(tag.auto && autoItems.has(tag.itemId) && analysed.has(tag.sceneId) && !wanted.has(`${tag.sceneId}|${tag.itemId}`)));
  const present = new Set(tags.map(tag => `${tag.sceneId}|${tag.itemId}`));
  let tagsAdded = 0;
  for (const key of wanted) {
    if (present.has(key)) continue;
    const [sceneId, itemId] = key.split('|');
    tags.push({ id: newId(), sceneId, itemId, notes: '', source: sceneById.get(sceneId)!.source, reviewed: true, auto: true });
    tagsAdded++;
  }

  const locations: Location[] = plan.locations.map(location => ({ ...location }));
  const addedLocations: string[] = [];
  const locationBySet = new Map<string, Location>();
  for (const set of analysis.sets) {
    let location = locations.find(item => item.scriptSet === set.key)
      ?? locations.find(item => !item.scriptSet && setKey(item.name) === set.key);
    if (!location) {
      location = { id: newId(), source: baseSource, name: set.name, address: '', notes: '' };
      locations.push(location);
      addedLocations.push(location.name);
    }
    location.scriptSet = set.key;
    delete location.notInScript;
    locationBySet.set(set.key, location);
  }
  const removedLocations: string[] = [];
  for (const location of locations) {
    if (location.scriptSet && !locationBySet.has(location.scriptSet)) {
      if (!location.notInScript) removedLocations.push(location.name);
      location.notInScript = true;
    }
  }

  const locationIds = new Set(locations.map(location => location.id));
  const analysisById = new Map(analysis.scenes.map(scene => [scene.sceneId, scene]));
  const scenes = plan.scenes.map((scene): ProductionScene => {
    const found = analysisById.get(scene.id);
    if (!found) return scene;
    const locationId = scene.locationId && locationIds.has(scene.locationId) ? scene.locationId : locationBySet.get(found.setKey)?.id;
    return { ...scene, eighths: found.eighths, ...(locationId ? { locationId } : {}) };
  });

  return {
    plan: { ...plan, people, catalogue, tags, locations, scenes, breakdownSyncedAt: at },
    summary: {
      scenes: analysis.scenes.length, pages: analysis.pages, eighths: analysis.scenes.reduce((sum, scene) => sum + scene.eighths, 0),
      cast: castByName.size, locations: locationBySet.size, addedCast, addedLocations, removedCast, removedLocations, tagsAdded
    }
  };
}

/** Applies the breakdown to a project's plan for a script, returning the project and a summary. */
export function syncProjectBreakdown(project: Project, documentId: string): { project: Project; summary: BreakdownSummary } {
  const plan = getProductionPlan(project, documentId);
  if (!plan) throw new Error('Start production for this script first.');
  const result = syncBreakdown(project, plan);
  return { project: setProductionPlan(project, result.plan), summary: result.summary };
}
