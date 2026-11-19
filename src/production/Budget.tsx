import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack } from '@astryxdesign/core/HStack';
import { Link } from '@astryxdesign/core/Link';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Selector } from '@astryxdesign/core/Selector';
import { Table, TableBody, TableCell, TableFooter, TableHeader, TableHeaderCell, TableRow } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import { VStack } from '@astryxdesign/core/VStack';
import { ChevronDown, ChevronRight, Download, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { newId } from '../model';
import { Choice, Dialog, FormError, Glyph, Pane } from './components';
import type { PaneProps } from './components';
import { BUDGET_GROUPS, amountLabel, budgetCategory, budgetCsv, budgetTopSheet } from './budget';
import { lineBase, lineFringe, linePlanned, moneyLabel } from './model';
import type { BudgetLine } from './model';

const UNITS = ['days', 'weeks', 'hours', 'items', 'flat', 'allow'];
/** Common UK employer costs on crew and cast wages. */
const FRINGES = [
  { value: '', label: 'None' },
  { value: '13.8', label: 'Employer NI · 13.8%' },
  { value: '12.07', label: 'Holiday pay · 12.07%' },
  { value: '3', label: 'Pension · 3%' },
  { value: '28.87', label: 'NI + holiday + pension · 28.87%' }
];

function asPence(raw: string): number {
  const value = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return NaN;
  const [pounds, decimals = ''] = value.split('.');
  return Number(pounds) * 100 + Number(decimals.padEnd(2, '0'));
}

function share(part: number, whole: number): string {
  return whole > 0 && part > 0 ? `${Math.round(part / whole * 1000) / 10}%` : '—';
}

function lineFormula(line: BudgetLine): string {
  const units = line.units ?? 1;
  return `${line.quantity} × £${amountLabel(line.unitCostPence)}${units !== 1 || line.unitLabel ? ` × ${units}${line.unitLabel ? ` ${line.unitLabel}` : ''}` : ''}${line.fringePercent ? ` + ${line.fringePercent}% fringes` : ''}`;
}

/** Numbers in the top sheet: tabular, end-aligned, red when an account is over. */
function End({ children }: { children: string }) {
  return <Text as="p" display="block" type="inherit" color="inherit" justify="end">{children}</Text>;
}
const GROUP = { background: 'var(--color-background-muted)' } as const;
function Num({ pence, strong, over, muted }: { pence?: number; strong?: boolean; over?: boolean; muted?: string }) {
  return <Text as="p" display="block" justify="end" hasTabularNumbers weight={strong ? 'semibold' : undefined} color={muted !== undefined ? 'secondary' : undefined}
    style={over ? { color: 'var(--color-text-error)' } : undefined}>{muted ?? amountLabel(pence ?? 0)}</Text>;
}

/** How much of an account's plan has been spent, as a short bar and a percentage. */
function Spend({ planned, actual }: { planned: number; actual: number }) {
  if (!planned && !actual) return <Text as="p" display="block" justify="end" color="secondary">—</Text>;
  const percent = planned > 0 ? Math.round(actual / planned * 100) : 100;
  return <Tooltip content={`${percent}% of planned spent`}>
    <HStack gap={2} align="center" justify="end">
      <VStack width={64}><ProgressBar label="Spent" isLabelHidden value={Math.min(100, percent)} variant={percent > 100 ? 'error' : percent > 85 ? 'warning' : 'success'} /></VStack>
      <Text type="supporting" hasTabularNumbers>{percent}%</Text>
    </HStack>
  </Tooltip>;
}

/** One headline figure of the top sheet. */
function Figure({ label, value, note, alert }: { label: string; value: string; note: string; alert?: boolean }) {
  return <Card variant={alert ? 'red' : 'muted'} padding={4}>
    <VStack gap={0.5}>
      <Text type="supporting" color="secondary">{label}</Text>
      <Text size="xl" weight="semibold" hasTabularNumbers>{value}</Text>
      <Text type="supporting" color="secondary">{note}</Text>
    </VStack>
  </Card>;
}

type Editing = { line?: BudgetLine; category: string };

export function Budget({ project, plan, source, update, readOnly, issueOutput }: PaneProps) {
  const [editing, setEditing] = useState<Editing>();
  const [hideEmpty, setHideEmpty] = useState(false);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const sheet = budgetTopSheet(plan);
  const spent = sheet.total.planned > 0 ? Math.min(100, Math.round(sheet.total.actual / sheet.total.planned * 100)) : 0;
  const over = sheet.total.remaining < 0;
  const used = sheet.groups.reduce((count, group) => count + group.rows.filter(row => row.lines.length).length, 0);
  const categories = sheet.groups.reduce((count, group) => count + group.rows.length, 0);
  const overAccounts = sheet.groups.flatMap(group => group.rows).filter(row => row.actual > row.planned).length;
  const fringes = plan.budget.reduce((sum, line) => sum + lineFringe(line), 0);

  const toggleGroup = (name: string) => setCollapsed(list => list.includes(name) ? list.filter(item => item !== name) : [...list, name]);

  return <>
    <Pane label="Budget top sheet" title="Budget top sheet"
      description={`${plan.budget.length} cost ${plan.budget.length === 1 ? 'line' : 'lines'} across ${used} of ${categories} accounts · GBP`}
      actions={<>
        <Button label={hideEmpty ? 'Show all accounts' : 'Hide empty accounts'} icon={<Glyph icon={hideEmpty ? Eye : EyeOff} />} onClick={() => setHideEmpty(value => !value)} />
        {!readOnly && <Button label="Export CSV" icon={<Glyph icon={Download} />} onClick={() => issueOutput('budget', 'swdr-cost-report.csv', budgetCsv(project, plan))} />}
        {!readOnly && <Button variant="primary" label="New cost line" icon={<Glyph icon={Plus} />} onClick={() => setEditing({ category: '' })} />}
      </>}>
      <Grid columns={{ minWidth: 170, repeat: 'fit' }} gap={3}>
        <Figure label="Total budget" value={moneyLabel(sheet.total.planned)} note={`incl. ${sheet.contingencyPercent}% contingency${fringes ? ` · ${moneyLabel(fringes)} fringes` : ''}`} />
        <Figure label="Actual spend" value={moneyLabel(sheet.total.actual)} note={`${spent}% of budget`} />
        <Figure label={over ? 'Over budget' : 'Remaining'} value={moneyLabel(Math.abs(sheet.total.remaining))} note={over ? 'Actuals exceed the plan' : 'Planned less actual'} alert={over} />
        <Figure label="Accounts over" value={String(overAccounts)} note={overAccounts ? 'Check the red rows below' : 'Every account within plan'} alert={overAccounts > 0} />
      </Grid>
      <ProgressBar label="Budget spent" isLabelHidden value={spent} variant={over ? 'error' : spent > 85 ? 'warning' : 'accent'} />
      {!readOnly && !plan.budget.length && <Banner status="info" title="Start your budget"
        description="Choose New cost line, or Add line beside any account. Each line is quantity × rate × units, and the totals here update as you go." />}
      <Table density="compact" dividers="rows">
        <TableHeader><TableRow isHeaderRow>
          <TableHeaderCell>Account and cost lines</TableHeaderCell>
          <TableHeaderCell><End>Planned (£)</End></TableHeaderCell><TableHeaderCell><End>Actual (£)</End></TableHeaderCell>
          <TableHeaderCell><End>Remaining (£)</End></TableHeaderCell><TableHeaderCell><End>Spent</End></TableHeaderCell><TableHeaderCell><End>Share</End></TableHeaderCell>
        </TableRow></TableHeader>
        {sheet.groups.map(group => {
          const closed = collapsed.includes(group.name);
          const rows = hideEmpty ? group.rows.filter(row => row.lines.length) : group.rows;
          return <TableBody key={group.name}>
            <TableRow><TableCell colSpan={6} style={GROUP}>
              <Button variant="ghost" size="sm" label={group.name} aria-expanded={!closed} icon={<Glyph icon={closed ? ChevronRight : ChevronDown} />}
                onClick={() => toggleGroup(group.name)}><Text type="label">{group.name}</Text></Button>
            </TableCell></TableRow>
            {!closed && rows.map(row => [
              <TableRow key={`${row.code}-${row.name}`}>
                <TableCell><HStack gap={2} align="center" wrap="wrap">
                  <Text type="supporting" color="secondary" hasTabularNumbers>{row.code}</Text>
                  <Text weight="semibold" color={row.lines.length ? 'primary' : 'secondary'}>{row.name}</Text>
                  {!readOnly && <Button variant="ghost" size="sm" label={`Add cost line to ${row.name}`} icon={<Glyph icon={Plus} size="xsm" />}
                    onClick={() => setEditing({ category: row.name })}>Add line</Button>}
                </HStack></TableCell>
                <TableCell><Num pence={row.planned} /></TableCell>
                <TableCell><Num pence={row.actual} /></TableCell>
                <TableCell><Num pence={row.planned - row.actual} over={row.planned - row.actual < 0} /></TableCell>
                <TableCell><Spend planned={row.planned} actual={row.actual} /></TableCell>
                <TableCell><Num muted={share(row.planned, sheet.total.planned)} /></TableCell>
              </TableRow>,
              ...row.lines.map(line => <TableRow key={line.id}>
                <TableCell><VStack gap={0} hAlign="start" paddingInlineStart={8}>
                  {readOnly ? <Text>{line.name}</Text> : <Link label={`Edit ${line.name}`} onClick={() => setEditing({ line, category: line.category })}>
                    {line.name} <Glyph icon={Pencil} size="xsm" /></Link>}
                  <Text type="supporting" color="secondary">{lineFormula(line)}</Text>
                </VStack></TableCell>
                <TableCell><Num pence={linePlanned(line)} /></TableCell>
                <TableCell><Num pence={line.actualPence} /></TableCell>
                <TableCell><Num pence={linePlanned(line) - line.actualPence} over={linePlanned(line) - line.actualPence < 0} /></TableCell>
                <TableCell><Spend planned={linePlanned(line)} actual={line.actualPence} /></TableCell>
                <TableCell />
              </TableRow>)
            ])}
            <TableRow>
              <TableCell><Text weight="semibold">Total {group.name.toLocaleLowerCase('en-GB')}</Text></TableCell>
              <TableCell><Num strong pence={group.planned} /></TableCell>
              <TableCell><Num strong pence={group.actual} /></TableCell>
              <TableCell><Num strong pence={group.planned - group.actual} over={group.planned - group.actual < 0} /></TableCell>
              <TableCell><Spend planned={group.planned} actual={group.actual} /></TableCell>
              <TableCell><Num muted={share(group.planned, sheet.total.planned)} /></TableCell>
            </TableRow>
          </TableBody>;
        })}
        <TableFooter>
          <TableRow>
            <TableCell>Subtotal</TableCell>
            <TableCell><Num pence={sheet.subtotal.planned} /></TableCell>
            <TableCell><Num pence={sheet.subtotal.actual} /></TableCell>
            <TableCell /><TableCell /><TableCell />
          </TableRow>
          <TableRow>
            <TableCell><HStack gap={2} align="center">
              <Text>Contingency</Text>
              {readOnly ? <Text>{sheet.contingencyPercent}%</Text> : <NumberInput key={sheet.contingencyPercent} label="Contingency percentage" isLabelHidden size="sm" width={96}
                min={0} max={100} step={0.5} value={sheet.contingencyPercent} onChange={value => {
                  if (Number.isFinite(value) && value >= 0 && value <= 100 && value !== sheet.contingencyPercent) {
                    update(current => ({ ...current, contingencyPercent: value }), 'Contingency saved.');
                  }
                }} />}
              {!readOnly && <Text color="secondary">%</Text>}
            </HStack></TableCell>
            <TableCell><Num pence={sheet.contingency} /></TableCell>
            <TableCell /><TableCell /><TableCell /><TableCell />
          </TableRow>
          <TableRow>
            <TableCell><Text weight="bold">Grand total</Text></TableCell>
            <TableCell><Num strong pence={sheet.total.planned} /></TableCell>
            <TableCell><Num strong pence={sheet.total.actual} /></TableCell>
            <TableCell><Num strong pence={sheet.total.remaining} over={over} /></TableCell>
            <TableCell /><TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    </Pane>
    {editing && <CostLineDialog key={editing.line?.id ?? `new-${editing.category}`} line={editing.line} category={editing.category}
      onClose={() => setEditing(undefined)} save={(line, remove) => update(current => ({
        ...current,
        budget: remove ? current.budget.filter(item => item.id !== line.id) :
          current.budget.some(item => item.id === line.id) ? current.budget.map(item => item.id === line.id ? line : item) : [...current.budget, line]
      }), remove ? 'Cost line removed.' : 'Cost saved.')} source={source} />}
  </>;
}

function CostLineDialog({ line, category: preset, source, onClose, save }: {
  line?: BudgetLine;
  category: string;
  source: PaneProps['source'];
  onClose: () => void;
  save: (line: BudgetLine, remove?: boolean) => boolean;
}) {
  const [category, setCategory] = useState(line ? budgetCategory(line.category)?.name ?? line.category : preset);
  const [name, setName] = useState(line?.name ?? '');
  const [quantity, setQuantity] = useState(String(line?.quantity ?? 1));
  const [rate, setRate] = useState(line ? (line.unitCostPence / 100).toFixed(2) : '');
  const [units, setUnits] = useState(String(line?.units ?? 1));
  const [unitLabel, setUnitLabel] = useState(line?.unitLabel ?? '');
  const [actual, setActual] = useState(line ? (line.actualPence / 100).toFixed(2) : '');
  const [fringe, setFringe] = useState(line?.fringePercent ? String(line.fringePercent) : '');
  const [error, setError] = useState('');

  const q = Number(quantity);
  const u = Number(units);
  const ratePence = asPence(rate || '0');
  const actualPence = asPence(actual || '0');
  const f = fringe.trim() ? Number(fringe) : 0;
  const base = Number.isFinite(q) && Number.isFinite(u) && Number.isSafeInteger(ratePence) ? lineBase({ quantity: q, unitCostPence: ratePence, units: u } as BudgetLine) : NaN;
  const extra = Number.isFinite(f) && f > 0 ? Math.round(base * f / 100) : 0;
  const planned = base + extra;
  const remaining = planned - actualPence;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !category.trim() || !Number.isFinite(q) || q < 0 || !Number.isFinite(u) || u < 0 ||
        !Number.isSafeInteger(ratePence) || !Number.isSafeInteger(actualPence) || !Number.isSafeInteger(planned) || !Number.isFinite(f) || f < 0 || f > 100) {
      return setError('Enter an account, an item name, a quantity, units, a fringe between 0 and 100% and amounts in pounds such as 120 or 120.50.');
    }
    const next: BudgetLine = {
      id: line?.id ?? newId(), name: name.trim(), category: category.trim(), quantity: q, unitCostPence: ratePence, actualPence, source: line?.source ?? source,
      ...(u !== 1 ? { units: u } : {}), ...(unitLabel.trim() ? { unitLabel: unitLabel.trim() } : {}), ...(f > 0 ? { fringePercent: f } : {})
    };
    if (save(next)) onClose();
  }

  const accounts = [
    ...BUDGET_GROUPS.map(group => ({ type: 'section' as const, title: group.name, options: group.categories.map(item => ({ value: item.name, label: `${item.code} · ${item.name}` })) })),
    ...(category && !budgetCategory(category) ? [{ value: category, label: category }] : [])
  ];
  const fringeChoice = FRINGES.some(item => item.value === fringe) ? fringe : 'custom';
  const step = (number: number, title: string, children: ReactNode) => <Card variant="muted" padding={4}>
    <HStack gap={3} align="start">
      <Badge variant="info" label={String(number)} aria-hidden="true" />
      <VStack gap={3} style={{ flex: 1, minWidth: 0 }}><Text weight="semibold">{title}</Text>{children}</VStack>
    </HStack>
  </Card>;

  return <Dialog title={line ? `Edit ${line.name}` : 'Add a cost line'} width={640} onClose={onClose}>
    <VStack as="form" gap={3} onSubmit={submit}>
      {step(1, 'Choose the account', <>
        <Selector label="Category" value={category} onChange={setCategory} placeholder="Choose an account" options={accounts} isRequired />
        <TextInput label="Item name" value={name} onChange={setName} placeholder="Camera package, lunch for crew, location fee…" isRequired />
      </>)}
      {step(2, 'Planned cost = how many × rate × how long', <>
        <Grid columns={{ minWidth: 110, repeat: 'fit' }} gap={2}>
          <TextInput label="Quantity" value={quantity} onChange={setQuantity} isRequired />
          <TextInput label="Rate (£)" value={rate} onChange={setRate} placeholder="0.00" isRequired />
          <TextInput label="Units" value={units} onChange={setUnits} isRequired />
          <Choice label="Unit" value={unitLabel} onChange={setUnitLabel}
            options={[{ value: '', label: '—' }, ...[...new Set([...UNITS, ...(unitLabel ? [unitLabel] : [])])].map(unit => ({ value: unit, label: unit }))]} />
        </Grid>
        <Grid columns={{ minWidth: 200, repeat: 'fit' }} gap={2}>
          <Choice label="Fringes" value={fringeChoice} onChange={value => setFringe(value === 'custom' ? fringe || '10' : value)}
            options={[...FRINGES, { value: 'custom', label: 'Custom…' }]} />
          <TextInput label="Fringe (%)" value={fringe} onChange={setFringe} placeholder="0" />
        </Grid>
        <HStack gap={2} align="center" wrap="wrap" aria-live="polite">
          <Text color="secondary">Planned</Text>
          {extra > 0 && Number.isFinite(base) && <Text type="supporting" color="secondary">{moneyLabel(base)} + {moneyLabel(extra)} fringes =</Text>}
          <Text size="lg" weight="semibold" hasTabularNumbers>{Number.isFinite(planned) ? moneyLabel(planned) : '—'}</Text>
        </HStack>
      </>)}
      {step(3, 'Record what was spent', <>
        <TextInput label="Actual spend (£)" value={actual} onChange={setActual} placeholder="0.00 — fill in once you have paid" />
        {Number.isFinite(remaining) && <Text style={remaining < 0 ? { color: 'var(--color-text-error)' } : undefined}>
          {remaining < 0 ? 'Over by' : 'Left on this line'} <Text weight="semibold" hasTabularNumbers>{moneyLabel(Math.abs(remaining))}</Text></Text>}
      </>)}
      <FormError>{error}</FormError>
      <HStack gap={2} justify="end" wrap="wrap">
        {line && <Button variant="destructive" label="Remove line" icon={<Glyph icon={Trash2} />} onClick={() => { if (save(line, true)) onClose(); }} />}
        <Button label="Cancel" onClick={onClose} />
        <Button type="submit" variant="primary" label={line ? 'Save cost line' : 'Add cost line'} />
      </HStack>
    </VStack>
  </Dialog>;
}
