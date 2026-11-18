import type { Project } from '../model';
import { activeProductionSource, linePlanned, reportCsv } from './model';
import type { BudgetLine, ProductionPlan } from './model';

export interface BudgetCategory {
  code: string;
  name: string;
  /** Other names that file into this category (case-insensitive). */
  aliases?: string[];
}

export interface BudgetGroup {
  name: string;
  categories: BudgetCategory[];
}

/** A standard film top sheet: above the line, below the line, post and other costs. */
export const BUDGET_GROUPS: BudgetGroup[] = [
  { name: 'Above the line', categories: [
    { code: '1100', name: 'Story and rights', aliases: ['Story', 'Rights', 'Writers'] },
    { code: '1200', name: 'Producers', aliases: ['Producer'] },
    { code: '1300', name: 'Director', aliases: ['Directors'] },
    { code: '1400', name: 'Cast', aliases: ['Actors', 'Talent', 'Artists'] }
  ] },
  { name: 'Below the line', categories: [
    { code: '2000', name: 'Production staff', aliases: ['Production', 'Crew'] },
    { code: '2100', name: 'Camera', aliases: ['Camera department', 'Equipment'] },
    { code: '2200', name: 'Lighting and grip', aliases: ['Lighting', 'Grip', 'Electrical'] },
    { code: '2300', name: 'Sound', aliases: ['Production sound'] },
    { code: '2400', name: 'Art and props', aliases: ['Art', 'Props', 'Art department', 'Set dressing'] },
    { code: '2500', name: 'Wardrobe', aliases: ['Costume'] },
    { code: '2600', name: 'Hair and make-up', aliases: ['Make-up', 'Makeup', 'Hair'] },
    { code: '2700', name: 'Locations', aliases: ['Location'] },
    { code: '2800', name: 'Transport', aliases: ['Transportation', 'Vehicles'] },
    { code: '2900', name: 'Catering', aliases: ['Food'] }
  ] },
  { name: 'Post-production', categories: [
    { code: '3100', name: 'Editorial', aliases: ['Edit', 'Editing'] },
    { code: '3200', name: 'Sound post and music', aliases: ['Music', 'Sound post'] },
    { code: '3300', name: 'Picture finishing and VFX', aliases: ['VFX', 'Grade', 'Colour'] }
  ] },
  { name: 'Other', categories: [
    { code: '4100', name: 'Insurance' },
    { code: '4200', name: 'Legal and accounting', aliases: ['Legal', 'Accounting'] },
    { code: '4300', name: 'Delivery and publicity', aliases: ['Delivery', 'Publicity', 'Marketing'] }
  ] }
];

const ALL = BUDGET_GROUPS.flatMap(group => group.categories);

function key(text: string): string {
  return text.trim().toLocaleLowerCase('en-GB').replace(/&/g, 'and').replace(/\s+/g, ' ');
}

/** The standard category a cost line files under, if any. */
export function budgetCategory(name: string): BudgetCategory | undefined {
  const wanted = key(name);
  return ALL.find(category => key(category.name) === wanted || category.code === wanted || category.aliases?.some(alias => key(alias) === wanted));
}

export interface TopSheetRow {
  code: string;
  name: string;
  lines: BudgetLine[];
  planned: number;
  actual: number;
}

export interface TopSheetGroup {
  name: string;
  rows: TopSheetRow[];
  planned: number;
  actual: number;
}

export interface TopSheet {
  groups: TopSheetGroup[];
  subtotal: { planned: number; actual: number };
  contingencyPercent: number;
  contingency: number;
  total: { planned: number; actual: number; remaining: number };
}

function row(code: string, name: string, lines: BudgetLine[]): TopSheetRow {
  return {
    code, name, lines,
    planned: lines.reduce((sum, line) => sum + linePlanned(line), 0),
    actual: lines.reduce((sum, line) => sum + line.actualPence, 0)
  };
}

/** Groups cost lines into the standard top sheet; categories outside the standard list sit under Other. */
export function budgetTopSheet(plan: Pick<ProductionPlan, 'budget' | 'contingencyPercent'>): TopSheet {
  const byCode = new Map<string, BudgetLine[]>();
  const custom = new Map<string, BudgetLine[]>();
  for (const line of plan.budget) {
    const category = budgetCategory(line.category);
    const name = line.category.trim() || 'Uncategorised';
    if (category) byCode.set(category.code, [...(byCode.get(category.code) ?? []), line]);
    else custom.set(name, [...(custom.get(name) ?? []), line]);
  }
  const groups = BUDGET_GROUPS.map((group): TopSheetGroup => {
    const rows = group.categories.map(category => row(category.code, category.name, byCode.get(category.code) ?? []));
    if (group.name === 'Other') rows.push(...[...custom].map(([name, lines]) => row('4900', name, lines)));
    return { name: group.name, rows, planned: rows.reduce((sum, item) => sum + item.planned, 0), actual: rows.reduce((sum, item) => sum + item.actual, 0) };
  });
  const subtotal = { planned: groups.reduce((sum, group) => sum + group.planned, 0), actual: groups.reduce((sum, group) => sum + group.actual, 0) };
  const percent = plan.contingencyPercent ?? 0;
  const contingencyPercent = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  const contingency = Math.round(subtotal.planned * contingencyPercent / 100);
  const planned = subtotal.planned + contingency;
  return { groups, subtotal, contingencyPercent, contingency, total: { planned, actual: subtotal.actual, remaining: planned - subtotal.actual } };
}

/** Amounts in pounds for tables, where the column heading names the currency. */
export function amountLabel(pence: number): string {
  return new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(pence / 100);
}

export function budgetCsv(project: Project, plan: ProductionPlan): string {
  const sheet = budgetTopSheet(plan);
  const source = activeProductionSource(project, plan);
  const pounds = (pence: number) => pence / 100;
  return reportCsv([
    ['Account', 'Category', 'Item', 'Quantity', 'Rate GBP', 'Units', 'Planned GBP', 'Actual GBP', 'Remaining GBP', 'Source revision'],
    ...sheet.groups.flatMap(group => [
      ...group.rows.flatMap(item => [
        ...item.lines.map(line => [
          item.code, item.name, line.name, line.quantity, pounds(line.unitCostPence), `${line.units ?? 1}${line.unitLabel ? ` ${line.unitLabel}` : ''}`,
          pounds(linePlanned(line)), pounds(line.actualPence), pounds(linePlanned(line) - line.actualPence), line.source.revisionId
        ]),
        [item.code, item.name, 'Category total', '', '', '', pounds(item.planned), pounds(item.actual), pounds(item.planned - item.actual), '']
      ]),
      ['', group.name, 'Group total', '', '', '', pounds(group.planned), pounds(group.actual), pounds(group.planned - group.actual), '']
    ]),
    ['', '', 'Subtotal', '', '', '', pounds(sheet.subtotal.planned), pounds(sheet.subtotal.actual), pounds(sheet.subtotal.planned - sheet.subtotal.actual), ''],
    ['', '', `Contingency ${sheet.contingencyPercent}%`, '', '', '', pounds(sheet.contingency), '', '', ''],
    ['', '', 'TOTAL', '', '', '', pounds(sheet.total.planned), pounds(sheet.total.actual), pounds(sheet.total.remaining), source.revisionId]
  ]);
}
