import { newId, sceneList, sourceFor } from '../model';
import type { Block, DocumentModel, Project, Snapshot, SourceRef } from '../model';
import { scriptPages } from './pages';

export const CATALOGUE_CATEGORIES = [
  'Cast', 'Extras', 'Prop', 'Wardrobe', 'Hair and make-up', 'Set dressing', 'Equipment', 'Vehicle',
  'Stunts', 'Special effects', 'Animals', 'Sound', 'VFX', 'Other'
] as const;
export type CatalogueCategory = (typeof CATALOGUE_CATEGORIES)[number];

interface SourcedRecord {
  id: string;
  source: SourceRef;
}

export interface ProductionScene extends SourcedRecord {
  number: string;
  heading: string;
  status: 'active' | 'omitted';
  /** Length in page eighths, measured from the issued script's page layout. */
  eighths?: number;
  /** The set or location the scene heading names, linked by the script breakdown. */
  locationId?: string;
}

export const PERSON_STATUSES = ['Confirmed', 'Pencilled', 'Offer out', 'To cast'] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];

export interface Person extends SourcedRecord {
  /** For cast, the character; for crew, the person's name. */
  name: string;
  type: 'Cast' | 'Crew';
  /** For cast, the artist playing the character; for crew, the job title. */
  role: string;
  unavailable: string[];
  holdDates?: string[];
  /** Project asset holding this person's photo. */
  photoAssetId?: string;
  department?: string;
  email?: string;
  phone?: string;
  agent?: string;
  status?: PersonStatus;
  notes?: string;
  /** The character cue this cast member was matched to in the script breakdown. */
  scriptName?: string;
  /** The character no longer speaks in the active release; kept so manual details are not lost. */
  notInScript?: boolean;
}

export interface Location extends SourcedRecord {
  name: string;
  address: string;
  notes: string;
  /** Recce photos, as project asset IDs. */
  photoAssetIds?: string[];
  contact?: string;
  phone?: string;
  parking?: string;
  /** The normalised set name from scene headings this location was matched to. */
  scriptSet?: string;
  notInScript?: boolean;
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
  /** Added by the script breakdown (a speaking role), so a re-sync may retire it. */
  auto?: boolean;
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
  weather?: string;
  hospital?: string;
  parking?: string;
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
  /** Multiplier for the rate, such as days or weeks (planned = quantity × rate × units). */
  units?: number;
  unitLabel?: string;
}

