import { Download } from 'lucide-react';
import { useState } from 'react';
import { Empty, SourceButton, displayDate, downloadText } from './components';
import type { PaneProps } from './components';
import { Budget } from './Budget';
import { castNumbers, dayOutOfDays, doodCsv, productionManifest } from './model';

export function Reports({ startAt = 'Day out of days', ...pane }: PaneProps & {
  startAt?: 'Day out of days' | 'Budget' | 'Issued exports';
}) {
  const { project, plan, readOnly, onOpenSource, issueOutput } = pane;
  const [tab, setTab] = useState(startAt);
  const { dates, rows } = dayOutOfDays(plan);
  const castIds = castNumbers(plan);
  return <>
    <div className="production-actions production-subnav" aria-label="Production reports">
      {(['Day out of days', 'Budget', 'Issued exports'] as const).map(name => <button type="button" className="production-button" key={name}
        aria-pressed={tab === name} onClick={() => setTab(name)}>{name}</button>)}
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
          <thead><tr><th>ID</th><th>Cast</th>{dates.map(date => <th key={date}>{displayDate(date)}</th>)}<th>Worked days</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.person.id}>
            <td><span className="production-cast-id">{castIds.get(row.person.id)}</span></td><th scope="row">{row.person.name}</th>{row.codes.map((code, index) => <td key={dates[index]}><span className={code !== '—' ? 'production-code' : ''}>{code}</span></td>)}<td>{row.worked}</td>
          </tr>)}</tbody>
        </table></div>
        <p className="production-muted">SW Start work · W Work · WF Work finish · SWF Start/work/finish · H Paid hold</p>
      </>}
    </section>}
    {tab === 'Budget' && <Budget {...pane} />}
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
