import { Download, Printer } from 'lucide-react';
import { useState } from 'react';
import { Dialog, Empty, SourceButton } from './components';
import type { PaneProps } from './components';
import { dayStrips, orderedDays, sidesFor } from './model';

export function Sides({ plan, project, snapshot, source, readOnly, onOpenSource, issueOutput }: PaneProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);
  const scenes = plan.scenes.filter(scene => scene.status === 'active');
  const sides = sidesFor(project, plan, selected);
  const text = [
    project.title, snapshot.label, `Source revision ${source.revisionId}`, '',
    ...sides.flatMap(scene => [`${scene.number}  ${scene.heading}`, ...scene.blocks.filter(block => block.kind !== 'scene').map(block => block.text), ''])
  ].join('\n');
  if (!scenes.length) return <Empty>No active scenes are available for sides.</Empty>;
  return <section className="production-card">
    <div className="production-section-heading">
      <div><h3>Scene sides</h3><p className="production-muted">Choose the scenes for a printable extract of the issued script.</p></div>
      <label className="production-field">Select by shoot day<select value="" onChange={event => setSelected(
        event.target.value ? [...new Set(dayStrips(plan, event.target.value).map(strip => strip.sceneId))] : []
      )}>
        <option value="">Choose a day</option>{orderedDays(plan).map(day => <option key={day.id} value={day.id}>{day.date} · {day.label}</option>)}
      </select></label>
    </div>
    {scenes.map(scene => <div className="production-list-row" key={scene.id}>
      <label className="production-check"><input type="checkbox" checked={selected.includes(scene.id)} onChange={event => setSelected(
        event.target.checked ? [...selected, scene.id] : selected.filter(id => id !== scene.id)
      )} /> <span>{scene.number} · {scene.heading || 'Untitled scene'}</span></label>
      <SourceButton source={scene.source} onOpenSource={onOpenSource} />
    </div>)}
    <div className="production-actions">
      <button type="button" className="production-button production-primary" disabled={!sides.length} onClick={() => setPreview(true)}><Printer size={16} /> Preview sides</button>
      {!readOnly && <button type="button" className="production-button" disabled={!sides.length} onClick={() => issueOutput('sides', 'swdr-scene-sides.txt', text)}><Download size={16} /> Issue sides text</button>}
    </div>
    {preview && <Dialog title="Scene sides" onClose={() => setPreview(false)} print>
      <article className="production-print-document">
        <h2>{project.title}</h2>
        <p>{snapshot.document.title} · {snapshot.label}</p>
        <p className="production-revision-meta">Source revision {source.revisionId}</p>
        {sides.map(scene => <section className="production-side" key={scene.id}>
          <h3>{scene.number} &nbsp; {scene.heading}</h3>
          {scene.blocks.filter(block => block.kind !== 'scene').map(block => <p key={block.id} className={`production-script-${block.kind}`}>{block.text}</p>)}
        </section>)}
      </article>
      <div className="production-actions production-right production-screen-only"><button type="button" className="production-button production-primary" onClick={() => window.print()}><Printer size={16} /> Print sides</button></div>
    </Dialog>}
  </section>;
}