export interface CallSheetScene {
  id: string;
  number: string;
  heading: string;
  source: SourceRef;
  location?: { name: string; address: string };
  cast: string[];
  castIds?: number[];
  setting?: string;
  eighths?: number;
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
  weather?: string;
  hospital?: string;
  parking?: string;
  dayNumber?: number;
  dayCount?: number;
  scenes: CallSheetScene[];
  recipients: Array<{ id: string; name: string; role: string; callTime: string; type?: Person['type']; castId?: number }>;
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
  /** When the cast, locations and page counts were last built from the issued script. */
  breakdownSyncedAt?: string;
  /** Contingency as a percentage of the budget subtotal. */
  contingencyPercent?: number;
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
  const pages = scriptPages(snapshot.document).eighths;
  return setProductionPlan(project, {
    documentId, activeSnapshotId: snapshot.id,
    scenes: scriptTargets(project, snapshot.document).map<ProductionScene>(target => {
      const eighths = pages.get(target.id);
      return { id: target.id, heading: target.heading, number: target.number, source: target.source, status: 'active', ...(eighths ? { eighths } : {}) };
    }),
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
  const pages = scriptPages(preview.snapshot.document).eighths;
  const active = preview.incoming.map<ProductionScene>(target => {
    const kept = byTarget.get(target.id);
    const locationId = kept ? plan.scenes.find(scene => scene.id === kept)?.locationId : undefined;
    const eighths = pages.get(target.id);
    return {
      id: kept ?? (oldIds.has(target.id) ? newId() : target.id),
      heading: target.heading, number: target.number, source: target.source, status: 'active',
      ...(eighths ? { eighths } : {}), ...(locationId ? { locationId } : {})
    };
  });
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

export function linePlanned(line: BudgetLine): number {
  return Math.round(line.quantity * line.unitCostPence * (line.units ?? 1));
}

export function budgetTotals(plan: Pick<ProductionPlan, 'budget'>): { planned: number; actual: number; variance: number } {
  const planned = plan.budget.reduce((sum, line) => sum + linePlanned(line), 0);
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
  const castIds = castNumbers(plan);
  const ordered = orderedDays(plan);
  const scenes = strips.map((strip): CallSheetScene => {
    const scene = plan.scenes.find(item => item.id === strip.sceneId)!;
    const location = plan.locations.find(item => item.id === (strip.locationId ?? scene.locationId));
    const cast = sceneCast(plan, scene.id);
    for (const person of cast) {
      if (!firstByCast.has(person.id)) firstByCast.set(person.id, strip.startTime);
    }
    return {
      id: scene.id, number: scene.number, heading: scene.heading, source: { ...scene.source },
      location: location ? { name: location.name, address: location.address } : undefined,
      cast: cast.map(person => person.name), castIds: cast.map(person => castIds.get(person.id) ?? 0),
      setting: settingLabel(scene.heading), eighths: strip.eighths, startTime: strip.startTime, minutes: strip.minutes
    };
  });
  return {
    id, source: sourceFor(project, snapshot.document), dayId, date: day.date,
    unit: unit.name, projectTitle: project.title, documentTitle: snapshot.document.title, draft: snapshot.label,
    version: (previous?.version ?? 0) + 1, supersedesId: previous?.id, issuedAt, label: day.label,
    callTime: day.callTime, notes: day.notes, weather: day.weather, hospital: day.hospital, parking: day.parking,
    dayNumber: ordered.findIndex(item => item.id === day.id) + 1, dayCount: ordered.length, scenes,
    recipients: plan.people.filter(person => person.type === 'Crew' || firstByCast.has(person.id)).map(person => ({
      id: person.id, name: person.name, role: person.role || person.type, type: person.type, castId: castIds.get(person.id),
      callTime: person.type === 'Crew' ? day.callTime : firstByCast.get(person.id)!
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

export function doodCsv(project: Project, plan: ProductionPlan): string {
  const { dates, rows } = dayOutOfDays(plan);
  const source = activeProductionSource(project, plan);
  return reportCsv([
    ['ID', 'Cast', ...dates, 'Days worked', 'Source revision'],
    ...rows.map((row, index) => [index + 1, row.person.name, ...row.codes, row.worked, source.revisionId])
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

export type StripTone = 'int-day' | 'ext-day' | 'int-night' | 'ext-night';

export interface SceneSetting {
  interior: 'INT' | 'EXT' | 'INT/EXT' | '';
  time: string;
  set: string;
  tone: StripTone;
}

const NIGHT_TIMES = /\b(NIGHT|DUSK|EVENING|SUNSET|MIDNIGHT)\b/;

/** Splits a scene heading into the parts a stripboard shows: INT/EXT, set and time of day. */
export function sceneSetting(heading: string): SceneSetting {
  const text = heading.normalize('NFKC').trim().replace(/\s+/g, ' ');
  const prefix = /^(INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\s*\/\s*E\.?|INT\.?|EXT\.?|EST\.?)(?=\s|$)\s*/i.exec(text);
  const marker = prefix?.[1].toUpperCase().replace(/\s+/g, '') ?? '';
  const interior: SceneSetting['interior'] = !marker ? '' : marker.includes('/') ? 'INT/EXT' : marker.startsWith('INT') ? 'INT' : 'EXT';
  const rest = prefix ? text.slice(prefix[0].length) : text;
  const split = /\s+[-–—]\s+(?!.*\s[-–—]\s)/.exec(rest);
  const time = split ? rest.slice(split.index + split[0].length).trim().toUpperCase() : '';
  const set = (split ? rest.slice(0, split.index) : rest).trim();
  const night = NIGHT_TIMES.test(time);
  const exterior = interior === 'EXT' || interior === 'INT/EXT';
  return { interior, time, set: set || text, tone: `${exterior ? 'ext' : 'int'}-${night ? 'night' : 'day'}` };
}

export function settingLabel(heading: string): string {
  const { interior, time } = sceneSetting(heading);
  return [interior, time].filter(Boolean).join(' · ');
}

/** Stable cast ID numbers, in the order cast appear in the production directory. */
export function castNumbers(plan: Pick<ProductionPlan, 'people'>): Map<string, number> {
  return new Map(plan.people.filter(person => person.type === 'Cast').map((person, index) => [person.id, index + 1]));
}

const LINES_PER_PAGE = 54;
const BLOCK_WIDTH: Partial<Record<Block['kind'], number>> = { dialogue: 35, parenthetical: 25, character: 38 };

/** Estimates a scene's length in page eighths from its screenplay blocks (one page is about 54 lines). */
export function estimateEighths(blocks: readonly Block[]): number {
  let lines = 0;
  let previous: Block['kind'] | undefined;
  for (const block of blocks) {
    if (block.kind === 'note') continue;
    const width = BLOCK_WIDTH[block.kind] ?? 61;
    const textLines = block.text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / width)), 0);
    const tight = (block.kind === 'dialogue' || block.kind === 'parenthetical') &&
      (previous === 'character' || previous === 'parenthetical' || previous === 'dialogue');
    lines += textLines + (previous && !tight ? 1 : 0);
    previous = block.kind;
  }
  return lines ? Math.max(1, Math.round(lines / LINES_PER_PAGE * 8)) : 0;
}

/** A first-pass shooting duration: roughly an hour per page, in quarter-hour steps. */
export function defaultStripMinutes(eighths: number): number {
  return Math.max(15, Math.ceil(eighths * 8 / 15) * 15);
}

function clockLabel(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** The first start on a day before a move: its earliest strip, else the crew call, else 08:00. */
function dayAnchor(plan: ProductionPlan, day: ShootDay): number {
  const starts = dayStrips(plan, day.id).map(strip => minutesAfterMidnight(strip.startTime)).filter(Number.isFinite);
  const call = minutesAfterMidnight(day.callTime);
  return starts.length ? Math.min(...starts) : Number.isFinite(call) ? call : 8 * 60;
}

function runBackToBack(order: Strip[], start: number, day: ShootDay, into: Map<string, Strip>) {
  let clock = start;
  for (const strip of order) {
    if (clock + strip.minutes > 1440) throw new Error(`${day.label || 'This shoot day'} cannot fit this running order before midnight.`);
    into.set(strip.id, { ...strip, dayId: day.id, startTime: clockLabel(clock) });
    clock += strip.minutes;
  }
}

/**
 * Moves a strip (or schedules an unscheduled scene) to a position on a shoot day, or returns it to
 * the unscheduled pool when `dayId` is null. Strip order sets the running order, so each affected
 * day runs back-to-back from its existing first start (or the crew call), keeping strip durations.
 */
export function placeStrip(
  plan: ProductionPlan,
  item: { stripId?: string; sceneId: string },
  dayId: string | null,
  index: number,
  eighths = 1
): ProductionPlan {
  const existing = item.stripId ? plan.strips.find(strip => strip.id === item.stripId) : undefined;
  if (item.stripId && !existing) throw new Error('This strip is no longer on the schedule.');
  const retimed = new Map<string, Strip>();
  const from = existing && existing.dayId !== dayId ? plan.days.find(day => day.id === existing.dayId) : undefined;
  if (from) {
    runBackToBack(dayStrips(plan, from.id).filter(strip => strip.id !== existing?.id), dayAnchor(plan, from), from, retimed);
  }
  if (dayId === null) {
    if (!existing) return plan;
    return { ...plan, strips: plan.strips.filter(strip => strip.id !== existing.id).map(strip => retimed.get(strip.id) ?? strip) };
  }
  const day = plan.days.find(candidate => candidate.id === dayId);
  const scene = plan.scenes.find(candidate => candidate.id === (existing?.sceneId ?? item.sceneId) && candidate.status === 'active');
  if (!day || !scene) throw new Error('Choose an active scene and an existing shoot day.');
  const others = dayStrips(plan, dayId).filter(strip => strip.id !== existing?.id);
  const moved: Strip = existing ? { ...existing, dayId } : {
    id: newId(), sceneId: scene.id, dayId, startTime: '', minutes: defaultStripMinutes(eighths),
    eighths: Math.max(0, Math.round(eighths)), source: scene.source,
    ...(scene.locationId && plan.locations.some(location => location.id === scene.locationId) ? { locationId: scene.locationId } : {})
  };
  const position = Math.max(0, Math.min(Math.round(index), others.length));
  runBackToBack([...others.slice(0, position), moved, ...others.slice(position)], dayAnchor(plan, day), day, retimed);
  return {
    ...plan,
    strips: [...plan.strips.map(strip => retimed.get(strip.id) ?? strip), ...(existing ? [] : [retimed.get(moved.id)!])]
  };
}

export interface ScriptChange {
  sceneId: string;
  number: string;
  heading: string;
  status: 'edited' | 'removed';
  headingAfter?: string;
  eighthsBefore: number;
  eighthsAfter?: number;
  charactersAdded: string[];
  charactersRemoved: string[];
}

function speakingRoles(blocks: readonly Block[]): Set<string> {
  return new Set(blocks.filter(block => block.kind === 'character')
    .map(block => block.text.replace(/\(.*?\)/g, '').replace(/\^/g, '').trim().toLocaleUpperCase('en-GB'))
    .filter(Boolean));
}

/**
 * Compares the live writing draft with the issued snapshot the production plan uses, so scheduled
 * and broken-down scenes whose script has changed since release are flagged before the next issue.
 */
export function scriptChanges(project: Project, plan: ProductionPlan, draft: DocumentModel): ScriptChange[] {
  const snapshot = releasedScript(project, plan.documentId, plan.activeSnapshotId);
  if (!snapshot || draft.id !== plan.documentId || draft.kind !== snapshot.document.kind) return [];
  const released = new Map(scriptTargets(project, snapshot.document).map(target => [target.id, target]));
  const live = new Map(scriptTargets(project, draft).map(target => [target.id, target]));
  return plan.scenes.flatMap((scene): ScriptChange[] => {
    const id = scene.source.sceneId ?? scene.source.shotId;
    const before = scene.status === 'active' && id ? released.get(id) : undefined;
    if (!before) return [];
    const after = live.get(before.id);
    const base = { sceneId: scene.id, number: scene.number, heading: scene.heading, eighthsBefore: estimateEighths(before.blocks) };
    if (!after) return [{ ...base, status: 'removed', charactersAdded: [], charactersRemoved: [] }];
    if (targetText(before) === targetText(after)) return [];
    const was = speakingRoles(before.blocks);
    const now = speakingRoles(after.blocks);
    return [{
      ...base, status: 'edited',
      headingAfter: after.heading !== before.heading ? after.heading : undefined,
      eighthsAfter: estimateEighths(after.blocks),
      charactersAdded: [...now].filter(name => !was.has(name)),
      charactersRemoved: [...was].filter(name => !now.has(name))
    }];
  });
}

export function callSheetCsv(sheet: CallSheet): string {
  const day = sheet.dayNumber ? `Day ${sheet.dayNumber}${sheet.dayCount ? ` of ${sheet.dayCount}` : ''}` : '';
  return reportCsv([
    ['Call sheet', sheet.projectTitle, sheet.documentTitle, sheet.draft, `V${sheet.version}`],
    ['Date', sheet.date, day, sheet.unit, sheet.label],
    ['Crew call', sheet.callTime],
    ['Weather', sheet.weather ?? ''],
    ['Nearest hospital', sheet.hospital ?? ''],
    ['Parking and basecamp', sheet.parking ?? ''],
    ['Notes', sheet.notes],
    [],
    ['Time', 'Scene', 'Heading', 'Setting', 'Pages', 'Cast IDs', 'Location', 'Address'],
    ...sheet.scenes.map(scene => [
      scene.startTime, scene.number, scene.heading, scene.setting ?? '', scene.eighths === undefined ? '' : eighthsLabel(scene.eighths),
      (scene.castIds ?? []).join(' '), scene.location?.name ?? '', scene.location?.address ?? ''
    ]),
    [],
    ['ID', 'Name', 'Role', 'Call'],
    ...sheet.recipients.map(person => [person.castId ?? '', person.name, person.role, person.callTime]),
    [],
    ['Source revision', sheet.source.revisionId]
  ]);
}
