import { useState } from 'react';
import { LockKeyhole, Printer, X } from 'lucide-react';
import type { Block, DocumentModel, Project, WorkspaceViewProps } from '../model';
import { issueDocument, restoreDocument, snapshotDocument } from '../workspace';
import { lockManuscriptPages } from './layout';
import { pairDialogue, replaceBlock } from './keyboard';

interface ContextProps extends Omit<WorkspaceViewProps, 'onDocumentChange'> {
  active?: Block;
  onClose: () => void;
  onResetHistory: () => void;
  onPrint: () => void;
  onDocumentChange: (update: (document: DocumentModel) => DocumentModel) => void;
  /** Open with this section expanded (e.g. after clicking the title page). */
  section?: 'title';
}

const revisionColors = ['White', 'Blue', 'Pink', 'Yellow', 'Green', 'Goldenrod', 'Buff', 'Salmon', 'Cherry'];

function notesFrom(project: Project): Record<string, string> {
  const notes = project.modules.writingNotes;
  if (!notes || typeof notes !== 'object' || Array.isArray(notes)) return {};
  return Object.fromEntries(Object.entries(notes).filter(([, value]) => typeof value === 'string'));
}

export function WritingContext({
  project, document, active, onProjectChange, onDocumentChange, onClose, onPrint, onResetHistory, onStatus, readOnly, section
}: ContextProps) {
  const [draftName, setDraftName] = useState('');
  const [compareId, setCompareId] = useState('');
  const history = project.snapshots.filter(snapshot => snapshot.document.id === document.id).slice().reverse();
  const compare = history.find(snapshot => snapshot.id === compareId);
  const notes = notesFrom(project);
  const revisionNote = `${document.id}:${document.revisionId}`;

  function capture(kind: 'draft' | 'issued' | 'stash') {
    const label = draftName.trim() || (kind === 'issued' ? 'Issued script' : kind === 'stash' ? 'Stashed draft' : 'Named draft');
    onProjectChange(current => {
      const changed = kind === 'issued'
        ? issueDocument(current, document.id, label).project
        : snapshotDocument(current, document.id, label, kind);
      const head = changed.documents.find(item => item.id === document.id);
      const existing = notesFrom(current);
      const note = existing[revisionNote] ?? existing[document.id];
      if (!head || !note) return changed;
      return {
        ...changed,
        modules: {
          ...changed.modules,
          writingNotes: { ...existing, [revisionNote]: note, [`${head.id}:${head.revisionId}`]: note }
        }
      };
    });
    setDraftName('');
    onResetHistory();
    onStatus(`${label} saved to revision history.`);
  }

  function changeTitle(field: 'title' | 'author' | 'byline' | 'contact' | 'draftDate', value: string) {
    onDocumentChange(current => ({
      ...current, titlePage: { ...(current.titlePage ?? { title: current.title }), [field]: value }
    }));
  }

  return <aside className="swdr-w-drawer swdr-w-context" aria-label="Notes and manuscript settings">
    <header className="swdr-w-drawer-head"><h2>Notes and settings</h2><button className="swdr-w-quiet" aria-label="Close notes" onClick={onClose}><X size={17} /></button></header>
    <section>
      <label className="swdr-w-label">Draft notes
        <textarea rows={3} value={notes[revisionNote] ?? notes[document.id] ?? ''} readOnly={readOnly} placeholder="Notes for this draft"
          onChange={event => {
            const value = event.target.value;
            onProjectChange(current => ({ ...current, modules: { ...current.modules, writingNotes: { ...notesFrom(current), [revisionNote]: value } } }));
          }} />
      </label>
    </section>
    <details open={section === 'title' || undefined}>
      <summary>Page and title</summary>
      <div className="swdr-w-context-content">
        <label className="swdr-w-label">Paper
          <select disabled={readOnly} value={document.paper} onChange={event => {
            const paper = event.target.value === 'a4' ? 'a4' : 'letter';
            onDocumentChange(current => ({ ...current, paper }));
          }}><option value="letter">US Letter</option><option value="a4">A4</option></select>
        </label>
        <label className="swdr-w-check"><input type="checkbox" disabled={readOnly} checked={(document as DocumentModel & { showSceneNumbers?: boolean }).showSceneNumbers !== false}
          onChange={event => {
            const showSceneNumbers = event.target.checked;
            onDocumentChange(current => ({ ...current, showSceneNumbers }));
          }} /> Show scene numbers</label>
        <label className="swdr-w-check"><input type="checkbox" disabled={readOnly} checked={!!document.titlePage} onChange={event => {
          const checked = event.target.checked;
          onDocumentChange(current => ({ ...current, titlePage: checked ? { title: current.title } : undefined }));
        }} /> Include title page</label>
        {document.titlePage && <>
          <label className="swdr-w-label">Script title<input value={document.titlePage.title} readOnly={readOnly} onChange={event => changeTitle('title', event.target.value)} /></label>
          <label className="swdr-w-label">Credit<input value={document.titlePage.byline ?? ''} readOnly={readOnly} placeholder="Written by" onChange={event => changeTitle('byline', event.target.value)} /></label>
          <label className="swdr-w-label">Author<input value={document.titlePage.author ?? ''} readOnly={readOnly} onChange={event => changeTitle('author', event.target.value)} /></label>
          <label className="swdr-w-label">Draft date<input type="date" value={document.titlePage.draftDate ?? ''} readOnly={readOnly} onChange={event => changeTitle('draftDate', event.target.value)} /></label>
          <label className="swdr-w-label">Contact<textarea rows={2} value={document.titlePage.contact ?? ''} readOnly={readOnly} onChange={event => changeTitle('contact', event.target.value)} /></label>
        </>}
        <button type="button" className="swdr-w-button" onClick={onPrint}><Printer size={14} /> Print manuscript</button>
      </div>
    </details>
    {active && <details>
      <summary>Active element</summary>
      <div className="swdr-w-context-content">
        {active.kind === 'scene' && <label className="swdr-w-label">Scene number
          <input value={active.sceneNumber ?? ''} placeholder="Auto" readOnly={readOnly}
            onChange={event => {
              const sceneNumber = event.target.value;
              onDocumentChange(current => replaceBlock(current, active.id, block => ({ ...block, sceneNumber: sceneNumber || undefined })));
            }} />
        </label>}
        {active.kind === 'character' && <button type="button" className="swdr-w-button" disabled={readOnly} onClick={() => {
          if (!pairDialogue(document, active.id)) {
            onStatus('Choose a character cue followed by a second character cue to pair them.');
            return;
          }
          onDocumentChange(current => pairDialogue(current, active.id) ?? current);
        }}>{active.dual ? 'Unpair dual dialogue' : 'Pair next character cue'}</button>}
        {active.kind === 'dialogue' && <label className="swdr-w-label">Alternate dialogue
          <textarea value={active.alternate?.join('\n') ?? ''} rows={4} placeholder="One alternative per line" readOnly={readOnly}
            onChange={event => {
              const alternate = event.target.value.split('\n');
              onDocumentChange(current => replaceBlock(current, active.id, block => ({ ...block, alternate: alternate.some(Boolean) ? alternate : undefined })));
            }} />
        </label>}
        {!['scene', 'character', 'dialogue'].includes(active.kind) && <p>Select a scene heading or dialogue to edit its options.</p>}
      </div>
    </details>}
    <details>
      <summary>Drafts and revisions</summary>
      <div className="swdr-w-context-content">
        <label className="swdr-w-label">Revision colour
          <select disabled={readOnly} value={document.revisionLabel ?? ''} onChange={event => {
            const revisionLabel = event.target.value || undefined;
            onDocumentChange(current => ({ ...current, revisionLabel }));
          }}><option value="">Unmarked draft</option>{revisionColors.map(color => <option key={color}>{color}</option>)}</select>
        </label>
        <button type="button" className="swdr-w-button" disabled={readOnly} onClick={() => {
          onDocumentChange(current => ({ ...current, lockedPages: current.lockedPages?.length ? undefined : lockManuscriptPages(current) }));
        }}><LockKeyhole size={14} /> {document.lockedPages?.length ? 'Unlock page numbers' : 'Lock page numbers'}</button>
        {!readOnly && <>
          <label className="swdr-w-label">Version name<input value={draftName} onChange={event => setDraftName(event.target.value)} placeholder="e.g. Table read draft" /></label>
          <div className="swdr-w-tools"><button className="swdr-w-button" type="button" onClick={() => capture('draft')}>Save draft</button>
            <button className="swdr-w-button" type="button" onClick={() => capture('stash')}>Stash</button>
            <button className="swdr-w-button" type="button" onClick={() => capture('issued')}>Issue script</button></div>
        </>}
        {history.length ? <ol className="swdr-w-versions">{history.map(snapshot => <li key={snapshot.id}>
          <strong>{snapshot.label}</strong>
          <small>{snapshot.kind} · {new Date(snapshot.createdAt).toLocaleDateString('en-GB')}</small>
          <div className="swdr-w-tools">
            <button className="swdr-w-quiet" type="button" aria-pressed={compareId === snapshot.id} onClick={() => setCompareId(id => id === snapshot.id ? '' : snapshot.id)}>Compare</button>
            {!readOnly && <button className="swdr-w-quiet" type="button" onClick={() => {
              onProjectChange(current => {
                const restored = restoreDocument(current, snapshot.id);
                const head = restored.documents.find(item => item.id === document.id);
                const existing = notesFrom(restored);
                const note = existing[`${snapshot.document.id}:${snapshot.document.revisionId}`];
                return head && note !== undefined ? {
                  ...restored, modules: { ...restored.modules, writingNotes: { ...existing, [`${head.id}:${head.revisionId}`]: note } }
                } : restored;
              });
              onResetHistory();
              onStatus(`${snapshot.label} restored as a new draft.`);
            }}>Restore as draft</button>}
          </div>
        </li>)}</ol> : <p>Saved drafts and issued scripts appear here.</p>}
        {compare && <CompareDraft past={compare.document} present={document} />}
      </div>
    </details>
  </aside>;
}

function CompareDraft({ past, present }: { past: DocumentModel; present: DocumentModel }) {
  const earlier = new Map(past.blocks.map(block => [block.id, block]));
  const later = new Map(present.blocks.map(block => [block.id, block]));
  const changed = [...new Set([...earlier.keys(), ...later.keys()])].flatMap(id => {
    const before = earlier.get(id);
    const after = later.get(id);
    return before?.text !== after?.text || before?.kind !== after?.kind ? [{ id, before, after }] : [];
  });
  return <section className="swdr-w-compare" aria-label="Draft comparison">
    <h3>{changed.length} changed {changed.length === 1 ? 'element' : 'elements'}</h3>
    {changed.slice(0, 60).map(change => <div key={change.id}>
      {change.before && <del>{change.before.text || '(empty element)'}</del>}
      {change.after && <ins>{change.after.text || '(empty element)'}</ins>}
    </div>)}
    {changed.length > 60 && <p>Showing the first 60 changes.</p>}
  </section>;
}
