import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { ArrowDown, ArrowUp, BookOpen, ChevronDown, Clock3, Image, Plus, Printer, Trash2 } from 'lucide-react';
import { newId } from '../model';
import type { Asset, AVRow, SourceRef, WorkspaceViewProps } from '../model';
import { timedRows, timingLabel } from './av-timing';
import { useScriptPrint } from './print';
import { PageHeader } from '../shell/PageHeader';
import { isStoryProject, storyWorkspaceTitle } from '../story/story-profile';
import { StoryDrawer } from './StoryDrawer';

interface AVProps extends WorkspaceViewProps {
  target?: SourceRef;
  toolbarEnd?: ReactNode;
  saveLabel?: string;
  onOpenSeries?: (characterId?: string) => void;
}

const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);

function inlineImage(asset?: Asset): string | undefined {
  if (!asset || !imageTypes.has(asset.mime) || !asset.dataUrl.startsWith(`data:${asset.mime};base64,`)) return undefined;
  return asset.dataUrl;
}

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Image could not be read.')));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Image could not be read.')));
    reader.readAsDataURL(file);
  });
}

export function AVView({ document, project, onStatus, onDocumentChange, onProjectChange, onOpenSource, onOpenSeries, readOnly, toolbarEnd, saveLabel, target }: AVProps) {
  const [storyboard, setStoryboard] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);
  const [rowActions, setRowActions] = useState('');
  const timing = timedRows(document.avRows);
  const print = useScriptPrint(document);

  function editRow(id: string, patch: Partial<AVRow>) {
    if (readOnly) return;
    onDocumentChange(current => ({ ...current, avRows: current.avRows.map(row => row.id === id ? { ...row, ...patch } : row) }));
  }

  function reorder(id: string, offset: -1 | 1) {
    if (readOnly) return;
    onDocumentChange(current => {
      const at = current.avRows.findIndex(row => row.id === id);
      const target = at + offset;
      if (at < 0 || target < 0 || target >= current.avRows.length) return current;
      const rows = current.avRows.slice();
      [rows[at], rows[target]] = [rows[target], rows[at]];
      return { ...current, avRows: rows };
    });
  }

  function addRow() {
    if (readOnly) return;
    const row: AVRow = { id: newId(), video: '', audio: '', durationSeconds: 0 };
    onDocumentChange(current => ({ ...current, avRows: [...current.avRows, row] }));
    setRowActions(row.id);
  }

  async function addImage(id: string, event: ChangeEvent<HTMLInputElement>) {
    if (readOnly) return;
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!imageTypes.has(file.type) || file.size > 4 * 1024 * 1024) {
      onStatus('Choose a PNG, JPEG, WebP, GIF or AVIF up to 4 MB.');
      return;
    }
    try {
      const asset: Asset = { id: newId(), name: file.name, mime: file.type, dataUrl: await readImage(file), addedAt: new Date().toISOString() };
      onProjectChange(current => {
        const target = current.documents.find(item => item.id === document.id);
        if (!target?.avRows.some(row => row.id === id)) return current;
        return {
          ...current, assets: [...current.assets, asset], documents: current.documents.map(item => item.id === document.id ? {
            ...item, avRows: item.avRows.map(row => row.id === id ? { ...row, storyboardAssetId: asset.id } : row)
          } : item)
        };
      });
    } catch (error) {
      onStatus(error instanceof Error ? error.message : 'Image could not be attached.');
    }
  }

  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!target?.shotId || target.revisionId !== document.revisionId) return;
    const cue = section.current?.querySelector<HTMLElement>(`[data-cue-id="${CSS.escape(target.shotId)}"]`);
    cue?.scrollIntoView({ block: 'center' });
  }, [target, document.revisionId]);

  return <section ref={section} className="swdr-w-page swdr-av" aria-label="AV script editor">
    <PageHeader className="swdr-w-pagehead" title="AV script" subtitle={`${document.title}${document.revisionLabel ? ` · ${document.revisionLabel}` : ''}`}
      actions={<div className="swdr-w-tools">
        {saveLabel && <span className="swdr-av-save">{saveLabel}</span>}
        {isStoryProject(project) && (
          <button type="button" className={`swdr-w-button ${storyOpen ? 'swdr-w-current' : ''}`} aria-pressed={storyOpen} onClick={() => setStoryOpen(value => !value)}>
            <BookOpen size={15} aria-hidden="true" /> {storyWorkspaceTitle(project.kind)}
          </button>
        )}
        <button type="button" className={`swdr-w-button ${storyboard ? 'swdr-w-current' : ''}`} aria-pressed={storyboard} onClick={() => setStoryboard(value => !value)}><Image size={16} aria-hidden="true" /> Storyboard</button>
        {toolbarEnd || <button type="button" className="swdr-w-button" onClick={print.requestPrint}><Printer size={15} aria-hidden="true" /> Print</button>}
      </div>} />
    <div className={`swdr-av-table ${storyboard ? 'swdr-av-with-images' : ''}`} role="table" aria-label="Timed cues">
      <div className="swdr-av-tablehead" role="row">
        <span role="columnheader">Timecode</span><span role="columnheader">Video</span><span role="columnheader">Audio</span>{storyboard && <span role="columnheader">Storyboard</span>}
      </div>
      {timing.rows.map((row, index) => {
        const image = inlineImage(project.assets.find(asset => asset.id === row.storyboardAssetId));
        const open = rowActions === row.id;
        return <div className="swdr-av-cue" key={row.id} data-cue-id={row.id} data-source-active={target?.shotId === row.id || undefined}>
          <div className="swdr-av-row" role="row">
            <div role="cell" className="swdr-av-time">
              {readOnly ? <span>{timingLabel(row.startSeconds)}–{timingLabel(row.endSeconds)}</span> : <button type="button" className="swdr-av-timebutton"
                onClick={() => setRowActions(open ? '' : row.id)} aria-expanded={open} aria-label={`Edit timing for cue ${index + 1}`}>
                <span>{timingLabel(row.startSeconds)}–{timingLabel(row.endSeconds)}</span><ChevronDown size={13} aria-hidden="true" />
              </button>}
              {row.overlap && <small className="swdr-av-overlap">Overlaps prior cues</small>}
            </div>
            <div role="cell" className="swdr-av-description">
              <label><span>Video</span>
                <textarea aria-label={`Cue ${index + 1} video`} value={row.video} readOnly={readOnly} placeholder="What we see" rows={Math.max(2, Math.min(9, row.video.split('\n').length))}
                  onChange={event => editRow(row.id, { video: event.target.value })} /></label>
            </div>
            <div role="cell" className="swdr-av-description">
              <label><span>Audio</span>
                <textarea aria-label={`Cue ${index + 1} audio`} value={row.audio} readOnly={readOnly} placeholder="What we hear" rows={Math.max(2, Math.min(9, row.audio.split('\n').length))}
                  onChange={event => editRow(row.id, { audio: event.target.value })} /></label>
            </div>
            {storyboard && <div role="cell" className="swdr-av-image">
              {image && <img src={image} alt={project.assets.find(asset => asset.id === row.storyboardAssetId)?.name || 'Cue storyboard'} />}
              {readOnly ? (image ? null : <small>No image attached</small>) : <>
                <label className="swdr-av-upload swdr-w-button">
                  <Image size={14} aria-hidden="true" /> {image ? 'Replace image' : 'Add image'}
                  <input type="file" className="swdr-sr" aria-label={`Upload storyboard for cue ${index + 1}`}
                    accept="image/png,image/jpeg,image/webp,image/gif,image/avif" onChange={event => { void addImage(row.id, event); }} />
                </label>
                {image && <button type="button" className="swdr-w-quiet" onClick={() => editRow(row.id, { storyboardAssetId: undefined })}>Remove</button>}
              </>}
            </div>}
          </div>
          {open && !readOnly && <div role="row" className="swdr-av-controls"><div role="cell">
            <label className="swdr-w-label">Duration (seconds)<input type="number" min="0" max="86400" step="any" value={row.durationSeconds}
              onChange={event => editRow(row.id, { durationSeconds: Math.max(0, Math.min(86400, event.target.valueAsNumber || 0)) })} /></label>
            <label className="swdr-w-label">Start override (seconds)<input type="number" min="0" max="86400" step="any" placeholder="Automatic" value={row.cueSeconds ?? ''}
              onChange={event => {
                const cueSeconds = Number.isFinite(event.target.valueAsNumber) ? Math.max(0, Math.min(86400, event.target.valueAsNumber)) : undefined;
                editRow(row.id, { cueSeconds });
              }} /></label>
            <div className="swdr-w-tools">
              <button type="button" className="swdr-w-quiet" disabled={index === 0} onClick={() => reorder(row.id, -1)} aria-label="Move cue up" title="Move cue up"><ArrowUp size={15} /></button>
              <button type="button" className="swdr-w-quiet" disabled={index + 1 === timing.rows.length} onClick={() => reorder(row.id, 1)} aria-label="Move cue down" title="Move cue down"><ArrowDown size={15} /></button>
              <button type="button" className="swdr-w-quiet" title="Delete cue" onClick={() => {
                onDocumentChange(current => ({ ...current, avRows: current.avRows.filter(item => item.id !== row.id) }));
                setRowActions('');
              }}><Trash2 size={15} /> Delete cue</button>
            </div>
          </div></div>}
        </div>;
      })}
      {!timing.rows.length && <div className="swdr-w-empty">No cues yet.</div>}
    </div>
    <footer className="swdr-av-footer">
      <div><span>{timing.rows.length} {timing.rows.length === 1 ? 'cue' : 'cues'}</span>
        {!readOnly && <button type="button" className="swdr-w-button" onClick={addRow}><Plus size={16} aria-hidden="true" /> Add cue</button>}
      </div>
      <strong><Clock3 size={16} aria-hidden="true" /> Runtime {timingLabel(timing.durationSeconds)}</strong>
    </footer>
    {print.output}
    {storyOpen && isStoryProject(project) && (
      <StoryDrawer
        project={project}
        document={document}
        docked
        onOpenSource={onOpenSource}
        onOpenSeries={onOpenSeries}
        onClose={() => setStoryOpen(false)}
      />
    )}
  </section>;
}
