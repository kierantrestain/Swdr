import type { Asset, Project } from '../model';
import { storyWorkspaceTitle } from '../story/story-profile';

const MODULE_LABELS: Record<string, string> = {
  production: 'Production', imports: 'Script import', story: 'Story Intelligence', editorial: 'Editorial', creator: 'Creator studio', writingNotes: 'Script notes'
};

export function sizeOf(asset: Asset): number {
  const comma = asset.dataUrl.indexOf(',');
  return Math.round((asset.dataUrl.length - comma - 1) * 0.75);
}

export function megabytes(bytes: number): string {
  if (!bytes) return '0 KB';
  return bytes < 1_048_576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`;
}

/** Where each asset is referenced: which workspace modules and which documents mention its id. */
export function assetUsage(project: Project): Map<string, string[]> {
  const sources = [
    ...Object.entries(project.modules).map(([key, value]) => [key === 'story' ? storyWorkspaceTitle(project.kind) : (MODULE_LABELS[key] ?? key), JSON.stringify(value)] as const),
    ...project.documents.map(item => [item.title || 'Untitled document', JSON.stringify(item)] as const)
  ];
  return new Map(project.assets.map(asset => [asset.id, [...new Set(sources.filter(([, text]) => text.includes(asset.id)).map(([label]) => label))]]));
}

