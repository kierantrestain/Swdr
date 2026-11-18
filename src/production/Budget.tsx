import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Table, TableBody, TableCell, TableFooter, TableHeader, TableHeaderCell, TableRow } from '@astryxdesign/core/Table';
import { Download, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { newId } from '../model';
import type { PaneProps } from './components';
import { BUDGET_GROUPS, amountLabel, budgetCategory, budgetCsv, budgetTopSheet } from './budget';
import { linePlanned, moneyLabel } from './model';
import type { BudgetLine } from './model';

function asPence(raw: FormDataEntryValue | null): number {
  const value = String(raw ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return NaN;
  const [pounds, decimals = ''] = value.split('.');
  return Number(pounds) * 100 + Number(decimals.padEnd(2, '0'));
}

function share(part: number, whole: number): string {
  return whole > 0 && part > 0 ? `${Math.round(part / whole * 1000) / 10}%` : '—';
}

export function Budget({ project, plan, source, update, readOnly, issueOutput }: PaneProps) {
  const [editing, setEditing] = useState<BudgetLine>();
  const [category, setCategory] = useState('');
  const [error, setError] = useState('');
  const sheet = budgetTopSheet(plan);
  const spent = sheet.total.planned > 0 ? Math.min(100, Math.round(sheet.total.actual / sheet.total.planned * 100)) : 0;
  const over = sheet.total.remaining < 0;
  const used = sheet.groups.reduce((count, group) => count + group.rows.filter(row => row.lines.length).length, 0);
  const categories = sheet.groups.reduce((count, group) => count + group.rows.length, 0);

  function startEdit(line?: BudgetLine, preset = '') {
    setEditing(line);
    setCategory(line ? budgetCategory(line.category)?.name ?? line.category : preset);
    setError('');
  }

  return <div className="production-budget">
    <section className="production-card production-budget-main" aria-label="Budget top sheet">
      <div className="production-section-heading">
        <div><h3>Budget top sheet</h3>
          <p className="production-muted">{plan.budget.length} cost {plan.budget.length === 1 ? 'line' : 'lines'} across {used} of {categories} accounts · GBP</p></div>
        {!readOnly && <button type="button" className="production-button" onClick={() =>
          issueOutput('budget', 'swdr-cost-report.csv', budgetCsv(project, plan))
        }><Download size={16} /> Export CSV</button>}
      </div>
      <div className="production-metrics">
        <div><small>Total budget</small><strong>{moneyLabel(sheet.total.planned)}</strong><span>incl. {sheet.contingencyPercent}% contingency</span></div>
        <div><small>Actual spend</small><strong>{moneyLabel(sheet.total.actual)}</strong><span>{spent}% of budget</span></div>
        <div className={over ? 'production-metric-over' : undefined}><small>{over ? 'Over budget' : 'Remaining'}</small><strong>{moneyLabel(sheet.total.remaining)}</strong>
          <span>{over ? 'Review actuals' : 'Planned less actual'}</span></div>
      </div>
      <ProgressBar label="Budget spent" isLabelHidden value={spent} variant={over ? 'error' : spent > 85 ? 'warning' : 'accent'} />
      <div className="production-table-scroll"><Table className="production-grid-table" density="compact" dividers="rows">
        <TableHeader><TableRow isHeaderRow>
          <TableHeaderCell>Acct</TableHeaderCell><TableHeaderCell>Category</TableHeaderCell>
          <TableHeaderCell>Planned (£)</TableHeaderCell><TableHeaderCell>Actual (£)</TableHeaderCell>
          <TableHeaderCell>Remaining (£)</TableHeaderCell><TableHeaderCell>Share</TableHeaderCell>
        </TableRow></TableHeader>
        {sheet.groups.map(group => <TableBody key={group.name}>
          <TableRow><TableCell colSpan={6} className="production-group-row">{group.name}</TableCell></TableRow>
          {group.rows.map(row => [
            <TableRow key={`${row.code}-${row.name}`}>
              <TableCell><span className="production-account">{row.code}</span></TableCell>
              <TableCell><span className="production-budget-category">
                <strong className={row.lines.length ? undefined : 'production-muted'}>{row.name}</strong>
                {!readOnly && <button type="button" className="production-link" onClick={() => startEdit(undefined, row.name)} aria-label={`Add cost line to ${row.name}`}><Plus size={13} aria-hidden="true" /> Line</button>}
              </span></TableCell>
              <TableCell><span className="production-num">{amountLabel(row.planned)}</span></TableCell>
              <TableCell><span className="production-num">{amountLabel(row.actual)}</span></TableCell>
              <TableCell><span className={`production-num${row.planned - row.actual < 0 ? ' production-negative' : ''}`}>{amountLabel(row.planned - row.actual)}</span></TableCell>
              <TableCell><span className="production-num production-muted">{share(row.planned, sheet.total.planned)}</span></TableCell>
            </TableRow>,
            ...row.lines.map(line => <TableRow key={line.id}>
              <TableCell />
              <TableCell><span className="production-budget-line">
                <span>{line.name}<small>{line.quantity} × {amountLabel(line.unitCostPence)}{(line.units ?? 1) !== 1 || line.unitLabel ? ` × ${line.units ?? 1}${line.unitLabel ? ` ${line.unitLabel}` : ''}` : ''}</small></span>
                {!readOnly && <button type="button" className="production-icon" onClick={() => startEdit(line)} aria-label={`Edit ${line.name}`}><Pencil size={13} /></button>}
              </span></TableCell>
              <TableCell><span className="production-num">{amountLabel(linePlanned(line))}</span></TableCell>
              <TableCell><span className="production-num">{amountLabel(line.actualPence)}</span></TableCell>
              <TableCell><span className={`production-num${linePlanned(line) - line.actualPence < 0 ? ' production-negative' : ''}`}>{amountLabel(linePlanned(line) - line.actualPence)}</span></TableCell>
              <TableCell />
            </TableRow>)
          ])}
          <TableRow>
            <TableCell /><TableCell><strong>Total {group.name.toLocaleLowerCase('en-GB')}</strong></TableCell>
            <TableCell><strong className="production-num">{amountLabel(group.planned)}</strong></TableCell>
            <TableCell><strong className="production-num">{amountLabel(group.actual)}</strong></TableCell>
            <TableCell><strong className="production-num">{amountLabel(group.planned - group.actual)}</strong></TableCell>
            <TableCell><span className="production-num production-muted">{share(group.planned, sheet.total.planned)}</span></TableCell>
          </TableRow>
        </TableBody>)}
        <TableFooter>
          <TableRow>
            <TableCell /><TableCell>Subtotal</TableCell>
            <TableCell><span className="production-num">{amountLabel(sheet.subtotal.planned)}</span></TableCell>
            <TableCell><span className="production-num">{amountLabel(sheet.subtotal.actual)}</span></TableCell>
            <TableCell /><TableCell />
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
            <TableCell /><TableCell /><TableCell />
          </TableRow>
          <TableRow>
            <TableCell /><TableCell><strong>Grand total</strong></TableCell>
            <TableCell><strong className="production-num">{amountLabel(sheet.total.planned)}</strong></TableCell>
            <TableCell><strong className="production-num">{amountLabel(sheet.total.actual)}</strong></TableCell>
            <TableCell><strong className={`production-num${over ? ' production-negative' : ''}`}>{amountLabel(sheet.total.remaining)}</strong></TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table></div>
    </section>
    {!readOnly && <section className="production-card production-budget-side">
      <h3>{editing ? 'Edit cost line' : 'Add cost line'}</h3>
      <p className="production-muted">Planned cost is quantity × rate × units, such as 2 cameras × £120 × 5 days.</p>
      <form className="production-form" key={editing?.id ?? `new-line-${category}`} onSubmit={event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const quantity = Number(data.get('quantity'));
        const units = Number(data.get('units'));
        const unitCostPence = asPence(data.get('rate'));
        const actualPence = asPence(data.get('actual'));
        const name = String(data.get('name')).trim();
        const chosen = String(data.get('category')).trim();
        const unitLabel = String(data.get('unitLabel') ?? '').trim();
        if (!name || !chosen || !Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(units) || units < 0 ||
            !Number.isSafeInteger(unitCostPence) || !Number.isSafeInteger(actualPence) ||
            !Number.isSafeInteger(Math.round(quantity * unitCostPence * units))) {
          return setError('Enter an item, category, quantity, units and valid GBP amounts.');
        }
        const line: BudgetLine = {
          id: editing?.id ?? newId(), name, category: chosen, quantity, unitCostPence, actualPence, source: editing?.source ?? source,
          ...(units !== 1 ? { units } : {}), ...(unitLabel ? { unitLabel } : {})
        };
        if (update(current => ({
          ...current,
          budget: editing ? current.budget.map(item => item.id === line.id ? line : item) : [...current.budget, line]
        }), 'Cost saved.')) {
          event.currentTarget.reset(); setEditing(undefined); setCategory(''); setError('');
        }
      }}>
        <label>Category<select name="category" required defaultValue={category}>
          <option value="" disabled>Choose an account</option>
          {BUDGET_GROUPS.map(group => <optgroup key={group.name} label={group.name}>
            {group.categories.map(item => <option key={item.code} value={item.name}>{item.code} · {item.name}</option>)}
          </optgroup>)}
          {category && !budgetCategory(category) && <option value={category}>{category}</option>}
        </select></label>
        <label>Item name<input name="name" required defaultValue={editing?.name} /></label>
        <div className="production-form-row">
          <label>Quantity<input name="quantity" type="number" step="0.01" min="0" defaultValue={editing?.quantity ?? 1} required /></label>
          <label>Rate (£)<input name="rate" type="number" step="0.01" min="0" defaultValue={editing ? editing.unitCostPence / 100 : 0} required /></label>
        </div>
        <div className="production-form-row">
          <label>Units<input name="units" type="number" step="0.5" min="0" defaultValue={editing?.units ?? 1} required /></label>
          <label>Unit<input name="unitLabel" list="production-budget-units" defaultValue={editing?.unitLabel} placeholder="days" />
            <datalist id="production-budget-units"><option value="days" /><option value="weeks" /><option value="flat" /><option value="allow" /></datalist></label>
        </div>
        <label>Actual spend (£)<input name="actual" type="number" step="0.01" min="0" defaultValue={editing ? editing.actualPence / 100 : 0} required /></label>
        {error && <p className="production-form-error" role="alert">{error}</p>}
        <div className="production-actions">
          <button type="submit" className="production-button production-primary">{editing ? 'Save cost line' : 'Add cost line'}</button>
          {editing && <button type="button" className="production-button" onClick={() => {
            if (update(current => ({ ...current, budget: current.budget.filter(line => line.id !== editing.id) }), 'Cost line removed.')) startEdit();
          }}>Remove line</button>}
          {editing && <button type="button" className="production-link" onClick={() => startEdit()}>Cancel</button>}
        </div>
      </form>
    </section>}
  </div>;
}
