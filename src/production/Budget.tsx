import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Table, TableBody, TableCell, TableFooter, TableHeader, TableHeaderCell, TableRow } from '@astryxdesign/core/Table';
import { ChevronDown, ChevronRight, Download, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { newId } from '../model';
import { Dialog } from './components';
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

/** A thin bar showing how much of an account's plan has been spent. */
function Spend({ planned, actual }: { planned: number; actual: number }) {
  if (!planned && !actual) return <span className="production-muted">—</span>;
  const percent = planned > 0 ? Math.round(actual / planned * 100) : 100;
  const tone = percent > 100 ? 'over' : percent > 85 ? 'near' : 'ok';
  return <span className={`production-spend production-spend-${tone}`} title={`${percent}% of planned spent`}>
    <span className="production-spend-track" aria-hidden="true"><span style={{ width: `${Math.min(100, percent)}%` }} /></span>
    <small>{percent}%</small>
  </span>;
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

  return <div className="production-budget">
    <section className="production-card production-budget-main" aria-label="Budget top sheet">
      <div className="production-section-heading">
        <div><h3>Budget top sheet</h3>
          <p className="production-muted">{plan.budget.length} cost {plan.budget.length === 1 ? 'line' : 'lines'} across {used} of {categories} accounts · GBP</p></div>
        <div className="production-actions">
          <button type="button" className="production-button" aria-pressed={hideEmpty} onClick={() => setHideEmpty(value => !value)}>
            {hideEmpty ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />} {hideEmpty ? 'Show all accounts' : 'Hide empty accounts'}
          </button>
          {!readOnly && <button type="button" className="production-button" onClick={() =>
            issueOutput('budget', 'swdr-cost-report.csv', budgetCsv(project, plan))
          }><Download size={16} aria-hidden="true" /> Export CSV</button>}
          {!readOnly && <button type="button" className="production-button production-primary" onClick={() => setEditing({ category: '' })}>
            <Plus size={16} aria-hidden="true" /> New cost line</button>}
        </div>
      </div>
      <div className="production-metrics production-metrics-4">
        <div><small>Total budget</small><strong>{moneyLabel(sheet.total.planned)}</strong><span>incl. {sheet.contingencyPercent}% contingency{fringes ? ` · ${moneyLabel(fringes)} fringes` : ''}</span></div>
        <div><small>Actual spend</small><strong>{moneyLabel(sheet.total.actual)}</strong><span>{spent}% of budget</span></div>
        <div className={over ? 'production-metric-over' : undefined}><small>{over ? 'Over budget' : 'Remaining'}</small><strong>{moneyLabel(Math.abs(sheet.total.remaining))}</strong>
          <span>{over ? 'Actuals exceed the plan' : 'Planned less actual'}</span></div>
        <div className={overAccounts ? 'production-metric-over' : undefined}><small>Accounts over</small><strong>{overAccounts}</strong>
          <span>{overAccounts ? 'Check the red rows below' : 'Every account within plan'}</span></div>
      </div>
      <ProgressBar label="Budget spent" isLabelHidden value={spent} variant={over ? 'error' : spent > 85 ? 'warning' : 'accent'} />
      {!readOnly && !plan.budget.length && <div className="production-budget-hint">
        <strong>Start your budget</strong>
        <span>Choose <em>New cost line</em>, or <em>Add line</em> beside any account. Each line is quantity × rate × units, and the totals here update as you go.</span>
      </div>}
      <div className="production-table-scroll"><Table className="production-grid-table production-budget-table" dividers="rows">
        <TableHeader><TableRow isHeaderRow>
          <TableHeaderCell>Acct</TableHeaderCell><TableHeaderCell>Account and cost lines</TableHeaderCell>
          <TableHeaderCell>Planned (£)</TableHeaderCell><TableHeaderCell>Actual (£)</TableHeaderCell>
          <TableHeaderCell>Remaining (£)</TableHeaderCell><TableHeaderCell>Spent</TableHeaderCell><TableHeaderCell>Share</TableHeaderCell>
        </TableRow></TableHeader>
        {sheet.groups.map(group => {
          const closed = collapsed.includes(group.name);
          const rows = hideEmpty ? group.rows.filter(row => row.lines.length) : group.rows;
          return <TableBody key={group.name}>
            <TableRow><TableCell colSpan={7} className="production-group-row">
              <button type="button" className="production-group-toggle" aria-expanded={!closed} onClick={() => toggleGroup(group.name)}>
                {closed ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}{group.name}
              </button>
            </TableCell></TableRow>
            {!closed && rows.map(row => [
              <TableRow key={`${row.code}-${row.name}`} className="production-account-row">
                <TableCell><span className="production-account">{row.code}</span></TableCell>
                <TableCell><span className="production-budget-category">
                  <strong className={row.lines.length ? undefined : 'production-muted'}>{row.name}</strong>
                  {!readOnly && <button type="button" className="production-chip-button" onClick={() => setEditing({ category: row.name })} aria-label={`Add cost line to ${row.name}`}>
                    <Plus size={13} aria-hidden="true" /> Add line</button>}
                </span></TableCell>
                <TableCell><span className="production-num">{amountLabel(row.planned)}</span></TableCell>
                <TableCell><span className="production-num">{amountLabel(row.actual)}</span></TableCell>
                <TableCell><span className={`production-num${row.planned - row.actual < 0 ? ' production-negative' : ''}`}>{amountLabel(row.planned - row.actual)}</span></TableCell>
                <TableCell><Spend planned={row.planned} actual={row.actual} /></TableCell>
                <TableCell><span className="production-num production-muted">{share(row.planned, sheet.total.planned)}</span></TableCell>
              </TableRow>,
              ...row.lines.map(line => <TableRow key={line.id} className="production-line-row">
                <TableCell />
                <TableCell><span className="production-budget-line">
                  {readOnly ? <span>{line.name}<small>{lineFormula(line)}</small></span> :
                    <button type="button" className="production-line-open" aria-label={`Edit ${line.name}`} onClick={() => setEditing({ line, category: line.category })}>
                      <span>{line.name}<small>{lineFormula(line)}</small></span>
                      <span className="production-line-edit"><Pencil size={13} aria-hidden="true" /> Edit</span>
                    </button>}
                </span></TableCell>
                <TableCell><span className="production-num">{amountLabel(linePlanned(line))}</span></TableCell>
                <TableCell><span className="production-num">{amountLabel(line.actualPence)}</span></TableCell>
                <TableCell><span className={`production-num${linePlanned(line) - line.actualPence < 0 ? ' production-negative' : ''}`}>{amountLabel(linePlanned(line) - line.actualPence)}</span></TableCell>
                <TableCell><Spend planned={linePlanned(line)} actual={line.actualPence} /></TableCell>
                <TableCell />
              </TableRow>)
            ])}
            <TableRow className="production-total-row">
              <TableCell /><TableCell><strong>Total {group.name.toLocaleLowerCase('en-GB')}</strong></TableCell>
              <TableCell><strong className="production-num">{amountLabel(group.planned)}</strong></TableCell>
              <TableCell><strong className="production-num">{amountLabel(group.actual)}</strong></TableCell>
              <TableCell><strong className={`production-num${group.planned - group.actual < 0 ? ' production-negative' : ''}`}>{amountLabel(group.planned - group.actual)}</strong></TableCell>
              <TableCell><Spend planned={group.planned} actual={group.actual} /></TableCell>
              <TableCell><span className="production-num production-muted">{share(group.planned, sheet.total.planned)}</span></TableCell>
            </TableRow>
          </TableBody>;
        })}
        <TableFooter>
          <TableRow>
            <TableCell /><TableCell>Subtotal</TableCell>
            <TableCell><span className="production-num">{amountLabel(sheet.subtotal.planned)}</span></TableCell>
            <TableCell><span className="production-num">{amountLabel(sheet.subtotal.actual)}</span></TableCell>
            <TableCell /><TableCell /><TableCell />
          </TableRow>
          <TableRow>
            <TableCell /><TableCell><span className="production-budget-category">Contingency
              {readOnly ? ` ${sheet.contingencyPercent}%` : <label className="production-inline-number"><input type="number" min={0} max={100} step={0.5} aria-label="Contingency percentage"
                defaultValue={sheet.contingencyPercent} key={sheet.contingencyPercent} onBlur={event => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value) && value >= 0 && value <= 100 && value !== sheet.contingencyPercent) {
                    update(current => ({ ...current, contingencyPercent: value }), 'Contingency saved.');
                  }
                }} />%</label>}</span></TableCell>
            <TableCell><span className="production-num">{amountLabel(sheet.contingency)}</span></TableCell>
            <TableCell /><TableCell /><TableCell /><TableCell />
          </TableRow>
          <TableRow className="production-grand-row">
            <TableCell /><TableCell><strong>Grand total</strong></TableCell>
            <TableCell><strong className="production-num">{amountLabel(sheet.total.planned)}</strong></TableCell>
            <TableCell><strong className="production-num">{amountLabel(sheet.total.actual)}</strong></TableCell>
            <TableCell><strong className={`production-num${over ? ' production-negative' : ''}`}>{amountLabel(sheet.total.remaining)}</strong></TableCell>
            <TableCell /><TableCell />
          </TableRow>
        </TableFooter>
      </Table></div>
    </section>
    {editing && <CostLineDialog key={editing.line?.id ?? `new-${editing.category}`} line={editing.line} category={editing.category}
      onClose={() => setEditing(undefined)} save={(line, remove) => update(current => ({
        ...current,
        budget: remove ? current.budget.filter(item => item.id !== line.id) :
          current.budget.some(item => item.id === line.id) ? current.budget.map(item => item.id === line.id ? line : item) : [...current.budget, line]
      }), remove ? 'Cost line removed.' : 'Cost saved.')} source={source} />}
  </div>;
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

  function submit(event: FormEvent<HTMLFormElement>) {
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

  return <Dialog title={line ? `Edit ${line.name}` : 'Add a cost line'} onClose={onClose}>
    <form className="production-form production-cost-form" onSubmit={submit}>
      <div className="production-cost-step">
        <span className="production-step-number" aria-hidden="true">1</span>
        <div className="production-form">
          <label>Category<select name="category" required value={category} onChange={event => setCategory(event.target.value)} autoFocus={!preset}>
            <option value="" disabled>Choose an account</option>
            {BUDGET_GROUPS.map(group => <optgroup key={group.name} label={group.name}>
              {group.categories.map(item => <option key={item.code} value={item.name}>{item.code} · {item.name}</option>)}
            </optgroup>)}
            {category && !budgetCategory(category) && <option value={category}>{category}</option>}
          </select></label>
          <label>Item name<input name="name" required value={name} onChange={event => setName(event.target.value)} placeholder="Camera package, lunch for crew, location fee…" autoFocus={!!preset} /></label>
        </div>
      </div>
      <div className="production-cost-step">
        <span className="production-step-number" aria-hidden="true">2</span>
        <div className="production-form">
          <p className="production-cost-hint">Planned cost = <strong>how many</strong> × <strong>rate</strong> × <strong>how long</strong></p>
          <div className="production-cost-formula">
            <label>Quantity<input name="quantity" type="number" inputMode="decimal" step="any" min="0" value={quantity} onChange={event => setQuantity(event.target.value)} required /></label>
            <span aria-hidden="true">×</span>
            <label>Rate (£)<input name="rate" type="number" inputMode="decimal" step="0.01" min="0" value={rate} placeholder="0.00" onChange={event => setRate(event.target.value)} required /></label>
            <span aria-hidden="true">×</span>
            <label>Units<input name="units" type="number" inputMode="decimal" step="any" min="0" value={units} onChange={event => setUnits(event.target.value)} required /></label>
            <label>Unit<select name="unitLabel" value={unitLabel} onChange={event => setUnitLabel(event.target.value)}>
              <option value="">—</option>
              {[...new Set([...UNITS, ...(unitLabel ? [unitLabel] : [])])].map(unit => <option key={unit} value={unit}>{unit}</option>)}
            </select></label>
          </div>
          <div className="production-form-row">
            <label>Fringes<select name="fringePreset" value={FRINGES.some(item => item.value === fringe) ? fringe : 'custom'} onChange={event => setFringe(event.target.value === 'custom' ? fringe || '10' : event.target.value)}>
              {FRINGES.map(item => <option key={item.label} value={item.value}>{item.label}</option>)}
              <option value="custom">Custom…</option>
            </select></label>
            <label>Fringe (%)<input name="fringe" type="number" inputMode="decimal" step="any" min="0" max="100" value={fringe} placeholder="0" onChange={event => setFringe(event.target.value)} /></label>
          </div>
          <p className="production-cost-result" aria-live="polite">Planned <span>{extra > 0 && Number.isFinite(base) && <small>{moneyLabel(base)} + {moneyLabel(extra)} fringes = </small>}
            <strong>{Number.isFinite(planned) ? moneyLabel(planned) : '—'}</strong></span></p>
        </div>
      </div>
      <div className="production-cost-step">
        <span className="production-step-number" aria-hidden="true">3</span>
        <div className="production-form">
          <label>Actual spend (£)<input name="actual" type="number" inputMode="decimal" step="0.01" min="0" value={actual} placeholder="0.00 — fill in once you have paid" onChange={event => setActual(event.target.value)} /></label>
          {Number.isFinite(remaining) && <p className={`production-cost-result${remaining < 0 ? ' production-negative' : ''}`}>
            {remaining < 0 ? 'Over by' : 'Left on this line'} <strong>{moneyLabel(Math.abs(remaining))}</strong></p>}
        </div>
      </div>
      {error && <p className="production-form-error" role="alert">{error}</p>}
      <div className="production-actions production-right">
        {line && <button type="button" className="production-button production-danger" onClick={() => { if (save(line, true)) onClose(); }}>
          <Trash2 size={16} aria-hidden="true" /> Remove line</button>}
        <button type="button" className="production-button" onClick={onClose}>Cancel</button>
        <button type="submit" className="production-button production-primary">{line ? 'Save cost line' : 'Add cost line'}</button>
      </div>
    </form>
  </Dialog>;
}
