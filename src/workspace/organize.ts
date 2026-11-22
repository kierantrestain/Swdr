import { newDocument, newId } from '../model';
import type { Asset, DocumentKind, DocumentModel, Episode, Project, ScriptFolder } from '../model';

export interface ParsedEpisodeFilename {
  season: number;
  number: number;
  title: string;
  seriesHint?: string;
  detected: boolean;
}

function cleanSegment(text: string): string {
  return text
    .replace(/[_]+/g, ' ')
    .replace(/^[\s\-–—.:()]+|[\s\-–—.:()]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').trim();
}

/**
 * Parses common episodic naming patterns from a script filename:
 * - "The North Shore - S01E04 - Doubt.fdx"
 * - "S2E03_The_Storm.fountain"
 * - "1x05 - Midnight Ferry.pdf"
 * - "Season 2 Episode 4 - The Crossing.docx"
 * - "Episode 03 - The Crossing.fdx" / "Ep 3.fountain"
 * - "01 - Pilot.fdx" / "02_Aftermath.pdf"
 */
export function parseEpisodeFromFilename(
  filename: string,
  fallbackNumber = 1,
  defaultSeason = 1
): ParsedEpisodeFilename {
  const stem = stripExtension(filename).replace(/_/g, ' ');
  const safeFallback = Math.max(1, Math.round(fallbackNumber));
  const safeSeason = Math.max(1, Math.round(defaultSeason));

  // 1. S01E02 or S1 E02 or S01_E02
  const seMatch = /^(.*?)[\s\-–—.(]*\bS(\d{1,2})\s*[.-]?\s*E(\d{1,3})\b[\s\-–—.)]*(.*)$/i.exec(stem);
  if (seMatch) {
    const seriesHint = cleanSegment(seMatch[1]) || undefined;
    const season = Math.max(1, Number.parseInt(seMatch[2], 10));
    const number = Math.max(1, Number.parseInt(seMatch[3], 10));
    const title = cleanSegment(seMatch[4]) || `Episode ${number}`;
    return { season, number, title, seriesHint, detected: true };
  }

  // 2. Season 2 Episode 4
  const fullWordMatch = /^(.*?)[\s\-–—.(]*\bSeason\s*(\d{1,2})[\s\-–—.,]*(?:Episode|Ep\.?)\s*(\d{1,3})\b[\s\-–—.)]*(.*)$/i.exec(stem);
  if (fullWordMatch) {
    const seriesHint = cleanSegment(fullWordMatch[1]) || undefined;
    const season = Math.max(1, Number.parseInt(fullWordMatch[2], 10));
    const number = Math.max(1, Number.parseInt(fullWordMatch[3], 10));
    const title = cleanSegment(fullWordMatch[4]) || `Episode ${number}`;
    return { season, number, title, seriesHint, detected: true };
  }

  // 3. 1x05 / 02x10
  const xMatch = /^(.*?)[\s\-–—.(]*\b(\d{1,2})x(\d{1,3})\b[\s\-–—.)]*(.*)$/i.exec(stem);
  if (xMatch) {
    const seriesHint = cleanSegment(xMatch[1]) || undefined;
    const season = Math.max(1, Number.parseInt(xMatch[2], 10));
    const number = Math.max(1, Number.parseInt(xMatch[3], 10));
    const title = cleanSegment(xMatch[4]) || `Episode ${number}`;
    return { season, number, title, seriesHint, detected: true };
  }

  // 4. Episode 03 / Ep 3 / Ep. 3
  const epMatch = /^(.*?)[\s\-–—.(]*\b(?:Episode|Ep\.?)\s*(\d{1,3})\b[\s\-–—.)]*(.*)$/i.exec(stem);
  if (epMatch) {
    const seriesHint = cleanSegment(epMatch[1]) || undefined;
    const number = Math.max(1, Number.parseInt(epMatch[2], 10));
    const title = cleanSegment(epMatch[3]) || `Episode ${number}`;
    return { season: safeSeason, number, title, seriesHint, detected: true };
  }

  // 5. Leading episode number: "01 - Pilot" or "02_The_Crossing"
  const leadNum = /^(\d{1,3})\s*[-–—.)\s]+\s*(.+)$/.exec(stem);
  if (leadNum) {
    const number = Math.max(1, Number.parseInt(leadNum[1], 10));
    const title = cleanSegment(leadNum[2]) || `Episode ${number}`;
    return { season: safeSeason, number, title, detected: true };
  }

  const cleaned = cleanSegment(stem) || `Episode ${safeFallback}`;
  return { season: safeSeason, number: safeFallback, title: cleaned, detected: false };
}

