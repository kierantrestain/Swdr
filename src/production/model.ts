import { newId, sceneList, sourceFor } from '../model';
import type { Block, DocumentModel, Project, Snapshot, SourceRef } from '../model';

export const CATALOGUE_CATEGORIES = ['Cast', 'Prop', 'Wardrobe', 'Hair and make-up', 'Set dressing', 'Equipment', 'Vehicle', 'Sound', 'VFX', 'Other'] as const;
export type CatalogueCategory = (typeof CATALOGUE_CATEGORIES)[number];

interface SourcedRecord {
  id: string;
  source: SourceRef;
}

export interface ProductionScene extends SourcedRecord {
  number: string;
  heading: string;
  status: 'active' | 'omitted';
}

export interface Person extends SourcedRecord {
  name: string;
  type: 'Cast' | 'Crew';
  role: string;
  unavailable: string[];
  holdDates?: string[];
}

export interface Location extends SourcedRecord {
  name: string;
  address: string;
  notes: string;
}

export interface CatalogueItem extends SourcedRecord {
  category: CatalogueCategory;
  name: string;
  personId?: string;
  notes: string;
}

export interface BreakdownTag extends SourcedRecord {
  sceneId: string;
  itemId: string;
  notes: string;
  reviewed?: boolean;
}

export interface ProductionShot extends SourcedRecord {
  sceneId: string;
  description: string;
  framing: string;
  setup: string;
  assetId?: string;
}

export interface LookbookCard extends SourcedRecord {
  title: string;
  notes: string;
  assetId: string;
}

export interface Unit extends SourcedRecord {
  name: string;
}

export interface ShootDay extends SourcedRecord {
  date: string;
  unitId: string;
  label: string;
  callTime: string;
  notes: string;
}

export interface Strip extends SourcedRecord {
  dayId: string;
  sceneId: string;
  locationId?: string;
  startTime: string;
  minutes: number;
  eighths: number;
}

export interface BudgetLine extends SourcedRecord {
  category: string;
  name: string;
  quantity: number;
  unitCostPence: number;
  actualPence: number;
}

export interface CallSheetScene {
  id: string;
  number: string;
  heading: string;
  source: SourceRef;
  location?: { name: string; address: string };
  cast: string[];
  startTime: string;
  minutes: number;
}

export interface CallSheet extends SourcedRecord {
  dayId: string;
  date: string;
  unit: string;
  projectTitle: string;
  documentTitle: string;
  draft: string;
  version: number;
  supersedesId?: string;
  issuedAt: string;
  label: string;
  callTime: string;
  notes: string;
  scenes: CallSheetScene[];
  recipients: Array<{ id: string; name: string; role: string; callTime: string }>;
}

export interface CallSheetDelivery {
  id: string;
  callSheetId: string;
  personId: string;
  sentAt: string;
  acknowledgedAt?: string;
}

export interface ProductionOutput extends SourcedRecord {
  kind: 'schedule' | 'sides' | 'budget' | 'dood' | 'prep' | 'wrap';
  filename: string;
  content: string;
  issuedAt: string;
}

export interface ProductionPlan {
  documentId: string;
  activeSnapshotId: string;
  scenes: ProductionScene[];
  catalogue: CatalogueItem[];
  tags: BreakdownTag[];
  people: Person[];
  locations: Location[];
  shots: ProductionShot[];
  lookbook: LookbookCard[];
  units: Unit[];
  days: ShootDay[];
  strips: Strip[];
  budget: BudgetLine[];
  callSheets: CallSheet[];
  deliveries: CallSheetDelivery[];
  outputs: ProductionOutput[];
}

interface ProductionModule {
  version: 1;
  documents: Record<string, ProductionPlan>;
}

export interface ScriptTarget {
  id: string;
  number: string;
  heading: string;
  position: number;
  source: SourceRef;
  blocks: Block[];
}

export interface RevisionMatch {
  scene: ProductionScene;
  suggested?: ScriptTarget;
  quality: 'identity' | 'unique heading' | 'review';
  moved: boolean;
  edited: boolean;
}

export interface RevisionPreview {
  previousSnapshotId: string;
  snapshot: Snapshot;
  previous: RevisionMatch[];
  incoming: ScriptTarget[];
  newCandidates: ScriptTarget[];
}

