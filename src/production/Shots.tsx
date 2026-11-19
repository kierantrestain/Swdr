import { AspectRatio } from '@astryxdesign/core/AspectRatio';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { FileInput } from '@astryxdesign/core/FileInput';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Link } from '@astryxdesign/core/Link';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { newId } from '../model';
import type { Asset } from '../model';
import { Choice, Empty, FormError, Pane, SourceButton, Split } from './components';
import type { PaneProps } from './components';
import type { LookbookCard, ProductionShot } from './model';

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

interface ShotDraft { description: string; framing: string; setup: string; assetId: string }
const EMPTY_SHOT: ShotDraft = { description: '', framing: '', setup: '', assetId: '' };

/** A reference picture inside a card: the image fills a fixed frame so cards line up in the grid. */
function Picture({ asset }: { asset?: Asset }) {
  return asset ? <AspectRatio ratio={16 / 9}>
    <img src={asset.dataUrl} alt={asset.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-element)' }} />
  </AspectRatio> : null;
}

export function Shots({ project, plan, source, update, readOnly, onOpenSource, onProjectChange, onStatus }: PaneProps) {
  const [mode, setMode] = useState<'Shot list' | 'Lookbook'>('Shot list');
  const [sceneId, setSceneId] = useState('');
  const [editing, setEditing] = useState<ProductionShot>();
  const [draft, setDraft] = useState<ShotDraft>(EMPTY_SHOT);
  const [look, setLook] = useState({ title: '', notes: '', assetId: '' });
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const scenes = plan.scenes.filter(scene => scene.status === 'active');
  const scene = plan.scenes.find(item => item.id === sceneId) ?? scenes[0];
  const images = project.assets.filter(asset => IMAGE_TYPES.has(asset.mime) && asset.dataUrl.startsWith(`data:${asset.mime};base64,`));
  const byAsset = new Map(images.map(asset => [asset.id, asset]));
  const imageOptions = images.map(image => ({ value: image.id, label: image.name }));
  const edit = (shot?: ProductionShot) => {
    setEditing(shot);
    setDraft(shot ? { description: shot.description, framing: shot.framing ?? '', setup: shot.setup ?? '', assetId: shot.assetId ?? '' } : EMPTY_SHOT);
  };

  function importImage(files: File | File[] | null) {
    const image = Array.isArray(files) ? files[0] : files;
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

  function saveShot(event: FormEvent) {
    event.preventDefault();
    if (!scene || scene.status !== 'active') return;
    const id = editing?.id ?? newId();
    const shot: ProductionShot = {
      id, sceneId: scene.id, description: draft.description.trim(), framing: draft.framing.trim(), setup: draft.setup.trim(),
      source: { ...scene.source, shotId: scene.source.shotId ?? id }, assetId: byAsset.has(draft.assetId) ? draft.assetId : undefined
    };
    if (!shot.description) return setError('Add a shot description.');
    if (update(current => ({
      ...current,
      shots: editing ? current.shots.map(item => item.id === id ? shot : item) : [...current.shots, shot]
    }), 'Shot saved.')) {
      edit(undefined);
      setError('');
    }
  }

  function addLookbookCard(event: FormEvent) {
    event.preventDefault();
    const card: LookbookCard = { id: newId(), title: look.title.trim(), notes: look.notes.trim(), assetId: look.assetId, source };
    if (!card.title || !byAsset.has(card.assetId)) return setError('Enter a title and choose a project image.');
    if (update(current => ({ ...current, lookbook: [...current.lookbook, card] }), 'Lookbook image added.')) {
      setLook({ title: '', notes: '', assetId: '' });
      setError('');
    }
  }

  const shots = scene ? plan.shots.filter(shot => shot.sceneId === scene.id) : [];
  return <VStack gap={4}>
    <HStack gap={3} justify="between" align="end" wrap="wrap">
      <SegmentedControl label="Shots view" value={mode} onChange={value => { setMode(value as typeof mode); setError(''); edit(undefined); }}>
        <SegmentedControlItem value="Shot list" label="Shot list" />
        <SegmentedControlItem value="Lookbook" label="Lookbook" />
      </SegmentedControl>
      {!readOnly && <FileInput label="Add reference image" isLabelHidden accept="image/png,image/jpeg,image/webp,image/gif" value={null}
        isLoading={uploading} placeholder={uploading ? 'Adding image…' : 'Add reference image'} onChange={importImage} />}
    </HStack>
    <FormError>{error}</FormError>
    {mode === 'Shot list' && (scene ? <Split main={<Pane>
      <Choice label="Scene" value={scene.id} onChange={value => { setSceneId(value); edit(undefined); }}
        options={plan.scenes.map(item => ({ value: item.id, label: `${item.number} · ${item.heading || 'Untitled scene'}${item.status === 'omitted' ? ' (omitted)' : ''}` }))} />
      <Heading level={3}>Shots and storyboard</Heading>
      {!shots.length && <Text color="secondary">No shots for this scene.</Text>}
      <Grid columns={{ minWidth: 200, repeat: 'fill' }} gap={3}>
        {shots.map((shot, index) => <Card key={shot.id} variant="muted" padding={3}>
          <VStack gap={2}>
            <Picture asset={shot.assetId ? byAsset.get(shot.assetId) : undefined} />
            <Heading level={4}>{scene.number}{String.fromCharCode(65 + index % 26)}{index >= 26 ? Math.floor(index / 26) : ''} · {shot.description}</Heading>
            <Text type="supporting" color="secondary">{[shot.framing, shot.setup].filter(Boolean).join(' · ')}</Text>
            <HStack gap={3} align="center" wrap="wrap">
              <SourceButton source={shot.source} onOpenSource={onOpenSource} />
              {!readOnly && scene.status === 'active' && <Link onClick={() => edit(shot)}>Edit shot</Link>}
            </HStack>
          </VStack>
        </Card>)}
      </Grid>
    </Pane>} side={!readOnly && scene.status === 'active' && <Pane title={editing ? 'Edit shot' : 'Add shot'}>
      <VStack as="form" gap={3} onSubmit={saveShot}>
        <TextArea label="Description" value={draft.description} onChange={description => setDraft({ ...draft, description })} isRequired />
        <Grid columns={{ minWidth: 160, repeat: 'fit' }} gap={3}>
          <TextInput label="Framing" value={draft.framing} onChange={framing => setDraft({ ...draft, framing })} placeholder="Wide, medium, close-up" />
          <TextInput label="Setup" value={draft.setup} onChange={setup => setDraft({ ...draft, setup })} placeholder="Camera A, handheld" />
        </Grid>
        <Choice label="Storyboard image" value={draft.assetId} onChange={assetId => setDraft({ ...draft, assetId })}
          options={[{ value: '', label: 'None' }, ...imageOptions]} />
        <HStack gap={2}>
          <Button type="submit" variant="primary" label={editing ? 'Save shot' : 'Add shot'} />
          {editing && <Button label="Remove shot" onClick={() => {
            if (update(current => ({ ...current, shots: current.shots.filter(shot => shot.id !== editing.id) }), 'Shot removed.')) edit(undefined);
          }} />}
        </HStack>
      </VStack>
    </Pane>} /> : <Empty>The released script has no scenes for a shot list.</Empty>)}
    {mode === 'Lookbook' && <Split main={<Pane title="Lookbook">
      {!plan.lookbook.length && <Text color="secondary">Add image references and notes for the production.</Text>}
      <Grid columns={{ minWidth: 200, repeat: 'fill' }} gap={3}>
        {plan.lookbook.map(card => <Card key={card.id} variant="muted" padding={3}>
          <VStack gap={2}>
            <Picture asset={byAsset.get(card.assetId)} />
            <Heading level={4}>{card.title}</Heading>
            {card.notes && <Text type="supporting" color="secondary">{card.notes}</Text>}
            <SourceButton source={card.source} onOpenSource={onOpenSource} />
          </VStack>
        </Card>)}
      </Grid>
    </Pane>} side={!readOnly && <Pane title="Add lookbook image">
      <VStack as="form" gap={3} onSubmit={addLookbookCard}>
        <TextInput label="Title" value={look.title} onChange={title => setLook({ ...look, title })} isRequired />
        <Choice label="Reference image" value={look.assetId} onChange={assetId => setLook({ ...look, assetId })} placeholder="Choose an image" options={imageOptions} />
        <TextArea label="Notes" value={look.notes} onChange={notes => setLook({ ...look, notes })} />
        <HStack><Button type="submit" variant="primary" label="Add to lookbook" /></HStack>
      </VStack>
    </Pane>} />}
  </VStack>;
}
