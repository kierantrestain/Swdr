import { Badge } from '@astryxdesign/core/Badge';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Download, FileText, ImageIcon, Trash2, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { newId } from '../model';
import type { Asset, WorkspaceViewProps } from '../model';
import { assetUsage, megabytes, sizeOf } from './media';
import './media.css';

const MAX_BYTES = 8 * 1_048_576;
type Filter = 'all' | 'images' | 'documents' | 'unused';

function read(file: File): Promise<Asset> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ id: newId(), name: file.name, mime: file.type || 'application/octet-stream', dataUrl: String(reader.result), addedAt: new Date().toISOString() });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function MediaLibrary({ project, onProjectChange, onStatus, readOnly }: Pick<WorkspaceViewProps, 'project' | 'onProjectChange' | 'onStatus' | 'readOnly'>) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const usage = useMemo(() => assetUsage(project), [project]);
  const total = project.assets.reduce((sum, asset) => sum + sizeOf(asset), 0);
  const needle = query.trim().toLocaleLowerCase('en-GB');
  const shown = project.assets.slice().sort((a, b) => b.addedAt.localeCompare(a.addedAt)).filter(asset => {
    if (needle && !asset.name.toLocaleLowerCase('en-GB').includes(needle)) return false;
    if (filter === 'images') return asset.mime.startsWith('image/');
    if (filter === 'documents') return !asset.mime.startsWith('image/');
    if (filter === 'unused') return !usage.get(asset.id)?.length;
    return true;
  });
  const unused = project.assets.filter(asset => !usage.get(asset.id)?.length).length;

  async function add(files: FileList | File[] | null) {
    const list = [...(files ?? [])];
    if (!list.length || readOnly) return;
    const tooBig = list.filter(file => file.size > MAX_BYTES);
    const assets = await Promise.all(list.filter(file => file.size <= MAX_BYTES).map(read));
    if (assets.length) onProjectChange(current => ({ ...current, assets: [...current.assets, ...assets], updatedAt: new Date().toISOString() }));
    onStatus([assets.length ? `${assets.length} ${assets.length === 1 ? 'file' : 'files'} added.` : '', tooBig.length ? `${tooBig.length} over ${megabytes(MAX_BYTES)} skipped.` : ''].filter(Boolean).join(' '));
  }

  function remove(asset: Asset) {
    const used = usage.get(asset.id) ?? [];
    if (used.length) { onStatus(`“${asset.name}” is used in ${used.join(', ')}. Remove it there first.`); return; }
    if (!window.confirm(`Delete “${asset.name}”? This cannot be undone.`)) return;
    onProjectChange(current => ({ ...current, assets: current.assets.filter(item => item.id !== asset.id), updatedAt: new Date().toISOString() }));
    onStatus(`“${asset.name}” deleted.`);
  }

  return <section className="media" aria-label="Files and media" id="main-content">
    <header className="media-head">
      <div><h1>Files &amp; media</h1>
        <p>{project.assets.length} {project.assets.length === 1 ? 'file' : 'files'} · {megabytes(total)} stored in this browser{unused ? ` · ${unused} not used anywhere` : ''}</p></div>
      {!readOnly && <button type="button" className="media-upload" onClick={() => input.current?.click()}><Upload size={16} aria-hidden="true" /> Add files</button>}
      <input ref={input} type="file" multiple hidden onChange={event => { void add(event.target.files); event.target.value = ''; }} />
    </header>
    <div className="media-tools">
      <div className="media-filter" role="group" aria-label="Show">
        {(['all', 'images', 'documents', 'unused'] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
          {value === 'all' ? 'All' : value === 'images' ? 'Images' : value === 'documents' ? 'Documents' : `Unused (${unused})`}</button>)}
      </div>
      <TextInput label="Search files" isLabelHidden type="search" value={query} onChange={setQuery} placeholder="Search by name" hasClear width={280} />
    </div>
    <div className={`media-drop${dragging ? ' is-over' : ''}`} onDragOver={event => { if (!readOnly) { event.preventDefault(); setDragging(true); } }}
      onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); void add(event.dataTransfer.files); }}>
      {shown.length ? <ul className="media-grid">{shown.map(asset => {
        const used = usage.get(asset.id) ?? [];
        const image = asset.mime.startsWith('image/');
        return <li key={asset.id} className="media-card">
          <span className="media-preview">{image ? <img src={asset.dataUrl} alt="" loading="lazy" /> : <FileText size={34} aria-hidden="true" />}</span>
          <span className="media-info">
            <strong title={asset.name}>{asset.name}</strong>
            <small>{image ? <ImageIcon size={12} aria-hidden="true" /> : <FileText size={12} aria-hidden="true" />} {megabytes(sizeOf(asset))} · {new Date(asset.addedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</small>
            <span className="media-usage">{used.length ? used.map(label => <Badge key={label} variant="neutral" label={label} />) : <Badge variant="warning" label="Unused" />}</span>
          </span>
          <span className="media-actions">
            <a href={asset.dataUrl} download={asset.name} aria-label={`Download ${asset.name}`}><Download size={15} aria-hidden="true" /></a>
            {!readOnly && <button type="button" aria-label={`Delete ${asset.name}`} disabled={used.length > 0} title={used.length ? `Used in ${used.join(', ')}` : 'Delete'} onClick={() => remove(asset)}><Trash2 size={15} aria-hidden="true" /></button>}
          </span>
        </li>;
      })}</ul> : <p className="media-empty">{project.assets.length ? 'No files match.' : 'Cast photos, recce images, storyboards, imported scripts and reference files all collect here. Drop files anywhere in this area to add them.'}</p>}
    </div>
  </section>;
}