/** Infers a sensible series title from a batch of episode filenames (e.g. shared prefix "The North Shore"). */
export function inferSeriesTitle(filenames: string[]): string {
  const hints = filenames
    .map((name, idx) => parseEpisodeFromFilename(name, idx + 1).seriesHint)
    .filter((value): value is string => Boolean(value));
  if (hints.length) {
    const counts = new Map<string, number>();
    for (const hint of hints) counts.set(hint, (counts.get(hint) ?? 0) + 1);
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0];
    if (best) return best[0];
  }
  const stems = filenames.map(name => cleanSegment(stripExtension(name))).filter(Boolean);
  if (stems.length >= 2) {
    let prefix = stems[0];
    for (const stem of stems.slice(1)) {
      while (prefix && !stem.toLowerCase().startsWith(prefix.toLowerCase())) {
        prefix = prefix.slice(0, -1);
      }
    }
    const clean = cleanSegment(prefix.replace(/\d+$/, ''));
    if (clean.length >= 3) return clean;
  }
  return stems[0] || 'Untitled Series';
}

/** Returns folders in their saved display order. */
export function orderedFolders(project: Pick<Project, 'folders'>): ScriptFolder[] {
  return [...(project.folders ?? [])].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export function createFolder(project: Project, rawName: string): { project: Project; folder: ScriptFolder } {
  const name = rawName.trim();
  if (!name) throw new Error('Enter a folder name.');
  const existing = orderedFolders(project);
  const folder: ScriptFolder = {
    id: newId(),
    name,
    order: existing.length ? existing[existing.length - 1].order + 1 : 0
  };
  return {
    project: { ...project, folders: [...existing, folder] },
    folder
  };
}

export function renameFolder(project: Project, folderId: string, rawName: string): Project {
  const name = rawName.trim();
  if (!name) return project;
  const folders = orderedFolders(project).map(folder => folder.id === folderId ? { ...folder, name } : folder);
  return { ...project, folders };
}

/** Removes a folder while keeping every script safely in the project as unfiled. */
export function deleteFolder(project: Project, folderId: string): Project {
  const folders = orderedFolders(project)
    .filter(folder => folder.id !== folderId)
    .map((folder, order) => ({ ...folder, order }));
  const documents = project.documents.map(doc => doc.folderId === folderId ? { ...doc, folderId: undefined } : doc);
  return { ...project, folders, documents };
}

export function moveFolder(project: Project, folderId: string, direction: -1 | 1): Project {
  const list = orderedFolders(project);
  const at = list.findIndex(folder => folder.id === folderId);
  const target = at + direction;
  if (at < 0 || target < 0 || target >= list.length) return project;
  const next = list.slice();
  [next[at], next[target]] = [next[target], next[at]];
  return { ...project, folders: next.map((folder, order) => ({ ...folder, order })) };
}

export function moveDocumentToFolder(project: Project, documentId: string, folderId?: string): Project {
  const validFolderId = folderId && orderedFolders(project).some(item => item.id === folderId) ? folderId : undefined;
  return {
    ...project,
    documents: project.documents.map(doc => doc.id === documentId ? { ...doc, folderId: validFolderId } : doc)
  };
}

export function renameDocument(project: Project, documentId: string, rawTitle: string): Project {
  const title = rawTitle.trim();
  if (!title) return project;
  const current = project.documents.find(doc => doc.id === documentId);
  if (!current) return project;
  const linkedEp = current.episodeId ? project.episodes.find(ep => ep.id === current.episodeId) : undefined;
  const syncEpisode = linkedEp && linkedEp.title === current.title;
  return {
    ...project,
    documents: project.documents.map(doc => doc.id === documentId ? { ...doc, title } : doc),
    episodes: syncEpisode
      ? project.episodes.map(ep => ep.id === linkedEp.id ? { ...ep, title } : ep)
      : project.episodes
  };
}

/**
 * Moves a script up or down in `project.documents` order. When `visibleIds` is supplied (e.g.
 * viewing one folder), swaps with the adjacent visible script so the user always sees immediate movement.
 */
export function reorderDocument(project: Project, documentId: string, direction: -1 | 1, visibleIds?: string[]): Project {
  const scope = visibleIds?.length ? visibleIds : project.documents.map(doc => doc.id);
  const pos = scope.indexOf(documentId);
  const neighbourPos = pos + direction;
  if (pos < 0 || neighbourPos < 0 || neighbourPos >= scope.length) return project;
  const otherId = scope[neighbourPos];
  const docs = project.documents.slice();
  const aIdx = docs.findIndex(doc => doc.id === documentId);
  const bIdx = docs.findIndex(doc => doc.id === otherId);
  if (aIdx < 0 || bIdx < 0) return project;
  [docs[aIdx], docs[bIdx]] = [docs[bIdx], docs[aIdx]];
  return { ...project, documents: docs };
}

/** Builds a batch of episodes (e.g. a full Season of 8 episodes) with linked scripts in order. */
export function addSeasonBatch(project: Project, options: {
  season: number;
  count: number;
  kind?: DocumentKind;
  titles?: string[];
  folderId?: string;
}): { project: Project; createdDocuments: DocumentModel[] } {
  const season = Math.max(1, Math.round(options.season));
  const count = Math.max(1, Math.min(50, Math.round(options.count)));
  const kind: DocumentKind = options.kind ?? (project.kind === 'commercial' || project.kind === 'creator' ? 'av' : project.kind === 'stage' ? 'stageplay' : 'screenplay');
  const existingMax = Math.max(0, ...project.episodes.filter(ep => ep.season === season).map(ep => ep.number));
  const folderId = options.folderId && orderedFolders(project).some(f => f.id === options.folderId) ? options.folderId : undefined;

  const newEpisodes: Episode[] = [];
  const newDocuments: DocumentModel[] = [];
  for (let i = 0; i < count; i += 1) {
    const number = existingMax + i + 1;
    const customTitle = options.titles?.[i]?.trim();
    const title = customTitle || `Episode ${number}`;
    const episode: Episode = { id: newId(), season, number, title, synopsis: '' };
    const doc: DocumentModel = { ...newDocument(title, kind, episode.id), ...(folderId ? { folderId } : {}) };
    newEpisodes.push(episode);
    newDocuments.push(doc);
  }

  return {
    project: {
      ...project,
      episodes: [...project.episodes, ...newEpisodes],
      documents: [...project.documents, ...newDocuments]
    },
    createdDocuments: newDocuments
  };
}

/** Updates an episode's season, number, title, or synopsis and keeps its linked document title in sync. */
export function updateEpisode(
  project: Project,
  episodeId: string,
  patch: Partial<Pick<Episode, 'season' | 'number' | 'title' | 'synopsis'>>
): Project {
  const existing = project.episodes.find(ep => ep.id === episodeId);
  if (!existing) return project;
  const next: Episode = {
    ...existing,
    season: patch.season !== undefined ? Math.max(1, Math.round(patch.season)) : existing.season,
    number: patch.number !== undefined ? Math.max(1, Math.round(patch.number)) : existing.number,
    title: patch.title !== undefined ? (patch.title.trim() || existing.title) : existing.title,
    synopsis: patch.synopsis !== undefined ? patch.synopsis : existing.synopsis
  };
  const renameLinkedDoc = patch.title !== undefined && patch.title.trim().length > 0;
  return {
    ...project,
    episodes: project.episodes.map(ep => ep.id === episodeId ? next : ep),
    documents: renameLinkedDoc
      ? project.documents.map(doc => doc.episodeId === episodeId && doc.title === existing.title ? { ...doc, title: next.title } : doc)
      : project.documents
  };
}

/** Moves an episode up or down within its season by swapping episode numbers with its adjacent episode. */
export function moveEpisode(project: Project, episodeId: string, direction: -1 | 1): Project {
  const target = project.episodes.find(ep => ep.id === episodeId);
  if (!target) return project;
  const sameSeason = project.episodes
    .filter(ep => ep.season === target.season)
    .sort((a, b) => a.number - b.number || a.id.localeCompare(b.id));
  const at = sameSeason.findIndex(ep => ep.id === episodeId);
  const swapAt = at + direction;
  if (at < 0 || swapAt < 0 || swapAt >= sameSeason.length) return project;
  const other = sameSeason[swapAt];
  const aNum = target.number;
  const bNum = other.number === aNum ? aNum + direction : other.number;
  const episodes = project.episodes.map(ep => {
    if (ep.id === target.id) return { ...ep, number: bNum };
    if (ep.id === other.id) return { ...ep, number: aNum };
    return ep;
  });
  return { ...project, episodes };
}

/** Compacts episode numbers in one season to 1..N while keeping their current order. */
export function renumberSeason(project: Project, season: number): Project {
  const ordered = project.episodes
    .filter(ep => ep.season === season)
    .sort((a, b) => a.number - b.number || a.id.localeCompare(b.id));
  const numberById = new Map(ordered.map((ep, idx) => [ep.id, idx + 1]));
  return {
    ...project,
    episodes: project.episodes.map(ep => numberById.has(ep.id) ? { ...ep, number: numberById.get(ep.id)! } : ep)
  };
}

/** Links a standalone script to a season & episode, updates its existing episode, or unlinks it when `target` is null. */
export function assignDocumentEpisode(
  project: Project,
  documentId: string,
  target: { season: number; number: number; title?: string; synopsis?: string } | null
): Project {
  const doc = project.documents.find(item => item.id === documentId);
  if (!doc) return project;

  if (target === null) {
    if (!doc.episodeId) return project;
    const usedElsewhere = project.documents.some(item => item.id !== documentId && item.episodeId === doc.episodeId);
    return {
      ...project,
      documents: project.documents.map(item => item.id === documentId ? { ...item, episodeId: undefined } : item),
      episodes: usedElsewhere ? project.episodes : project.episodes.filter(ep => ep.id !== doc.episodeId)
    };
  }

  const season = Math.max(1, Math.round(target.season));
  const number = Math.max(1, Math.round(target.number));
  const title = target.title?.trim() || doc.title;

  if (doc.episodeId && project.episodes.some(ep => ep.id === doc.episodeId)) {
    return updateEpisode(project, doc.episodeId, { season, number, title, synopsis: target.synopsis });
  }

  const episode: Episode = { id: newId(), season, number, title, synopsis: target.synopsis ?? '' };
  return {
    ...project,
    episodes: [...project.episodes, episode],
    documents: project.documents.map(item => item.id === documentId ? { ...item, episodeId: episode.id, title } : item)
  };
}

/** True when a freshly created project still only contains its untouched blank placeholder script. */
export function isBlankPlaceholderDocument(doc: DocumentModel): boolean {
  if (doc.kind === 'av') {
    return doc.avRows.length <= 1 && !doc.avRows.some(row => row.video.trim() || row.audio.trim());
  }
  return doc.beats.length === 0 && doc.blocks.every(block => !block.text.trim());
}

export interface BatchImportEntry {
  document: DocumentModel;
  source: Asset;
  relatedAssets?: Asset[];
  title: string;
  asEpisode: boolean;
  season: number;
  number: number;
  synopsis?: string;
  folderId?: string;
}

/**
 * Commits an organised batch of scripts (e.g. a full season of episodes or a folder of scripts)
 * into a project in one atomic update: creates any requested folder, links every episode with
 * clean season/episode numbers, preserves source assets & import provenance, and replaces an
 * untouched blank default Episode 1 placeholder when importing into a brand-new project.
 */
export function applyBatchImport(
  project: Project,
  entries: BatchImportEntry[],
  options: { newFolderName?: string; folderId?: string; folderPerSeason?: boolean; replaceEmptyPlaceholder?: boolean } = {}
): { project: Project; documents: DocumentModel[] } {
  let working = project;
  const ensureFolderByName = (name: string): string => {
    const trimmed = name.trim();
    const existingFolder = orderedFolders(working).find(
      item => item.name.toLocaleLowerCase('en-GB') === trimmed.toLocaleLowerCase('en-GB')
    );
    if (existingFolder) return existingFolder.id;
    const created = createFolder(working, trimmed);
    working = created.project;
    return created.folder.id;
  };

  let defaultFolderId = options.folderId;
  if (options.newFolderName?.trim()) {
    defaultFolderId = ensureFolderByName(options.newFolderName);
  }

  // Pre-create per-season folders in ascending season order when requested.
  const seasonFolders = new Map<number, string>();
  if (options.folderPerSeason) {
    const uniqueSeasons = [...new Set(entries.filter(entry => entry.asEpisode).map(entry => Math.max(1, Math.round(entry.season))))].sort((a, b) => a - b);
    for (const season of uniqueSeasons) {
      seasonFolders.set(season, ensureFolderByName(`Season ${season}`));
    }
  }

  // If the destination project only has a single untouched blank placeholder script, replace it cleanly.
  if (options.replaceEmptyPlaceholder !== false && working.documents.length === 1 && isBlankPlaceholderDocument(working.documents[0])) {
    const placeholder = working.documents[0];
    working = {
      ...working,
      documents: [],
      episodes: placeholder.episodeId ? working.episodes.filter(ep => ep.id !== placeholder.episodeId) : working.episodes
    };
  }

  const assets = new Map(working.assets.map(asset => [asset.id, asset]));
  const priorImports = Array.isArray(working.modules.imports) ? working.modules.imports : [];
  const addedImports: unknown[] = [];
  const episodes = [...working.episodes];
  const addedDocs: DocumentModel[] = [];
  const receivedAt = new Date().toISOString();

  for (const entry of entries) {
    assets.set(entry.source.id, entry.source);
    for (const rel of entry.relatedAssets ?? []) assets.set(rel.id, rel);

    const title = entry.title.trim() || entry.document.title || 'Untitled script';
    const season = Math.max(1, Math.round(entry.season));
    const folderId = entry.folderId ?? (options.folderPerSeason && entry.asEpisode ? seasonFolders.get(season) : undefined) ?? defaultFolderId;
    let episodeId: string | undefined;

    if (entry.asEpisode) {
      const episode: Episode = {
        id: newId(),
        season,
        number: Math.max(1, Math.round(entry.number)),
        title,
        synopsis: entry.synopsis?.trim() ?? ''
      };
      episodes.push(episode);
      episodeId = episode.id;
    }

    const doc: DocumentModel = {
      ...entry.document,
      title,
      episodeId,
      ...(folderId ? { folderId } : {})
    };
    addedDocs.push(doc);
    addedImports.push({
      documentId: doc.id,
      revisionId: doc.revisionId,
      assetId: entry.source.id,
      receivedAt
    });
  }

  const updated: Project = {
    ...working,
    episodes,
    documents: [...working.documents, ...addedDocs],
    assets: [...assets.values()],
    modules: { ...working.modules, imports: [...priorImports, ...addedImports] }
  };

  return { project: updated, documents: addedDocs };
}
