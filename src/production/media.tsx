import { Avatar } from '@astryxdesign/core/Avatar';
import { FileInput } from '@astryxdesign/core/FileInput';
import { HStack } from '@astryxdesign/core/HStack';
import { useState } from 'react';
import type { Asset, Project } from '../model';
import { resolveCharacterPhoto } from '../story/series-analysis';
import { getStory } from '../story/series-model';
import type { Person } from './model';
import { PHOTO_TYPES, assetUrl, photoAsset } from './photos';

function storyPortraitFor(project: Project, person: Pick<Person, 'name'>): string | undefined {
  if (project.kind !== 'series') return undefined;
  const needle = person.name.trim().toLocaleLowerCase('en-GB');
  if (!needle) return undefined;
  const characters = getStory(project).draft.characters;
  const match = characters.find(item =>
    item.name.toLocaleLowerCase('en-GB') === needle
    || item.name.split(/\s+/)[0]?.toLocaleLowerCase('en-GB') === needle
    || item.aliases.some(alias => alias.toLocaleLowerCase('en-GB') === needle)
  );
  return match ? resolveCharacterPhoto(project, match) : undefined;
}

/** A cast or crew member's photo, falling back to their Series Intelligence portrait or initials. Decorative where the name is already shown. */
export function PersonAvatar({ project, person, size = 'md', decorative }: {
  project: Project;
  person: Pick<Person, 'name' | 'photoAssetId'>;
  size?: 'xsm' | 'sm' | 'md' | 'lg' | 'xl' | 24 | 32 | 40 | 48 | 64 | 96;
  decorative?: boolean;
}) {
  const src = assetUrl(project, person.photoAssetId) ?? storyPortraitFor(project, person);
  const avatar = <Avatar src={src} name={person.name} size={size} tooltip={false} />;
  return <HStack as="span" align="center" aria-hidden={decorative || undefined}>{avatar}</HStack>;
}

/** Upload by file picker or drag and drop; files are resized to a 512px JPEG asset before saving. */
export function PhotoDrop({ label, description, multiple, onAssets, disabled }: {
  label: string;
  description?: string;
  multiple?: boolean;
  disabled?: boolean;
  onAssets: (assets: Asset[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function accept(files: File | File[] | null) {
    const list = files === null ? [] : Array.isArray(files) ? files : [files];
    if (!list.length) return;
    setBusy(true);
    try {
      const assets = await Promise.all(list.map(photoAsset));
      setError('');
      onAssets(assets);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'This photo could not be added.');
    } finally {
      setBusy(false);
    }
  }
  return multiple
    ? <FileInput label={label} description={description} mode="dropzone" accept={PHOTO_TYPES} isMultiple value={[]} isLoading={busy} isDisabled={disabled}
      placeholder="Drop photos here or browse" maxFiles={12} onChange={files => void accept(files)}
      status={error ? { type: 'error', message: error } : undefined} />
    : <FileInput label={label} description={description} mode="dropzone" accept={PHOTO_TYPES} value={null} isLoading={busy} isDisabled={disabled}
      placeholder="Drop a photo here or browse" onChange={files => void accept(files)}
      status={error ? { type: 'error', message: error } : undefined} />;
}
