import { Download } from 'lucide-react';
import { useState } from 'react';
import { newId } from '../model';
import { Empty, SourceButton, displayDate, downloadText } from './components';
import type { PaneProps } from './components';
import { budgetCsv, budgetTotals, dayOutOfDays, doodCsv, moneyLabel, productionManifest } from './model';
import type { BudgetLine } from './model';

function asPence(raw: FormDataEntryValue | null): number {
  const value = String(raw ?? '');
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return NaN;
  const [pounds, decimals = ''] = value.split('.');
  return Number(pounds) * 100 + Number(decimals.padEnd(2, '0'));
}

export function Reports({ project, plan, source, update, readOnly, onOpenSource, issueOutput, startAt = 'Day out of days' }: PaneProps & {
  startAt?: 'Day out of days' | 'Budget' | 'Issued exports';
}) {
  const [tab, setTab] = useState(startAt);
  const [editing, setEditing] = useState<BudgetLine>();
  const [error, setError] = useState('');
  const { dates, rows } = dayOutOfDays(plan);
  const totals = budgetTotals(plan);
  return <>
    <div className="production-actions production-subnav" aria-label="Production reports">
      {(['Day out of days', 'Budget', 'Issued exports'] as const).map(name => <button type="button" className="production-button" key={name}
        aria-pressed={tab === name} onClick={() => { setTab(name); setError(''); }}>{name}</button>)}
    </div>
    {tab === 'Day out of days' && <section className="production-card">
      <div className="production-section-heading">
        <h3>Day out of days</h3>
        {!readOnly && dates.length > 0 && rows.length > 0 && <button type="button" className="production-button" onClick={() =>
          issueOutput('dood', 'swdr-day-out-of-days.csv', doodCsv(project, plan))
        }><Download size={16} /> Export day out of days</button>}
      </div>
      {!dates.length || !rows.length ? <Empty>Cast and dated shoot days are needed to calculate the report.</Empty> : <>
        <div className="production-table-scroll"><table className="production-table production-dood">
          <thead><tr><th>Cast</th>{dates.map(date => <th key={date}>{displayDate(date)}</th>)}<th>Worked days</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.person.id}>
            <th scope="row">{row.person.name}</th>{row.codes.map((code, index) => <td key={dates[index]}><span className={code !== '—' ? 'production-code' : ''}>{code}</span></td>)}<td>{row.worked}</td>
          </tr>)}</tbody>
        </table></div>
        <p className="production-muted">SW Start work · W Work · WF Work finish · SWF Start/work/finish · H Paid hold</p>
      </>}
    </section>}
    {tab === 'Budget' && <div className="production-two-columns">
      <section className="production-card">
        <div className="production-section-heading">
          <h3>Budget and cost report</h3>
          {!readOnly && plan.budget.length > 0 && <button type="button" className="production-button" onClick={() =>
            issueOutput('budget', 'swdr-cost-report.csv', budgetCsv(project, plan))
          }><Download size={16} /> Export costs</button>}
        </div>
        <div className="production-metrics">
          <div><small>Planned</small><strong>{moneyLabel(totals.planned)}</strong></div>
          <div><small>Actual</small><strong>{moneyLabel(totals.actual)}</strong></div>
          <div><small>Remaining</small><strong>{moneyLabel(totals.variance)}</strong></div>
        </div>
        {plan.budget.map(line => <div className="production-list-row" key={line.id}>
          <div><strong>{line.name}</strong><small>{line.category} · {line.quantity} × {moneyLabel(line.unitCostPence)} · {moneyLabel(line.actualPence)} actual</small></div>
          <div className="production-actions">
            <SourceButton source={line.source} onOpenSource={onOpenSource} />
            {!readOnly && <button type="button" className="production-link" onClick={() => { setEditing(line); setError(''); }}>Edit</button>}
          </div>
        </div>)}
      </section>
      {!readOnly && <section className="production-card">
        <h3>{editing ? 'Edit cost line' : 'Add cost line'}</h3>
        <form className="production-form" key={editing?.id ?? 'new-line'} onSubmit={event => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const quantity = Number(data.get('quantity'));
          const unitCostPence = asPence(data.get('rate'));
          const actualPence = asPence(data.get('actual'));
          const name = String(data.get('name')).trim();
          const category = String(data.get('category')).trim();
          if (!name || !category || !Number.isFinite(quantity) || quantity < 0 ||
              !Number.isSafeInteger(unitCostPence) || !Number.isSafeInteger(actualPence) ||
              !Number.isSafeInteger(Math.round(quantity * unitCostPence))) {
            return setError('Enter an item, category, quantity and valid GBP amounts.');
          }
          const line: BudgetLine = { id: editing?.id ?? newId(), name, category, quantity, unitCostPence, actualPence, source };
          if (update(current => ({
            ...current,
            budget: editing ? current.budget.map(item => item.id === line.id ? line : item) : [...current.budget, line]
          }), 'Cost saved.')) {
            event.currentTarget.reset(); setEditing(undefined); setError('');
          }
        }}>
          <label>Item name<input name="name" required defaultValue={editing?.name} /></label>
          <label>Category<input name="category" required defaultValue={editing?.category} placeholder="Cast, locations or equipment" /></label>
          <div className="production-form-row">
            <label>Quantity<input name="quantity" type="number" step="0.01" min="0" defaultValue={editing?.quantity ?? 1} required /></label>
            <label>Rate (£)<input name="rate" type="number" step="0.01" min="0" defaultValue={editing ? editing.unitCostPence / 100 : 0} required /></label>
            <label>Actual (£)<input name="actual" type="number" step="0.01" min="0" defaultValue={editing ? editing.actualPence / 100 : 0} required /></label>
          </div>
          {error && <p className="production-form-error" role="alert">{error}</p>}
          <div className="production-actions">
            <button type="submit" className="production-button production-primary">{editing ? 'Save cost line' : 'Add cost line'}</button>
            {editing && <button type="button" className="production-button" onClick={() => {
              if (update(current => ({ ...current, budget: current.budget.filter(line => line.id !== editing.id) }), 'Cost line removed.')) setEditing(undefined);
            }}>Remove line</button>}
          </div>
        </form>
      </section>}
    </div>}
    {tab === 'Issued exports' && <section className="production-card">
      <div className="production-section-heading">
        <h3>Issued exports</h3>
        {!readOnly && <div className="production-actions">
          <button type="button" className="production-button" onClick={() => issueOutput('prep', 'swdr-production-prep.json', productionManifest(project, plan, 'prep'))}>
            <Download size={16} /> Issue prep export</button>
          <button type="button" className="production-button" onClick={() => issueOutput('wrap', 'swdr-production-wrap.json', productionManifest(project, plan, 'wrap'))}>
            <Download size={16} /> Issue wrap export</button>
        </div>}
      </div>
      {!plan.outputs.length && <p className="production-muted">Issued exports are saved as versioned copies of the production data.</p>}
      {[...plan.outputs].reverse().map(output => <div className="production-list-row" key={output.id}>
        <div><strong>{output.filename}</strong><small>{output.issuedAt.slice(0, 10)} · {output.kind}</small></div>
        <div className="production-actions"><SourceButton source={output.source} onOpenSource={onOpenSource} />
          <button type="button" className="production-button" onClick={() => downloadText(output.filename, output.content)}><Download size={16} /> Download</button></div>
      </div>)}
    </section>}
  </>;
}
