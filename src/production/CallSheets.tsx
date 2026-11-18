import { Check, CloudSun, Download, FileCheck2, Hospital, MapPin, Printer } from 'lucide-react';
import { useState } from 'react';
import { newId } from '../model';
import { Dialog, Empty, SourceButton, displayDate, downloadText } from './components';
import type { PaneProps } from './components';
import { acknowledgeTestDelivery, callSheetCsv, dayStrips, eighthsLabel, issueCallSheet, orderedDays, previewCallSheet, recordTestDelivery, scheduleConflicts } from './model';
import type { CallSheet } from './model';

export function CallSheets({ project, plan, readOnly, update, onOpenSource }: PaneProps) {
  const days = orderedDays(plan);
  const [dayId, setDayId] = useState('');
  const [sheetId, setSheetId] = useState('');
  const [show, setShow] = useState(false);
  const currentDay = days.find(day => day.id === dayId) ?? days[0];
  const issued = [...plan.callSheets].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt) || b.version - a.version);
  const currentSheet = issued.find(item => item.id === sheetId);
  const superseded = currentSheet && issued.some(sheet => sheet.dayId === currentSheet.dayId && sheet.version > currentSheet.version);
  let preview: CallSheet | undefined;
  if (currentDay && dayStrips(plan, currentDay.id).length) {
    preview = previewCallSheet(project, plan, currentDay.id);
  }
  const visible = currentSheet ?? preview;
  const currentStrips = new Set(plan.strips.filter(strip => strip.dayId === currentDay?.id).map(strip => strip.id));
  const blockingConflicts = !currentSheet && show
    ? scheduleConflicts(plan).filter(conflict => conflict.stripIds.some(id => currentStrips.has(id)))
    : [];

  function issue() {
    if (!currentDay || readOnly) return;
    const at = new Date().toISOString();
    const id = newId();
    if (update((current, currentProject) => ({
      ...current,
      callSheets: [...current.callSheets, { ...issueCallSheet(currentProject, current, currentDay.id, at), id }]
    }), 'Call sheet issued.')) {
      setSheetId(id);
    }
  }

  return <>
    {!days.length && !issued.length ? <Empty>Add a shoot day and schedule scenes to prepare a dated call sheet.</Empty> :
      <div className="production-two-columns">
        <section className="production-card">
          <h3>Prepare a call sheet</h3>
          <label className="production-field">Shoot day<select value={currentDay?.id ?? ''} onChange={event => setDayId(event.target.value)}>
            {days.map(day => <option key={day.id} value={day.id}>{day.date} · {plan.units.find(unit => unit.id === day.unitId)?.name} · {day.label}</option>)}
          </select></label>
          {!preview && <p className="production-muted">Schedule at least one scene on this shoot day.</p>}
          {preview && <div className="production-list-row"><div>
            <strong>{preview.label} · V{preview.version}</strong>
            <small>{displayDate(preview.date)} · {preview.scenes.length} {preview.scenes.length === 1 ? 'scene' : 'scenes'} · Crew call {preview.callTime}</small>
          </div>
            <button type="button" className="production-button production-primary" onClick={() => { setSheetId(''); setShow(true); }}>Preview call sheet</button>
          </div>}
        </section>
        <section className="production-card">
          <h3>Issued versions</h3>
          {!issued.length && <p className="production-muted">Issued call sheets and test acknowledgements appear here.</p>}
          {issued.map(sheet => {
            const deliveries = plan.deliveries.filter(item => item.callSheetId === sheet.id);
            const acknowledged = deliveries.filter(item => item.acknowledgedAt).length;
            const previous = issued.some(item => item.dayId === sheet.dayId && item.version > sheet.version);
            return <div className="production-list-row" key={sheet.id}><div>
              <strong>{sheet.label} · V{sheet.version}</strong>
              <small>{sheet.date} · {sheet.unit} · {previous ? 'Superseded' : 'Current'} · {acknowledged}/{deliveries.length} acknowledged</small>
            </div><button type="button" className="production-button" onClick={() => { setSheetId(sheet.id); setShow(true); }}>Open V{sheet.version}</button></div>;
          })}
        </section>
      </div>}
    {show && visible && <Dialog title={currentSheet ? `Issued call sheet V${visible.version}` : `Preview call sheet V${visible.version}`} onClose={() => setShow(false)} print>
      <CallSheetDocument sheet={visible} superseded={Boolean(superseded)} issued={Boolean(currentSheet)} />
      <div className="production-actions production-screen-only">
        <SourceButton source={visible.source} onOpenSource={onOpenSource}>Open issued script</SourceButton>
        <button type="button" className="production-button" onClick={() => window.print()}><Printer size={16} /> Print call sheet</button>
        <button type="button" className="production-button" onClick={() => downloadText(
          `swdr-call-sheet-${visible.date}-v${visible.version}.csv`, callSheetCsv(visible)
        )}><Download size={16} /> Download CSV</button>
        {!currentSheet && !readOnly && <button type="button" className="production-button production-primary" onClick={issue} disabled={blockingConflicts.length > 0}><FileCheck2 size={16} />{visible.version > 1 ? 'Reissue call sheet' : 'Issue call sheet'}</button>}
      </div>
      {blockingConflicts.length > 0 && <section className="production-test-delivery production-screen-only" aria-label="Conflicts preventing issue">
        <h3>Resolve before issue</h3>
        <ul>{blockingConflicts.map((conflict, index) => <li key={index}>{conflict.message}</li>)}</ul>
      </section>}
      {currentSheet && visible.recipients.length > 0 && <section className="production-test-delivery production-screen-only">
        <h3>Test delivery and acknowledgement</h3>
        <p className="production-muted">Test records stay in this project.</p>
        {visible.recipients.map(person => {
          const delivery = plan.deliveries.find(item => item.callSheetId === currentSheet.id && item.personId === person.id);
          return <div className="production-list-row" key={person.id}>
            <div><strong>{person.name}</strong><small>{delivery?.acknowledgedAt ? 'Acknowledged' : delivery ? 'Awaiting acknowledgement' : 'Awaiting test delivery'}</small></div>
            {!readOnly && !superseded && (delivery ?
              !delivery.acknowledgedAt && <button type="button" className="production-button" onClick={() => update(
                current => acknowledgeTestDelivery(current, delivery.id), 'Test acknowledgement recorded.'
              )}><Check size={16} /> Acknowledge test</button> :
              <button type="button" className="production-button" onClick={() => update(
                current => recordTestDelivery(current, currentSheet.id, person.id), 'Test delivery recorded.'
              )}>Send test</button>)}
          </div>;
        })}
      </section>}
    </Dialog>}
  </>;
}

