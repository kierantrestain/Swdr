import { ImagePlus } from 'lucide-react';
import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { newId } from '../model';
import type { Asset } from '../model';
import { Empty, SourceButton } from './components';
import type { PaneProps } from './components';
import type { LookbookCard, ProductionShot } from './model';

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function value(data: FormData, name: string): string {
  return String(data.get(name) ?? '').trim();
}

export function Shots({ project, plan, source, update, readOnly, onOpenSource, onProjectChange, onStatus }: PaneProps) {
  const [mode, setMode] = useState<'Shot list' | 'Lookbook'>('Shot list');
  const [sceneId, setSceneId] = useState('');
  const [editing, setEditing] = useState<ProductionShot>();
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const scenes = plan.scenes.filter(scene => scene.status === 'active');
  const scene = plan.scenes.find(item => item.id === sceneId) ?? scenes[0];
  const images = project.assets.filter(asset => IMAGE_TYPES.has(asset.mime) && asset.dataUrl.startsWith(`data:${asset.mime};base64,`));
  const byAsset = new Map(images.map(asset => [asset.id, asset]));

  function importImage(event: ChangeEvent<HTMLInputElement>) {
    const image = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!image || readOnly) return;
    if (!IMAGE_TYPES.has(image.type) || image.size > 4 * 1024 * 1024) {
      setError('Choose a PNG, JPEG, WebP or GIF up to 4 MB.');
      return;
    }
    setUploading(true);
    setError('');
    const reader = new FileReader();
    reader.onerror = () => { setUploading(false); setError('The image could not be read.'); };
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      const asset: Asset = { id: newId(), name: image.name, mime: image.type, dataUrl: reader.result, addedAt: new Date().toISOString() };
      onProjectChange(current => current.id === project.id ? { ...current, assets: [...current.assets, asset] } : current);
      setUploading(false);
      onStatus('Reference image added to the project.');
    };
    reader.readAsDataURL(image);
  }

  function saveShot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scene || scene.status !== 'active') return;
    const form = new FormData(event.currentTarget);
    const id = editing?.id ?? newId();
    const assetId = value(form, 'image');
    const shot: ProductionShot = {
      id, sceneId: scene.id, description: value(form, 'description'), framing: value(form, 'framing'), setup: value(form, 'setup'),
      source: { ...scene.source, shotId: scene.source.shotId ?? id }, assetId: images.some(asset => asset.id === assetId) ? assetId : undefined
    };
    if (!shot.description) return setError('Add a shot description.');
    if (update(current => ({
      ...current,
      shots: editing ? current.shots.map(item => item.id === id ? shot : item) : [...current.shots, shot]
    }), 'Shot saved.')) {
      event.currentTarget.reset();
      setEditing(undefined);
      setError('');
    }
  }

  function addLookbookCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const card: LookbookCard = { id: newId(), title: value(form, 'title'), notes: value(form, 'notes'), assetId: value(form, 'image'), source };
    if (!card.title || !byAsset.has(card.assetId)) return setError('Enter a title and choose a project image.');
    if (update(current => ({ ...current, lookbook: [...current.lookbook, card] }), 'Lookbook image added.')) {
      event.currentTarget.reset();
      setError('');
    }
  }

  return <>
    <div className="production-toolbar">
      <div className="production-actions production-subnav" role="group" aria-label="Shots view">
        {(['Shot list', 'Lookbook'] as const).map(label => <button type="button" className="production-button" aria-pressed={mode === label} key={label} onClick={() => {
          setMode(label); setError(''); setEditing(undefined);
        }}>{label}</button>)}
      </div>
      {!readOnly && <label className="production-button production-upload">
        <ImagePlus size={16} /> {uploading ? 'Adding image…' : 'Add reference image'}
        <input type="file" aria-label="Add reference image" accept="image/png,image/jpeg,image/webp,image/gif" disabled={uploading} onChange={importImage} />
      </label>}
    </div>
    {error && <p className="production-form-error" role="alert">{error}</p>}
    {mode === 'Shot list' && (scene ? <div className="production-two-columns">
      <section className="production-card">
        <label className="production-field">Scene<select value={scene.id} onChange={event => { setSceneId(event.target.value); setEditing(undefined); }}>
          {plan.scenes.map(item => <option key={item.id} value={item.id}>{item.number} · {item.heading || 'Untitled scene'}{item.status === 'omitted' ? ' (omitted)' : ''}</option>)}
        </select></label>
        <h3>Shots and storyboard</h3>
        {!plan.shots.some(shot => shot.sceneId === scene.id) && <p className="production-muted">No shots for this scene.</p>}
        <div className="production-image-grid">
          {plan.shots.filter(shot => shot.sceneId === scene.id).map((shot, index) => {
            const image = shot.assetId ? byAsset.get(shot.assetId) : undefined;
            return <article className="production-inset production-image-card" key={shot.id}>
              {image && <img src={image.dataUrl} alt={image.name} />}
              <h4>{scene.number}{String.fromCharCode(65 + index % 26)}{index >= 26 ? Math.floor(index / 26) : ''} · {shot.description}</h4>
              <p>{[shot.framing, shot.setup].filter(Boolean).join(' · ')}</p>
              <div className="production-actions">
                <SourceButton source={shot.source} onOpenSource={onOpenSource} />
                {!readOnly && scene.status === 'active' && <button type="button" className="production-link" onClick={() => setEditing(shot)}>Edit shot</button>}
              </div>
            </article>;
          })}
        </div>
      </section>
      {!readOnly && scene.status === 'active' && <section className="production-card">
        <h3>{editing ? 'Edit shot' : 'Add shot'}</h3>
        <form className="production-form" key={editing?.id ?? 'new-shot'} onSubmit={saveShot}>
          <label>Description<textarea name="description" rows={3} defaultValue={editing?.description} required /></label>
          <div className="production-form-row">
            <label>Framing<input name="framing" defaultValue={editing?.framing} placeholder="Wide, medium, close-up" /></label>
            <label>Setup<input name="setup" defaultValue={editing?.setup} placeholder="Camera A, handheld" /></label>
          </div>
          <label>Storyboard image<select name="image" defaultValue={editing?.assetId ?? ''}><option value="">None</option>
            {images.map(image => <option value={image.id} key={image.id}>{image.name}</option>)}</select></label>
          <div className="production-actions">
            <button type="submit" className="production-button production-primary">{editing ? 'Save shot' : 'Add shot'}</button>
            {editing && <button type="button" className="production-button" onClick={() => {
              if (update(current => ({ ...current, shots: current.shots.filter(shot => shot.id !== editing.id) }), 'Shot removed.')) setEditing(undefined);
            }}>Remove shot</button>}
          </div>
        </form>
      </section>}
    </div> : <Empty>The released script has no scenes for a shot list.</Empty>)}
    {mode === 'Lookbook' && <div className="production-two-columns">
      <section className="production-card">
        <h3>Lookbook</h3>
        {!plan.lookbook.length && <p className="production-muted">Add image references and notes for the production.</p>}
        <div className="production-image-grid">
          {plan.lookbook.map(card => {
            const image = byAsset.get(card.assetId);
            return <article className="production-inset production-image-card" key={card.id}>
              {image && <img src={image.dataUrl} alt={image.name} />}
              <h4>{card.title}</h4><p>{card.notes}</p>
              <SourceButton source={card.source} onOpenSource={onOpenSource} />
            </article>;
          })}
        </div>
      </section>
      {!readOnly && <form className="production-card production-form" onSubmit={addLookbookCard}>
        <h3>Add lookbook image</h3>
        <label>Title<input name="title" required /></label>
        <label>Reference image<select name="image" required><option value="">Choose an image</option>
          {images.map(image => <option value={image.id} key={image.id}>{image.name}</option>)}
        </select></label>
        <label>Notes<textarea name="notes" rows={3} /></label>
        <div className="production-actions"><button type="submit" className="production-button production-primary">Add to lookbook</button></div>
      </form>}
    </div>}
  </>;
}
