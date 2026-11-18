import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { newBlock } from '../src/model';
import type { Project } from '../src/model';
import { decodeFountain } from '../src/interchange/screenplay';
import { createProject } from '../src/workspace/project';
import { cueName, displayName, syncBreakdown } from '../src/production/autobreakdown';
import { budgetCategory, budgetCsv, budgetTopSheet } from '../src/production/budget';
import { castByScene } from '../src/production/insights';
import { scriptPages } from '../src/production/pages';
import {
  budgetTotals, getProductionPlan, issueScriptSnapshot, placeStrip, previewCallSheet, setProductionPlan, startProduction
} from '../src/production/model';
import type { ProductionPlan } from '../src/production/model';
import { paginateDocument } from '../src/writing/layout';
import { featureScript } from './support/feature-script';

function filmProject(text: string): { project: Project; plan: ProductionPlan } {
  const base = createProject('Blind Spot', 'film');
  const { document } = decodeFountain(text, 'Blind Spot');
  const script = { ...document, id: base.documents[0].id };
  const withScript = { ...base, documents: [script] };
  const release = issueScriptSnapshot(withScript, script, 'Shooting Draft 1', '2027-02-01T09:00:00Z');
  const project = startProduction({ ...withScript, snapshots: [release] }, script.id, release.id);
  return { project, plan: getProductionPlan(project, script.id)! };
}

test('cue names drop extensions and display names read naturally', () => {
  assert.equal(cueName("MAYA (CONT'D)"), 'MAYA');
  assert.equal(cueName('MAYA (V.O.)'), 'MAYA');
  assert.equal(cueName('det. okafor (O.S.) (CONT’D)'), 'DET. OKAFOR');
  assert.equal(cueName('RUTH ^'), 'RUTH');
  assert.equal(displayName("DR. MAYA O'NEILL"), "Dr. Maya O'Neill");
  assert.equal(displayName("MAYA'S APARTMENT - KITCHEN"), "Maya's Apartment - Kitchen");
});

test('page eighths follow the real page layout of a feature-length script', () => {
  const { project, plan } = filmProject(featureScript());
  const snapshot = project.snapshots[0];
  const { pages, eighths } = scriptPages(snapshot.document);
  const laidOut = paginateDocument(snapshot.document).pages.filter(page => !page.titlePage).length;
  assert.equal(pages, laidOut);
  assert(pages > 60 && pages < 100, `expected a feature-length script, got ${pages} pages`);
  const values = [...eighths.values()];
  const total = values.reduce((sum, value) => sum + value, 0);
  assert(Math.abs(total - pages * 8) <= 8, `scene eighths ${total} should add up to about ${pages * 8}`);
  assert(values.every(value => value >= 1));
  const typical = values.filter(value => value >= 4 && value <= 24).length;
  assert(typical / values.length > 0.8, 'most scenes run between half a page and three pages');
  assert(plan.scenes.every(scene => scene.eighths === eighths.get(scene.source.sceneId!)), 'production scenes carry their measured length');
});