export interface Conflict {
  kind: 'availability' | 'cast' | 'unit' | 'location' | 'time' | 'source';
  message: string;
  date: string;
  stripIds: string[];
}

function productionModule(project: Project): ProductionModule {
  const value = project.modules.production as Partial<ProductionModule> | undefined;
  return value?.version === 1 && value.documents && typeof value.documents === 'object'
    ? { version: 1, documents: value.documents }
    : { version: 1, documents: {} };
}

export function getProductionPlan(project: Project, documentId: string): ProductionPlan | undefined {
  const { documents } = productionModule(project);
  return Object.hasOwn(documents, documentId) ? documents[documentId] : undefined;
}

export function setProductionPlan(project: Project, plan: ProductionPlan): Project {
  const { documents } = productionModule(project);
  return {
    ...project,
    modules: { ...project.modules, production: { version: 1, documents: { ...documents, [plan.documentId]: plan } } }
  };
}

export function releasedScript(project: Project, documentId: string, snapshotId: string): Snapshot | undefined {
  return project.snapshots.find(snapshot =>
    snapshot.id === snapshotId && snapshot.kind === 'issued' && snapshot.document.id === documentId
  );
}

export function issueScriptSnapshot(project: Project, document: DocumentModel, label: string, at = new Date().toISOString()): Snapshot {
  const current = project.documents.find(candidate => candidate.id === document.id);
  const name = label.trim();
  if (!current || !name) throw new Error('Select a project script and enter a release label.');
  if (current.revisionId !== document.revisionId) throw new Error('The writing draft changed. Reopen the release panel to review the latest draft.');
  if (!scriptTargets(project, current).some(target => target.heading.trim() !== '')) {
    throw new Error(current.kind === 'av' ? 'Write at least one AV row before release.' : 'Write at least one scene heading before release.');
  }
  return {
    id: newId(), kind: 'issued', label: name, createdAt: at,
    document: { ...structuredClone(current), revisionId: newId(), revisionLabel: name }
  };
}

export function scriptTargets(project: Project, document: DocumentModel): ScriptTarget[] {
  if (document.kind === 'av') {
    return document.avRows.map((row, position) => ({
      id: row.id,
      number: String(position + 1),
      heading: row.video.split('\n').find(line => line.trim())?.trim() || row.audio.split('\n').find(line => line.trim())?.trim() || '',
      position,
      source: sourceFor(project, document, { shotId: row.id }),
      blocks: [
        { id: `${row.id}:video`, kind: 'shot', text: row.video },
        { id: `${row.id}:audio`, kind: 'dialogue', text: row.audio },
        { id: `${row.id}:timing`, kind: 'note', text: JSON.stringify([row.durationSeconds, row.cueSeconds, row.storyboardAssetId]) }
      ]
    }));
  }
  const scenes = sceneList(document);
  return scenes.map((scene, position) => ({
    id: scene.id,
    number: scene.number,
    heading: scene.heading,
    position,
    source: sourceFor(project, document, { sceneId: scene.id, blockId: scene.blockId }),
    blocks: document.blocks.slice(scene.index, scenes[position + 1]?.index)
  }));
}

export function startProduction(project: Project, documentId: string, snapshotId: string): Project {
  if (getProductionPlan(project, documentId)) throw new Error('A production plan already exists for this script.');
  const snapshot = releasedScript(project, documentId, snapshotId);
  if (!snapshot) throw new Error('Production requires an issued snapshot of this script.');
  const source = sourceFor(project, snapshot.document);
  return setProductionPlan(project, {
    documentId, activeSnapshotId: snapshot.id,
    scenes: scriptTargets(project, snapshot.document).map(target => ({
      id: target.id, heading: target.heading, number: target.number, source: target.source, status: 'active'
    })),
    catalogue: [], tags: [], people: [], locations: [], shots: [], lookbook: [],
    units: [{ id: newId(), name: 'Unit A', source }],
    days: [], strips: [], budget: [], callSheets: [], deliveries: [], outputs: []
  });
}

