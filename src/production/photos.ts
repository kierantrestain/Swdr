import { newId } from '../model';
import type { Asset, Project } from '../model';

/** Longest edge of a stored photo, in pixels: enough for avatars and recce thumbnails, small in IndexedDB. */
export const PHOTO_EDGE = 512;
export const PHOTO_TYPES = 'image/png,image/jpeg,image/webp,image/gif';

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('This file could not be read as an image.'));
    image.src = url;
  });
}

/** Reads an image file and stores it as a JPEG project asset no larger than 512px on its longest edge. */
export async function photoAsset(file: File): Promise<Asset> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a PNG, JPEG, WebP or GIF image.');
  if (file.size > 25_000_000) throw new Error('Choose an image smaller than 25 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const scale = Math.min(1, PHOTO_EDGE / Math.max(image.naturalWidth, image.naturalHeight, 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot resize images.');
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const name = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return { id: newId(), name: `${name}.jpg`, mime: 'image/jpeg', dataUrl: canvas.toDataURL('image/jpeg', 0.84), addedAt: new Date().toISOString() };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function assetUrl(project: Project, id?: string): string | undefined {
  return id ? project.assets.find(asset => asset.id === id)?.dataUrl : undefined;
}

export function addAssets(project: Project, assets: Asset[]): Project {
  return assets.length ? { ...project, assets: [...project.assets, ...assets] } : project;
}

export function removeAssets(project: Project, ids: ReadonlyArray<string | undefined>): Project {
  const gone = new Set(ids.filter(Boolean));
  return gone.size ? { ...project, assets: project.assets.filter(asset => !gone.has(asset.id)) } : project;
}