function CallSheetDocument({ sheet, superseded, issued }: { sheet: CallSheet; superseded: boolean; issued: boolean }) {
  // Sheets issued before cast and crew were recorded separately keep one combined personnel list.
  const legacy = sheet.recipients.every(person => !person.type);
  const cast = legacy ? [] : sheet.recipients.filter(person => person.type === 'Cast');
  const crew = sheet.recipients.filter(person => !cast.includes(person));
  const pages = sheet.scenes.reduce((sum, scene) => sum + (scene.eighths ?? 0), 0);
  const hasPages = sheet.scenes.some(scene => scene.eighths !== undefined);
  const details = [
    { icon: CloudSun, label: 'Weather', value: sheet.weather },
    { icon: Hospital, label: 'Nearest hospital', value: sheet.hospital },
    { icon: MapPin, label: 'Parking and basecamp', value: sheet.parking }
  ];
  return <article className="production-print-document production-call-sheet">
    <header className="production-call-sheet-heading">
      <div>
        <p className="production-call-sheet-kicker">Call sheet{sheet.dayNumber ? ` · Day ${sheet.dayNumber}${sheet.dayCount ? ` of ${sheet.dayCount}` : ''}` : ''}</p>
        <h2>{sheet.projectTitle}</h2>
        <p>{sheet.documentTitle} · {sheet.draft}</p>
      </div>
      <div className="production-call-time">
        <small>General crew call</small>
        <strong>{sheet.callTime}</strong>
        <span>{displayDate(sheet.date)}</span>
        <span>{sheet.unit} · V{sheet.version}{superseded && ' · Superseded'}</span>
      </div>
    </header>
    <h3>{sheet.label}</h3>
    {(sheet.weather || sheet.hospital || sheet.parking) && <dl className="production-call-details">
      {details.filter(detail => detail.value).map(({ icon: Icon, label, value }) => <div key={label}>
        <dt><Icon size={14} aria-hidden="true" /> {label}</dt><dd>{value}</dd>
      </div>)}
    </dl>}
    {sheet.notes && <p className="production-pre-line production-call-notes">{sheet.notes}</p>}
    <h3>Scheduled scenes</h3>
    <div className="production-table-scroll"><table className="production-table">
      <thead><tr><th>Time</th><th>Scene</th><th>Set and setting</th>{hasPages && <th>Pages</th>}<th>Cast</th><th>Location</th></tr></thead>
      <tbody>{sheet.scenes.map((scene, index) => <tr key={`${scene.id}-${index}`}>
        <td>{scene.startTime}<small>{scene.minutes} min</small></td>
        <td><strong>{scene.number}</strong></td>
        <td><strong>{scene.heading}</strong>{scene.setting && <small>{scene.setting}</small>}</td>
        {hasPages && <td>{scene.eighths === undefined ? '—' : eighthsLabel(scene.eighths)}</td>}
        <td>{scene.castIds?.length ? scene.castIds.join(', ') : scene.cast.join(', ') || '—'}</td>
        <td>{scene.location?.name ?? '—'}<small>{scene.location?.address}</small></td>
      </tr>)}</tbody>
      {hasPages && <tfoot><tr><td colSpan={3}>{sheet.scenes.length} {sheet.scenes.length === 1 ? 'scene' : 'scenes'}</td><td>{eighthsLabel(pages)}</td><td colSpan={2} /></tr></tfoot>}
    </table></div>
    {cast.length > 0 && <><h3>Cast</h3>
      <div className="production-table-scroll"><table className="production-table">
        <thead><tr><th>ID</th><th>Name</th><th>Character</th><th>Call</th></tr></thead>
        <tbody>{cast.map(person => <tr key={person.id}><td>{person.castId ?? '—'}</td><td>{person.name}</td><td>{person.role}</td><td><strong>{person.callTime}</strong></td></tr>)}</tbody>
      </table></div></>}
    {crew.length > 0 && <><h3>{legacy ? 'Personnel calls' : 'Crew'}</h3>
      <div className="production-table-scroll"><table className="production-table">
        <thead><tr><th>Name</th><th>Role</th><th>Call</th></tr></thead>
        <tbody>{crew.map(person => <tr key={person.id}><td>{person.name}</td><td>{person.role}</td><td>{person.callTime}</td></tr>)}</tbody>
      </table></div></>}
    <p className="production-revision-meta">Source revision {sheet.source.revisionId}{issued && ` · Issued ${sheet.issuedAt}`}</p>
  </article>;
}