function targetAtSource(project: Project, source: SourceRef): ScriptTarget | undefined {
  const snapshot = project.snapshots.find(item =>
    item.kind === 'issued' && item.document.id === source.documentId && item.document.revisionId === source.revisionId
  );
  if (!snapshot) return undefined;
  return scriptTargets(project, snapshot.document).find(target => target.id === (source.sceneId ?? source.shotId));
}

function targetText(target?: ScriptTarget): string {
  return JSON.stringify(target?.blocks.map(({ kind, text, dual, alternate }) => [kind, text, dual, alternate]));
}

function headingKey(text: string): string {
  return text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleUpperCase('en-GB');
}

export function previewRevision(project: Project, plan: ProductionPlan, snapshotId: string): RevisionPreview {
  const baseline = releasedScript(project, plan.documentId, plan.activeSnapshotId);
  const snapshot = releasedScript(project, plan.documentId, snapshotId);
  if (!baseline || !snapshot || snapshot.id === baseline.id || snapshot.document.kind !== baseline.document.kind) {
    throw new Error('Select a different issued revision of the same script type.');
  }
  const previousTargets = scriptTargets(project, baseline.document);
  const oldById = new Map(previousTargets.map(target => [target.id, target]));
  const incoming = scriptTargets(project, snapshot.document);
  const incomingById = new Map(incoming.map(target => [target.id, target]));
  const reserved = new Set(plan.scenes.flatMap(scene => {
    const id = scene.source.sceneId ?? scene.source.shotId;
    return id && incomingById.has(id) ? [id] : [];
  }));
  const previous = plan.scenes.map((scene): RevisionMatch => {
    const sourceId = scene.source.sceneId ?? scene.source.shotId;
    const original = (scene.status === 'active' && sourceId ? oldById.get(sourceId) : undefined) ?? targetAtSource(project, scene.source);
    const identity = sourceId ? incomingById.get(sourceId) : undefined;
    const heading = headingKey(scene.heading);
    const sameHeadings = heading ? incoming.filter(target => !reserved.has(target.id) && headingKey(target.heading) === heading) : [];
    const headingIsUnique = plan.scenes.filter(item => headingKey(item.heading) === heading).length === 1;
    const suggested = identity ?? (headingIsUnique && sameHeadings.length === 1 ? sameHeadings[0] : undefined);
    return {
      scene,
      suggested,
      quality: identity ? 'identity' : suggested ? 'unique heading' : 'review',
      moved: Boolean(suggested && original && original.position !== suggested.position),
      edited: Boolean(suggested && original && (
        targetText(original) !== targetText(suggested) || original.number !== suggested.number || original.heading !== suggested.heading
      ))
    };
  });
  const suggestedIds = new Set(previous.flatMap(match => match.suggested ? [match.suggested.id] : []));
  return {
    previousSnapshotId: baseline.id, snapshot, previous, incoming,
    newCandidates: incoming.filter(target => !suggestedIds.has(target.id))
  };
}

function matchingTagSource(project: Project, tag: BreakdownTag, target: ScriptTarget): SourceRef | undefined {
  if (!tag.source.blockId) return target.source;
  const previous = targetAtSource(project, tag.source);
  const old = previous?.blocks.find(block => block.id === tag.source.blockId);
  if (!old) return undefined;
  if (old.kind === 'scene') return target.source;
  const matchingBlocks = target.blocks.filter(block => block.kind === old.kind && block.text === old.text);
  const match = matchingBlocks.find(block => block.id === old.id) ?? (matchingBlocks.length === 1 ? matchingBlocks[0] : undefined);
  return match ? { ...target.source, blockId: match.id } : undefined;
}

