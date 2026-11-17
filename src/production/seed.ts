import { newId, sourceFor } from '../model';
import type { Project } from '../model';
import { getProductionPlan, issueScriptSnapshot, setProductionPlan, startProduction } from './model';
import type { BudgetLine, CatalogueItem, Location, Person, ProductionShot, ShootDay, Strip } from './model';

export function seedProduction(project: Project, documentId: string): Project {
  const document = project.documents.find(item => item.id === documentId);
  if (!document || getProductionPlan(project, documentId)) return project;
  const release = issueScriptSnapshot(project, document, 'Shooting Draft 1', '2027-01-12T09:00:00Z');
  const withRelease = startProduction({ ...project, snapshots: [...project.snapshots, release] }, documentId, release.id);
  const plan = getProductionPlan(withRelease, documentId);
  if (!plan || plan.scenes.length < 3) return withRelease;
  const source = sourceFor(project, release.document);
  const firstDate = '2027-01-18';
  const secondDate = '2027-01-19';
  const people: Person[] = [
    { id: newId(), source, name: 'Nora', type: 'Cast', role: 'Nora Vale', unavailable: [] },
    { id: newId(), source, name: 'Elias', type: 'Cast', role: 'Elias Crowe', unavailable: [firstDate] },
    { id: newId(), source, name: 'Jonah', type: 'Cast', role: 'Jonah Pike', unavailable: [] },
    { id: newId(), source, name: 'Ari Bell', type: 'Crew', role: 'Camera operator', unavailable: [] }
  ];
  const catalogue: CatalogueItem[] = people.filter(person => person.type === 'Cast').map(person => ({
    id: newId(), source, category: 'Cast', name: person.name, personId: person.id, notes: ''
  }));
  catalogue.push({ id: newId(), source, category: 'Prop', name: 'Paper ferry ticket', notes: 'Keep a spare for repeated takes.' });

  const locations: Location[] = [
    { id: newId(), source, name: 'Terminal office', address: 'Ferry terminal, unit base', notes: 'Meet in the lobby.' },
    { id: newId(), source, name: 'Terminal ramp', address: 'Ferry terminal, East Pier', notes: 'Book the pier gate with the location lead.' },
    { id: newId(), source, name: 'Harbour wall', address: 'North harbour path', notes: 'Access from the harbour gate.' }
  ];
  const days: ShootDay[] = [
    { id: newId(), source, date: firstDate, unitId: plan.units[0].id, label: 'Ferry terminal', callTime: '14:00', notes: 'Crew meet at the terminal office.' },
    { id: newId(), source, date: secondDate, unitId: plan.units[0].id, label: 'Harbour wall', callTime: '07:00', notes: 'Crew meet at the harbour gate.' }
  ];

  const [office, terminal, harbour] = plan.scenes;
  const tagAssignments = [[office, [0, 1, 3]], [terminal, [0]], [harbour, [2]]] as const;
  const tags = tagAssignments.flatMap(([scene, indices]) => indices.map(index => ({
    id: newId(), sceneId: scene.id, itemId: catalogue[index].id, notes: '', source: scene.source, reviewed: true
  })));

  const shotDetails = [
    ['The ferry ticket crosses the desk', 'Close-up', 'Camera A, locked'],
    ['The passenger just misses the gate', 'Wide', 'Camera A, handheld'],
    ['Jonah holds the second timetable', 'Medium', 'Camera A, shoulder']
  ];
  const shots: ProductionShot[] = [office, terminal, harbour].map((scene, index) => {
    const id = newId();
    const [description, framing, setup] = shotDetails[index];
    return { id, sceneId: scene.id, description, framing, setup, source: { ...scene.source, shotId: scene.source.shotId ?? id } };
  });

  const strips: Strip[] = [office, terminal, harbour].map((scene, index) => ({
    id: newId(), source: scene.source, sceneId: scene.id, dayId: days[index === 2 ? 1 : 0].id,
    locationId: locations[index].id, startTime: ['15:00', '16:30', '08:00'][index],
    minutes: [75, 45, 45][index], eighths: [10, 3, 5][index]
  }));
  const budget: BudgetLine[] = [
    { id: newId(), source, category: 'Locations', name: 'Terminal office hire', quantity: 1, unitCostPence: 27500, actualPence: 22500 },
    { id: newId(), source, category: 'Camera', name: 'Camera package', quantity: 2, unitCostPence: 12000, actualPence: 24000 }
  ];

  return setProductionPlan(withRelease, { ...plan, people, catalogue, locations, days, tags, shots, strips, budget });
}
