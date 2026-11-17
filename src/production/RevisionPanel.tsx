import { useState } from 'react';
import { Dialog } from './components';
import type { RevisionPreview } from './model';

export function RevisionPanel({ preview, onApply, onClose, error }: {
  preview: RevisionPreview;
  onApply: (choices: Record<string, string | null>) => void;
  onClose: () => void;
  error?: string;
}) {
  const [choices, setChoices] = useState<Record<string, string | null>>(() => Object.fromEntries(preview.previous.flatMap<[string, string | null]>(match =>
    match.suggested ? [[match.scene.id, match.suggested.id]] : match.scene.status === 'omitted' ? [[match.scene.id, null]] : []
  )));
  const assigned = new Set(Object.values(choices).filter(Boolean));
  const added = preview.incoming.filter(item => !assigned.has(item.id));
  const valid = preview.previous.every(match => Object.hasOwn(choices, match.scene.id));
  return <Dialog title={`Review ${preview.snapshot.label}`} onClose={onClose}>
    <p className="production-muted">Confirm the source for each scene. An omission keeps its historical tags and shots. New scenes start without production links.</p>
    <div className="production-revision-list">
      {preview.previous.map(match => {
        const { scene, suggested } = match;
        const choice = choices[scene.id];
        const state = match.quality === 'review' ? 'Unmatched' : [
          match.moved && 'Moved', match.edited && 'Edited', match.quality === 'unique heading' && 'Heading match',
        ].filter(Boolean).join(' · ') || 'Unchanged';
        return <div key={scene.id} className="production-revision-row">
          <div><strong>{scene.number} · {scene.heading || 'Untitled scene'}</strong><small>{state}</small></div>
          <select aria-label={`Incoming source for scene ${scene.number}`} value={choice === null ? '__omit__' : choice ?? ''} onChange={event => {
            const value = event.target.value;
            setChoices(current => {
              if (value) return { ...current, [scene.id]: value === '__omit__' ? null : value };
              const next = { ...current };
              delete next[scene.id];
              return next;
            });
          }}>
            <option value="">Choose source</option>
            <option value="__omit__">Omitted from this revision</option>
            {preview.incoming.map(target => <option key={target.id} value={target.id} disabled={assigned.has(target.id) && choice !== target.id}>
              {target.number} · {target.heading || 'Untitled scene'}{suggested?.id === target.id ? ' (suggested)' : ''}
            </option>)}
          </select>
        </div>;
      })}
    </div>
    {!!added.length && <div className="production-inset">
      <h3>Added scenes</h3>
      <ul>{added.map(target => <li key={target.id}>{target.number} · {target.heading || 'Untitled scene'}</li>)}</ul>
    </div>}
    {error && <p role="alert" className="production-form-error">{error}</p>}
    <div className="production-actions production-right">
      <button type="button" className="production-button" onClick={onClose}>Cancel</button>
      <button type="button" className="production-button production-primary" disabled={!valid} onClick={() => onApply(choices)}>Apply reviewed revision</button>
    </div>
  </Dialog>;
}