test('the breakdown builds cast by scene count, locations and tags, and a re-sync keeps edits and flags removals', () => {
  const { project, plan } = filmProject(featureScript());
  const { plan: built, summary } = syncBreakdown(project, plan, '2027-02-01T10:00:00Z');
  const cast = built.people.filter(person => person.type === 'Cast');
  assert.deepEqual(cast.map(person => person.name), ['Maya', 'Ruth', 'Daniel', 'Det. Okafor', 'Theo', 'Dr. Ellis', 'Mr. Hale']);
  assert.equal(summary.cast, 7);
  assert.equal(summary.scenes, 65);
  assert(!cast.some(person => /\(|CONT/.test(person.name)));
  const byScene = castByScene(built);
  const counts = cast.map(person => built.scenes.filter(scene => byScene.get(scene.id)?.some(item => item.id === person.id)).length);
  assert.deepEqual([...counts].sort((a, b) => b - a), counts, 'cast IDs follow scene count');
  assert.equal(built.locations.length, 9);
  assert(built.locations.some(location => location.name === "Maya's Apartment - Kitchen"));
  assert(built.scenes.every(scene => built.locations.some(location => location.id === scene.locationId)));
  assert.equal(built.breakdownSyncedAt, '2027-02-01T10:00:00Z');

  const maya = cast[0];
  const edited = {
    ...built,
    people: built.people.map(person => person.id === maya.id ? { ...person, role: 'Ana Reyes', photoAssetId: 'photo-1' } : person)
  };
  const again = syncBreakdown(project, edited);
  assert.equal(again.summary.addedCast.length, 0);
  assert.equal(again.summary.tagsAdded, 0);
  assert.equal(again.plan.people.length, built.people.length);
  assert.equal(again.plan.people.find(person => person.id === maya.id)?.role, 'Ana Reyes');
  assert.equal(again.plan.people.find(person => person.id === maya.id)?.photoAssetId, 'photo-1');

  // A revised release without Mr. Hale flags him instead of deleting him.
  const shorter = filmProject(featureScript(40));
  const carried = { ...shorter.plan, people: built.people, catalogue: built.catalogue, locations: built.locations };
  const resynced = syncBreakdown(shorter.project, carried);
  const hale = resynced.plan.people.find(person => person.name === 'Mr. Hale');
  assert.equal(hale?.notInScript, true);
  assert.deepEqual(resynced.summary.removedCast, ['Mr. Hale']);
  assert(resynced.plan.locations.find(location => location.name === "Coroner's Office")?.notInScript);
});

test('a manual cast member with the character name is linked, and scheduled scenes reach the call sheet with location', () => {
  const { project, plan } = filmProject(featureScript(12));
  const manual = { id: 'maya', source: plan.units[0].source, name: 'Maya', type: 'Cast' as const, role: 'Ana Reyes', unavailable: [] };
  const { plan: built } = syncBreakdown(project, { ...plan, people: [manual] });
  assert.equal(built.people.filter(person => person.name === 'Maya').length, 1);
  assert.equal(built.people[0].scriptName, 'MAYA');
  const day = { id: 'd1', source: plan.units[0].source, date: '2027-03-01', unitId: plan.units[0].id, label: 'Kitchen', callTime: '07:00', notes: '' };
  const scene = built.scenes[0];
  const scheduled = placeStrip({ ...built, days: [day] }, { sceneId: scene.id }, 'd1', 0, scene.eighths);
  assert.equal(scheduled.strips[0].locationId, scene.locationId);
  const sheet = previewCallSheet(setProductionPlan(project, scheduled), scheduled, 'd1');
  assert.equal(sheet.scenes[0].location?.name, "Maya's Apartment - Kitchen");
  assert.equal(sheet.recipients.find(person => person.id === 'maya')?.castId, 1);
});

test('the budget top sheet files lines under standard accounts with units and contingency', () => {
  const { project, plan } = filmProject(featureScript(4));
  const source = plan.units[0].source;
  const empty = budgetTopSheet(plan);
  assert.deepEqual(empty.groups.map(group => group.name), ['Above the line', 'Below the line', 'Post-production', 'Other']);
  assert(empty.groups.every(group => group.rows.length >= 3 && group.planned === 0));
  assert.equal(budgetCategory('camera')?.code, '2100');
  assert.equal(budgetCategory('Make-up')?.name, 'Hair and make-up');
  const withLines: ProductionPlan = {
    ...plan, contingencyPercent: 10,
    budget: [
      { id: 'a', source, category: 'Camera', name: 'Camera package', quantity: 2, unitCostPence: 45000, units: 5, unitLabel: 'days', actualPence: 300000 },
      { id: 'b', source, category: 'Cast', name: 'Lead', quantity: 1, unitCostPence: 100000, actualPence: 0 },
      { id: 'c', source, category: 'Drone permits', name: 'CAA permit', quantity: 1, unitCostPence: 5000, actualPence: 5000 }
    ]
  };
  const sheet = budgetTopSheet(withLines);
  assert.equal(sheet.subtotal.planned, 555000);
  assert.equal(sheet.groups[0].planned, 100000);
  assert.equal(sheet.groups[1].rows.find(row => row.name === 'Camera')?.planned, 450000);
  assert.equal(sheet.groups[3].rows.at(-1)?.name, 'Drone permits');
  assert.equal(sheet.contingency, 55500);
  assert.equal(sheet.total.planned, 610500);
  assert.equal(sheet.total.remaining, 610500 - 305000);
  assert.equal(budgetTotals(withLines).planned, 555000);
  const csv = budgetCsv(setProductionPlan(project, withLines), withLines);
  assert.match(csv, /"2100","Camera","Camera package","2","450","5 days","4500","3000","1500"/);
  assert.match(csv, /"Contingency 10%"/);
  assert.match(csv, /"TOTAL","","","","6105","3050","3055"/);
});

test('an AV script is left out of the screenplay breakdown', () => {
  const project = createProject('Spot', 'commercial');
  assert.equal(scriptPages(project.documents[0]).pages, 0);
  assert.equal(scriptPages({ ...project.documents[0], kind: 'screenplay', blocks: [newBlock('scene', 'INT. ROOM - DAY')] }).eighths.size, 1);
});