export function applyRevision(
  project: Project,
  documentId: string,
  snapshotId: string,
  expectedSnapshotId: string,
  choices: Readonly<Record<string, string | null>>
): Project {
  const plan = getProductionPlan(project, documentId);
  if (!plan || plan.activeSnapshotId !== expectedSnapshotId) throw new Error('The production baseline changed. Review the incoming revision again.');
  const preview = previewRevision(project, plan, snapshotId);
  const chosen = new Map<string, ScriptTarget>();
  const claimed = new Set<string>();
  for (const { scene } of preview.previous) {
    if (!Object.hasOwn(choices, scene.id)) throw new Error(`Review the mapping for scene ${scene.number}.`);
    const id = choices[scene.id];
    if (id === null) continue;
    const target = preview.incoming.find(candidate => candidate.id === id);
    if (!target || claimed.has(id)) throw new Error('Every mapped scene needs a distinct incoming source.');
    chosen.set(scene.id, target);
    claimed.add(id);
  }

  const oldIds = new Set(plan.scenes.map(scene => scene.id));
  const byTarget = new Map([...chosen.entries()].map(([id, target]) => [target.id, id]));
  const active = preview.incoming.map<ProductionScene>(target => ({
    id: byTarget.get(target.id) ?? (oldIds.has(target.id) ? newId() : target.id),
    heading: target.heading, number: target.number, source: target.source, status: 'active'
  }));
  const omitted = plan.scenes
    .filter(scene => !chosen.has(scene.id))
    .map<ProductionScene>(scene => ({ ...scene, status: 'omitted' }));
  const tags = plan.tags.map(tag => {
    const target = chosen.get(tag.sceneId);
    if (!target) return tag;
    const source = matchingTagSource(project, tag, target);
    return source ? { ...tag, source, reviewed: true } : { ...tag, reviewed: false };
  });
  const shots = plan.shots.map(shot => {
    const target = chosen.get(shot.sceneId);
    if (!target) return shot;
    return { ...shot, source: { ...target.source, shotId: target.source.shotId ?? shot.id } };
  });
  const strips = plan.strips.map(strip => {
    const target = chosen.get(strip.sceneId);
    return target ? { ...strip, source: target.source } : strip;
  });
  return setProductionPlan(project, {
    ...plan, activeSnapshotId: snapshotId, scenes: [...active, ...omitted], tags, shots, strips
  });
}

export function sceneCast(plan: ProductionPlan, sceneId: string): Person[] {
  const itemIds = new Set(plan.tags.filter(tag => tag.sceneId === sceneId && tag.reviewed !== false).map(tag => tag.itemId));
  const personIds = new Set(plan.catalogue.filter(item => itemIds.has(item.id) && item.category === 'Cast').map(item => item.personId));
  return plan.people.filter(person => person.type === 'Cast' && personIds.has(person.id));
}

