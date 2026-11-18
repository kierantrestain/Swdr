import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { newId } from '../model';
import { Dialog, Empty, SourceButton, displayDate } from './components';
import type { PaneProps } from './components';
import { CATALOGUE_CATEGORIES, castNumbers, eighthsLabel, estimateEighths, orderedDays, scriptTargets, settingLabel } from './model';
import type { BreakdownTag, CatalogueCategory, CatalogueItem, ProductionScene } from './model';
import { Locations } from './Locations';
import { People } from './People';
import { ScriptChangeBadge, ScriptChangeBanner, ScriptChangeDialog } from './ScriptChanges';

type Section = 'Scene tags' | 'Catalogue' | 'Cast & crew' | 'Locations';

function field(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim();
}

export function CategoryChip({ category }: { category: CatalogueCategory | string }) {
  return <span className={`production-category production-cat-${category.toLowerCase().replace(/[^a-z]+/g, '-')}`}>{category}</span>;
}

function itemLabel(item: CatalogueItem | undefined, ids: Map<string, number>): string {
  if (!item) return 'Unknown item';
  const id = item.category === 'Cast' && item.personId ? ids.get(item.personId) : undefined;
  return id ? `${id}. ${item.name}` : item.name;
}

export function Breakdown(pane: PaneProps) {
  const { plan, project, snapshot, source, readOnly, update, onOpenSource, changes, reviewScript, syncScript } = pane;
  const [section, setSection] = useState<Section>('Scene tags');
  const [sceneId, setSceneId] = useState('');
  const [reviewing, setReviewing] = useState<BreakdownTag>();
  const [error, setError] = useState('');
  const [changeFocus, setChangeFocus] = useState<string>();
  const castIds = castNumbers(plan);
  const scene = plan.scenes.find(item => item.id === sceneId) ?? plan.scenes.find(item => item.status === 'active');
  const target = scriptTargets(project, snapshot.document).find(item => item.id === (scene?.source.sceneId ?? scene?.source.shotId));
  const tagBlocks = target?.source.sceneId ? target.blocks.filter(block => block.text.trim() && block.kind !== 'note') : [];
  const change = scene && changes.find(item => item.sceneId === scene.id);
  const sceneTags = scene ? plan.tags.filter(tag => tag.sceneId === scene.id) : [];
  const categoryOf = (tag: BreakdownTag) => plan.catalogue.find(entry => entry.id === tag.itemId)?.category ?? 'Other';
  const days = orderedDays(plan);
  const placements = scene ? plan.strips.filter(strip => strip.sceneId === scene.id).flatMap(strip => {
    const index = days.findIndex(day => day.id === strip.dayId);
    return index < 0 ? [] : [`Day ${index + 1} · ${displayDate(days[index].date)}`];
  }) : [];

  function attachTag(event: FormEvent<HTMLFormElement>, activeScene: ProductionScene, editing?: BreakdownTag) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const blockId = field(form, 'block');
    const itemId = editing?.itemId ?? field(form, 'item');
    if (activeScene.status !== 'active' || !plan.catalogue.some(item => item.id === itemId)) return setError('Choose an active scene and a catalogue item.');
    if (blockId && !tagBlocks.some(block => block.id === blockId)) return setError('Choose a block from the current source scene.');
    const tag: BreakdownTag = {
      id: editing?.id ?? newId(), sceneId: activeScene.id, itemId, notes: field(form, 'notes'),
      source: blockId ? { ...activeScene.source, blockId } : activeScene.source, reviewed: true
    };
    if (update(current => ({
      ...current,
      tags: editing ? current.tags.map(item => item.id === tag.id ? tag : item) : [...current.tags, tag]
    }), editing ? 'Tag re-linked to the active revision.' : 'Tag added.')) {
      event.currentTarget.reset();
      setReviewing(undefined);
      setError('');
    }
  }

  return <>
    <div className="production-subnav-bar">
      <div className="production-actions production-subnav" aria-label="Breakdown areas">
        {(['Scene tags', 'Catalogue', 'Cast & crew', 'Locations'] as const).map(label => <button
          type="button" className="production-button" key={label} aria-pressed={section === label}
          onClick={() => { setSection(label); setError(''); }}
        >{label}{label === 'Cast & crew' ? <span className="production-count">{plan.people.length}</span> : label === 'Locations' ? <span className="production-count">{plan.locations.length}</span> : null}</button>)}
      </div>
      {!readOnly && syncScript && <button type="button" className="production-button" onClick={syncScript}
        title={plan.breakdownSyncedAt ? `Last built ${plan.breakdownSyncedAt.slice(0, 16).replace('T', ' ')}` : undefined}>
        <RefreshCw size={16} aria-hidden="true" /> {plan.breakdownSyncedAt ? 'Sync from script' : 'Build breakdown from script'}</button>}
    </div>
    {section === 'Scene tags' && <>
      <ScriptChangeBanner changes={changes} release={snapshot.label} onOpen={() => setChangeFocus('')} />
      {changeFocus !== undefined && <ScriptChangeDialog plan={plan} changes={changes} focus={changeFocus || undefined} release={snapshot.label}
        onClose={() => setChangeFocus(undefined)} onReview={reviewScript} />}
      {!scene && <Empty>The released script has no scenes available for breakdown.</Empty>}
      {scene && <div className="production-two-columns">
        <div className="production-card">
          <label className="production-field">Scene<select value={scene.id} onChange={event => { setSceneId(event.target.value); setError(''); }}>
            {plan.scenes.map(item => <option key={item.id} value={item.id}>{item.number} · {item.heading || 'Untitled scene'}{item.status === 'omitted' ? ' (omitted)' : ''}</option>)}
          </select></label>
          <div className="production-section-heading"><h3>{scene.heading || 'Untitled scene'}</h3><SourceButton source={scene.source} onOpenSource={onOpenSource} /></div>
          <p className="production-scene-meta">
            {[settingLabel(scene.heading), target && `Est. ${eighthsLabel(estimateEighths(target.blocks))} pages`, placements.length ? placements.join(', ') : 'Not scheduled']
              .filter(Boolean).join(' · ')}
            {change && <ScriptChangeBadge change={change} onOpen={() => setChangeFocus(change.sceneId)} />}
          </p>
          <div className="production-passage" aria-label="Released script excerpt">
            {target?.blocks.filter(block => block.kind !== 'note' && block.kind !== 'scene').map(block => <p key={block.id} className={`production-script-${block.kind}`}>{block.text}</p>)}
            {scene.status === 'omitted' && <p>Omitted from the active release. Open Source to read the original snapshot.</p>}
          </div>
        </div>
        <section className="production-card">
          <div className="production-section-heading"><h3>Breakdown sheet</h3>
            <span className="production-muted">{sceneTags.length} {sceneTags.length === 1 ? 'element' : 'elements'}</span></div>
          {!sceneTags.length && <p className="production-muted">No tags on this scene.</p>}
          {CATALOGUE_CATEGORIES.filter(category => sceneTags.some(tag => categoryOf(tag) === category)).map(category => <div className="production-breakdown-group" key={category}>
            <h4><CategoryChip category={category} /></h4>
          {sceneTags.filter(tag => categoryOf(tag) === category).map(tag => {
            const item = plan.catalogue.find(entry => entry.id === tag.itemId);
            return <div className="production-list-row" key={tag.id}><div>
              <strong>{itemLabel(item, castIds)}</strong>
              {(tag.notes || tag.reviewed === false) && <small>{tag.notes}{tag.notes && tag.reviewed === false && ' · '}{tag.reviewed === false && 'Source review required'}</small>}
            </div><div className="production-actions">
              <SourceButton source={tag.source} onOpenSource={onOpenSource} />
              {!readOnly && scene.status === 'active' && tag.reviewed === false && <button type="button" className="production-link" onClick={() => {
                setError(''); setReviewing(tag);
              }}>Re-link</button>}
              {!readOnly && <button type="button" className="production-link" onClick={() => update(current => ({
                ...current, tags: current.tags.filter(item => item.id !== tag.id)
              }), 'Tag removed.')} aria-label={`Remove ${item?.name ?? 'breakdown'} tag`}>Remove</button>}
            </div></div>;
          })}
          </div>)}
          {!readOnly && scene.status === 'active' && (plan.catalogue.length ? <form className="production-form" onSubmit={event => attachTag(event, scene)}>
            <label>Catalogue item<select name="item" required>{plan.catalogue.map(item => <option key={item.id} value={item.id}>{itemLabel(item, castIds)} · {item.category}</option>)}</select></label>
            <label>Source line<select name="block"><option value="">Whole scene</option>{tagBlocks.map(block => <option key={block.id} value={block.id}>{block.text.slice(0, 120)}</option>)}</select></label>
            <label>Notes<input name="notes" /></label>
            {error && <p className="production-form-error" role="alert">{error}</p>}
            <div className="production-actions"><button type="submit" className="production-button production-primary">Add breakdown tag</button></div>
          </form> : <p><button type="button" className="production-link" onClick={() => setSection('Catalogue')}>Add a catalogue item</button> to tag this scene.</p>)}
        </section>
        {reviewing && <Dialog title="Review breakdown tag" onClose={() => setReviewing(undefined)}>
          <form className="production-form" onSubmit={event => attachTag(event, scene, reviewing)}>
            <label>Source line<select name="block"><option value="">Whole scene</option>{tagBlocks.map(block => <option key={block.id} value={block.id}>{block.text.slice(0, 120)}</option>)}</select></label>
            <label>Notes<input name="notes" defaultValue={reviewing.notes} /></label>
            {error && <p className="production-form-error" role="alert">{error}</p>}
            <div className="production-actions production-right"><button type="submit" className="production-button production-primary">Confirm source</button></div>
          </form>
        </Dialog>}
      </div>}
    </>}
    {section === 'Catalogue' && <div className="production-two-columns">
      <section className="production-card">
        <h3>Catalogue</h3>
        {!plan.catalogue.length && <p className="production-muted">Add an item to tag it in the released script.</p>}
        {plan.catalogue.map(item => <div className="production-list-row" key={item.id}>
          <div><strong>{itemLabel(item, castIds)}</strong><small><CategoryChip category={item.category} />{item.notes && ` ${item.notes}`}</small></div>
          <SourceButton source={item.source} onOpenSource={onOpenSource} />
        </div>)}
      </section>
      {!readOnly && <section className="production-card">
        <h3>Add catalogue item</h3>
        <form className="production-form" onSubmit={event => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const name = field(form, 'name');
          const category = field(form, 'category') as CatalogueCategory;
          const personId = field(form, 'person');
          if (!name || !CATALOGUE_CATEGORIES.includes(category)) return setError('Enter a name and category.');
          if (category === 'Cast' && !plan.people.some(person => person.id === personId && person.type === 'Cast')) {
            return setError('Add a cast member under Cast & crew, then link that person here.');
          }
          const item = { id: newId(), name, category, personId: category === 'Cast' ? personId : undefined, notes: field(form, 'notes'), source };
          if (update(current => ({ ...current, catalogue: [...current.catalogue, item] }), 'Catalogue item added.')) {
            event.currentTarget.reset(); setError('');
          }
        }}>
          <label>Item name<input name="name" required /></label>
          <div className="production-form-row">
            <label>Category<select name="category">{CATALOGUE_CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label>
            <label>Cast member<select name="person"><option value="">None</option>{plan.people.filter(person => person.type === 'Cast').map(person => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label>
          </div>
          <label>Notes<textarea name="notes" rows={2} /></label>
          {error && <p className="production-form-error" role="alert">{error}</p>}
          <div className="production-actions"><button type="submit" className="production-button production-primary">Add catalogue item</button></div>
        </form>
      </section>}
    </div>}
    {section === 'Cast & crew' && <People {...pane} />}
    {section === 'Locations' && <Locations {...pane} />}
  </>;
}
