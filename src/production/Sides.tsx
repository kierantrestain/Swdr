import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@astryxdesign/core/Table';
import { Download, Printer } from 'lucide-react';
import { useState } from 'react';
import { Dialog, Empty, SourceButton, displayDate } from './components';
import type { PaneProps } from './components';
import { castByScene, sceneEighthsMap } from './insights';
import { PersonAvatar } from './media';
import { castNumbers, dayStrips, eighthsLabel, orderedDays, settingLabel, sidesFor } from './model';
import type { Block } from '../model';

function SidesPages({ scenes }: { scenes: Array<{ id: string; number: string; heading: string; blocks: Block[] }> }) {
  return <>{scenes.map(scene => <section className="production-side" key={scene.id}>
    <h3>{scene.number} &nbsp; {scene.heading}</h3>
    {scene.blocks.filter(block => block.kind !== 'scene').map(block => <p key={block.id} className={`production-script-${block.kind}`}>{block.text}</p>)}
  </section>)}</>;
}

export function Sides({ plan, project, snapshot, source, readOnly, onOpenSource, issueOutput }: PaneProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [dayId, setDayId] = useState('');
  const [preview, setPreview] = useState(false);
  const scenes = plan.scenes.filter(scene => scene.status === 'active');
  const eighths = sceneEighthsMap(project, plan, snapshot);
  const cast = castByScene(plan);
  const ids = castNumbers(plan);
  const days = orderedDays(plan);
  const dayOf = new Map(plan.strips.map(strip => [strip.sceneId, days.findIndex(day => day.id === strip.dayId) + 1]));
  const sides = sidesFor(project, plan, selected);
  const pages = sides.reduce((sum, scene) => sum + (eighths.get(scene.id) ?? 0), 0);
  const selectedCast = [...new Map(sides.flatMap(scene => cast.get(scene.id) ?? []).map(person => [person.id, person])).values()]
    .sort((a, b) => (ids.get(a.id) ?? 0) - (ids.get(b.id) ?? 0));
  const text = [
    project.title, snapshot.label, `Source revision ${source.revisionId}`, '',
    ...sides.flatMap(scene => [`${scene.number}  ${scene.heading}`, ...scene.blocks.filter(block => block.kind !== 'scene').map(block => block.text), ''])
  ].join('\n');
  if (!scenes.length) return <Empty>No active scenes are available for sides.</Empty>;
  const toggle = (id: string, on: boolean) => { setDayId(''); setSelected(on ? [...selected, id] : selected.filter(item => item !== id)); };
  const allOn = selected.length === scenes.length;

  return <div className="production-sides">
    <section className="production-card">
      <div className="production-section-heading">
        <div><h3>Scene sides</h3><p className="production-muted">Choose scenes, or a shoot day, for a printable extract of the issued script.</p></div>
        <label className="production-field">Select by shoot day<select value={dayId} onChange={event => {
          setDayId(event.target.value);
          setSelected(event.target.value ? [...new Set(dayStrips(plan, event.target.value).map(strip => strip.sceneId))] : []);
        }}>
          <option value="">Choose a day</option>{days.map((day, index) => <option key={day.id} value={day.id}>Day {index + 1} · {displayDate(day.date)} · {day.label}</option>)}
        </select></label>
      </div>
      <div className="production-sides-summary" aria-live="polite">
        <strong>{sides.length} of {scenes.length} scenes</strong><span>{eighthsLabel(pages)} pages</span>
        <span>{selectedCast.length ? `Cast ${selectedCast.map(person => ids.get(person.id)).join(', ')}` : 'No cast selected'}</span>
        <button type="button" className="production-link" onClick={() => { setDayId(''); setSelected(allOn ? [] : scenes.map(scene => scene.id)); }}>{allOn ? 'Clear selection' : 'Select all'}</button>
      </div>
      <div className="production-table-scroll production-sides-table"><Table className="production-grid-table" density="compact" hasHover>
        <TableHeader><TableRow isHeaderRow>
          <TableHeaderCell>Include</TableHeaderCell><TableHeaderCell>Sc.</TableHeaderCell><TableHeaderCell>Scene heading</TableHeaderCell>
          <TableHeaderCell>Pages</TableHeaderCell><TableHeaderCell>Cast</TableHeaderCell><TableHeaderCell>Day</TableHeaderCell>
        </TableRow></TableHeader>
        <TableBody>{scenes.map(scene => {
          const people = cast.get(scene.id) ?? [];
          return <TableRow key={scene.id}>
            <TableCell><input type="checkbox" className="production-checkbox" checked={selected.includes(scene.id)}
              aria-label={`${scene.number} · ${scene.heading || 'Untitled scene'}`} onChange={event => toggle(scene.id, event.target.checked)} /></TableCell>
            <TableCell><strong>{scene.number}</strong></TableCell>
            <TableCell><span className="production-stack"><SourceButton source={scene.source} onOpenSource={onOpenSource}>{scene.heading || 'Untitled scene'}</SourceButton>
              <small>{settingLabel(scene.heading)}</small></span></TableCell>
            <TableCell>{eighthsLabel(eighths.get(scene.id) ?? 0)}</TableCell>
            <TableCell>{people.length ? <span className="production-face-row" title={people.map(person => `${ids.get(person.id)} ${person.name}`).join(', ')}>
              {people.slice(0, 4).map(person => <PersonAvatar key={person.id} project={project} person={person} size={24} decorative />)}
              <span>{people.map(person => ids.get(person.id)).join(', ')}</span></span> : <span className="production-muted">—</span>}</TableCell>
            <TableCell>{dayOf.get(scene.id) ? `Day ${dayOf.get(scene.id)}` : <span className="production-muted">—</span>}</TableCell>
          </TableRow>;
        })}</TableBody>
      </Table></div>
    </section>
    <aside className="production-card production-sides-preview" aria-label="Sides preview">
      <div className="production-section-heading"><h3>Preview</h3>
        <div className="production-actions">
          <button type="button" className="production-button production-primary" disabled={!sides.length} onClick={() => setPreview(true)}><Printer size={16} /> Preview sides</button>
          {!readOnly && <button type="button" className="production-button" disabled={!sides.length} onClick={() => issueOutput('sides', 'swdr-scene-sides.txt', text)}><Download size={16} /> Issue sides text</button>}
        </div>
      </div>
      {selectedCast.length > 0 && <ul className="production-sides-cast" aria-label="Cast in these sides">{selectedCast.map(person => <li key={person.id}>
        <PersonAvatar project={project} person={person} size={32} decorative /><span><strong>{ids.get(person.id)}. {person.name}</strong>{person.role && <small>{person.role}</small>}</span>
      </li>)}</ul>}
      {sides.length ? <article className="production-sides-sheet production-print-document"><SidesPages scenes={sides} /></article>
        : <p className="production-muted">Selected scenes appear here as they will print.</p>}
    </aside>
    {preview && <Dialog title="Scene sides" onClose={() => setPreview(false)} print>
      <article className="production-print-document">
        <h2>{project.title}</h2>
        <p>{snapshot.document.title} · {snapshot.label} · {sides.length} {sides.length === 1 ? 'scene' : 'scenes'} · {eighthsLabel(pages)} pages</p>
        <p className="production-revision-meta">Source revision {source.revisionId}</p>
        <SidesPages scenes={sides} />
      </article>
      <div className="production-actions production-right production-screen-only"><button type="button" className="production-button production-primary" onClick={() => window.print()}><Printer size={16} /> Print sides</button></div>
    </Dialog>}
  </div>;
}