export function isShootDate(value: string): boolean {
  if (!/^\d{4}-\d\d-\d\d$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function minutesAfterMidnight(time: string): number {
  const match = /^(\d\d):(\d\d)$/.exec(time);
  if (!match || Number(match[1]) >= 24 || Number(match[2]) >= 60) return NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function orderedDays(plan: ProductionPlan): ShootDay[] {
  return [...plan.days].sort((a, b) =>
    a.date.localeCompare(b.date) || plan.units.findIndex(unit => unit.id === a.unitId) - plan.units.findIndex(unit => unit.id === b.unitId)
  );
}

export function dayStrips(plan: ProductionPlan, dayId: string): Strip[] {
  const scenes = new Set(plan.scenes.filter(scene => scene.status === 'active').map(scene => scene.id));
  return plan.strips
    .filter(strip => strip.dayId === dayId && scenes.has(strip.sceneId))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export function scheduleConflicts(plan: ProductionPlan): Conflict[] {
  const dayById = new Map(plan.days.map(day => [day.id, day]));
  const sceneById = new Map(plan.scenes.map(scene => [scene.id, scene]));
  const slots = new Map<string, Array<{ strip: Strip; day: ShootDay; scene: ProductionScene; cast: Person[]; start: number; end: number }>>();
  const conflicts: Conflict[] = [];
  for (const strip of plan.strips) {
    const day = dayById.get(strip.dayId);
    const scene = sceneById.get(strip.sceneId);
    if (!day || !scene || scene.status !== 'active') {
      conflicts.push({ kind: 'source', message: `Scene ${scene?.number ?? 'unknown'} has an archived or missing source. Review its strip.`, date: day?.date ?? '', stripIds: [strip.id] });
      continue;
    }
    if (plan.tags.some(tag => tag.sceneId === scene.id && tag.reviewed === false)) {
      conflicts.push({ kind: 'source', message: `Scene ${scene.number} has breakdown tags that need a source review.`, date: day.date, stripIds: [strip.id] });
    }
    const cast = sceneCast(plan, scene.id);
    for (const person of cast) {
      if (person.unavailable.includes(day.date)) {
        conflicts.push({ kind: 'availability', message: `${person.name} is unavailable for scene ${scene.number} on ${day.date}.`, date: day.date, stripIds: [strip.id] });
      }
    }
    const start = minutesAfterMidnight(strip.startTime);
    const end = start + strip.minutes;
    if (!isShootDate(day.date) || !Number.isFinite(start) || !Number.isInteger(strip.minutes) || strip.minutes < 1 || end > 1440) {
      conflicts.push({ kind: 'time', message: `Scene ${scene.number} needs a valid start and a duration ending on its shoot date.`, date: day.date, stripIds: [strip.id] });
      continue;
    }
    const daySlots = slots.get(day.date) ?? [];
    daySlots.push({ strip, day, scene, cast, start, end });
    slots.set(day.date, daySlots);
  }

  for (const [date, daySlots] of slots) {
    daySlots.sort((a, b) => a.start - b.start);
    for (let index = 0; index < daySlots.length; index++) {
      const left = daySlots[index];
      for (const right of daySlots.slice(index + 1)) {
        if (right.start >= left.end) break;
        const stripIds = [left.strip.id, right.strip.id];
        const scenes = `scenes ${left.scene.number} and ${right.scene.number}`;
        if (left.day.unitId === right.day.unitId) {
          conflicts.push({ kind: 'unit', message: `The same unit is shooting ${scenes} at overlapping times.`, date, stripIds });
        }
        if (left.strip.locationId && left.strip.locationId === right.strip.locationId && left.day.unitId !== right.day.unitId) {
          const location = plan.locations.find(item => item.id === left.strip.locationId)?.name ?? 'A location';
          conflicts.push({ kind: 'location', message: `${location} is booked by two units for ${scenes}.`, date, stripIds });
        }
        const rightCast = new Set(right.cast.map(person => person.id));
        for (const person of left.cast.filter(item => rightCast.has(item.id))) {
          conflicts.push({ kind: 'cast', message: `${person.name} is double-booked in ${scenes}.`, date, stripIds });
        }
      }
    }
  }
  return conflicts;
}

export type DayCode = 'SW' | 'W' | 'WF' | 'SWF' | 'H' | '—';

export function dayOutOfDays(plan: ProductionPlan): { dates: string[]; rows: Array<{ person: Person; codes: DayCode[]; worked: number }> } {
  const dates = [...new Set(orderedDays(plan).map(day => day.date))];
  const workedByPerson = new Map<string, Set<string>>();
  for (const day of orderedDays(plan)) {
    for (const strip of dayStrips(plan, day.id)) {
      for (const person of sceneCast(plan, strip.sceneId)) {
        const dates = workedByPerson.get(person.id) ?? new Set<string>();
        dates.add(day.date);
        workedByPerson.set(person.id, dates);
      }
    }
  }
  const rows = plan.people.filter(person => person.type === 'Cast').map(person => {
    const worked = workedByPerson.get(person.id) ?? new Set<string>();
    const first = dates.find(date => worked.has(date));
    const last = [...dates].reverse().find(date => worked.has(date));
    const codes = dates.map((date): DayCode => {
      if (!worked.has(date)) return person.holdDates?.includes(date) ? 'H' : '—';
      if (first === last) return 'SWF';
      if (date === first) return 'SW';
      return date === last ? 'WF' : 'W';
    });
    return { person, codes, worked: worked.size };
  });
  return { dates, rows };
}

export function budgetTotals(plan: Pick<ProductionPlan, 'budget'>): { planned: number; actual: number; variance: number } {
  const planned = plan.budget.reduce((sum, line) => sum + Math.round(line.quantity * line.unitCostPence), 0);
  const actual = plan.budget.reduce((sum, line) => sum + line.actualPence, 0);
  return { planned, actual, variance: planned - actual };
}

export function moneyLabel(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}

export function eighthsLabel(eighths: number): string {
  const whole = Math.floor(eighths / 8);
  const remainder = eighths % 8;
  return [whole ? String(whole) : '', remainder ? `${remainder}/8` : ''].filter(Boolean).join(' ') || '0';
}

export function activeProductionSource(project: Project, plan: ProductionPlan): SourceRef {
  const snapshot = releasedScript(project, plan.documentId, plan.activeSnapshotId);
  if (!snapshot) throw new Error('The issued script is missing.');
  return sourceFor(project, snapshot.document);
}

function buildCallSheet(project: Project, plan: ProductionPlan, dayId: string, id: string, issuedAt: string): CallSheet {
  const snapshot = releasedScript(project, plan.documentId, plan.activeSnapshotId);
  const day = plan.days.find(item => item.id === dayId);
  const unit = plan.units.find(item => item.id === day?.unitId);
  if (!snapshot || !day || !unit) throw new Error('Select a dated shoot day from a released script.');
  const strips = dayStrips(plan, dayId);
  if (!strips.length) throw new Error('Schedule at least one scene for this day.');
  const previous = plan.callSheets.filter(sheet => sheet.dayId === dayId).sort((a, b) => b.version - a.version)[0];
  const firstByCast = new Map<string, string>();
  const scenes = strips.map((strip): CallSheetScene => {
    const scene = plan.scenes.find(item => item.id === strip.sceneId)!;
    const location = plan.locations.find(item => item.id === strip.locationId);
    const cast = sceneCast(plan, scene.id);
    for (const person of cast) {
      if (!firstByCast.has(person.id)) firstByCast.set(person.id, strip.startTime);
    }
    return {
      id: scene.id, number: scene.number, heading: scene.heading, source: { ...scene.source },
      location: location ? { name: location.name, address: location.address } : undefined,
      cast: cast.map(person => person.name), startTime: strip.startTime, minutes: strip.minutes
    };
  });
  return {
    id, source: sourceFor(project, snapshot.document), dayId, date: day.date,
    unit: unit.name, projectTitle: project.title, documentTitle: snapshot.document.title, draft: snapshot.label,
    version: (previous?.version ?? 0) + 1, supersedesId: previous?.id, issuedAt, label: day.label,
    callTime: day.callTime, notes: day.notes, scenes,
    recipients: plan.people.filter(person => person.type === 'Crew' || firstByCast.has(person.id)).map(person => ({
      id: person.id, name: person.name, role: person.role || person.type, callTime: person.type === 'Crew' ? day.callTime : firstByCast.get(person.id)!
    }))
  };
}

export function previewCallSheet(project: Project, plan: ProductionPlan, dayId: string): CallSheet {
  return buildCallSheet(project, plan, dayId, 'preview', '');
}

export function issueCallSheet(project: Project, plan: ProductionPlan, dayId: string, at = new Date().toISOString()): CallSheet {
  const day = plan.days.find(item => item.id === dayId);
  if (!day || !isShootDate(day.date) || !Number.isFinite(minutesAfterMidnight(day.callTime))) {
    throw new Error('Set a valid shoot date and crew call time before issue.');
  }
  const stripIds = new Set(plan.strips.filter(strip => strip.dayId === dayId).map(strip => strip.id));
  if (scheduleConflicts(plan).some(conflict => conflict.stripIds.some(id => stripIds.has(id)))) {
    throw new Error('Resolve the schedule conflicts for this day before issue.');
  }
  return buildCallSheet(project, plan, dayId, newId(), at);
}

export function recordTestDelivery(
  plan: ProductionPlan, callSheetId: string, personId: string, at = new Date().toISOString()
): ProductionPlan {
  const sheet = plan.callSheets.find(item => item.id === callSheetId);
  if (!sheet || !sheet.recipients.some(person => person.id === personId)) throw new Error('Choose a recipient on an issued call sheet.');
  if (plan.callSheets.some(item => item.dayId === sheet.dayId && item.version > sheet.version)) {
    throw new Error('Test delivery is available for the current call sheet version.');
  }
  if (plan.deliveries.some(record => record.callSheetId === callSheetId && record.personId === personId)) return plan;
  return { ...plan, deliveries: [...plan.deliveries, { id: newId(), callSheetId, personId, sentAt: at }] };
}

export function acknowledgeTestDelivery(plan: ProductionPlan, deliveryId: string, at = new Date().toISOString()): ProductionPlan {
  const delivery = plan.deliveries.find(item => item.id === deliveryId);
  if (!delivery) throw new Error('Record a test delivery before acknowledgement.');
  if (delivery.acknowledgedAt) return plan;
  return { ...plan, deliveries: plan.deliveries.map(item => item.id === deliveryId ? { ...item, acknowledgedAt: at } : item) };
}

export function sidesFor(project: Project, plan: ProductionPlan, ids: string[]): Array<ProductionScene & { blocks: Block[] }> {
  const requested = new Set(ids);
  return plan.scenes.filter(scene => scene.status === 'active' && requested.has(scene.id))
    .map(scene => ({ ...scene, blocks: targetAtSource(project, scene.source)?.blocks.filter(block => block.kind !== 'note') ?? [] }));
}

function csvCell(value: string | number): string {
  const raw = String(value);
  const safe = typeof value === 'string' && /^\s*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function reportCsv(rows: ReadonlyArray<ReadonlyArray<string | number>>): string {
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function scheduleCsv(project: Project, plan: ProductionPlan): string {
  const snapshot = releasedScript(project, plan.documentId, plan.activeSnapshotId);
  return reportCsv([
    ['Date', 'Unit', 'Scene', 'Heading', 'Location', 'Start', 'Minutes', 'Page eighths', 'Cast', 'Source revision'],
    ...orderedDays(plan).flatMap(day => dayStrips(plan, day.id).map(strip => {
      const scene = plan.scenes.find(item => item.id === strip.sceneId)!;
      return [
        day.date, plan.units.find(unit => unit.id === day.unitId)?.name ?? '', scene.number, scene.heading,
        plan.locations.find(location => location.id === strip.locationId)?.name ?? '', strip.startTime, strip.minutes, strip.eighths,
        sceneCast(plan, scene.id).map(person => person.name).join(', '), snapshot?.document.revisionId ?? ''
      ];
    }))
  ]);
}

export function budgetCsv(project: Project, plan: ProductionPlan): string {
  const totals = budgetTotals(plan);
  const source = activeProductionSource(project, plan);
  return reportCsv([
    ['Category', 'Item', 'Quantity', 'Rate GBP', 'Planned GBP', 'Actual GBP', 'Variance GBP', 'Source revision'],
    ...plan.budget.map(line => {
      const planned = Math.round(line.quantity * line.unitCostPence);
      return [line.category, line.name, line.quantity, line.unitCostPence / 100, planned / 100, line.actualPence / 100, (planned - line.actualPence) / 100, line.source.revisionId];
    }),
    ['', 'TOTAL', '', '', totals.planned / 100, totals.actual / 100, totals.variance / 100, source.revisionId]
  ]);
}

export function doodCsv(project: Project, plan: ProductionPlan): string {
  const { dates, rows } = dayOutOfDays(plan);
  const source = activeProductionSource(project, plan);
  return reportCsv([
    ['Cast', ...dates, 'Days worked', 'Source revision'],
    ...rows.map(row => [row.person.name, ...row.codes, row.worked, source.revisionId])
  ]);
}

export function issueProductionOutput(
  project: Project, plan: ProductionPlan, kind: ProductionOutput['kind'], filename: string, content: string
): ProductionOutput {
  return {
    id: newId(), source: activeProductionSource(project, plan), issuedAt: new Date().toISOString(), kind, filename, content
  };
}

export function productionManifest(project: Project, plan: ProductionPlan, kind: 'prep' | 'wrap'): string {
  return JSON.stringify({
    kind, source: activeProductionSource(project, plan), scenes: plan.scenes, tags: plan.tags,
    catalogue: plan.catalogue, people: plan.people, locations: plan.locations, shots: plan.shots, lookbook: plan.lookbook,
    units: plan.units, days: orderedDays(plan), strips: plan.strips, conflicts: scheduleConflicts(plan),
    dayOutOfDays: dayOutOfDays(plan), budget: plan.budget, totals: budgetTotals(plan),
    callSheets: plan.callSheets, ...(kind === 'wrap' ? { deliveries: plan.deliveries } : {})
  }, null, 2);
}
