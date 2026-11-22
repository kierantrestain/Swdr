import assert from 'node:assert/strict';
import test from 'node:test';
import { exportArchive, importArchive } from '../src/interchange/archive';
import { newDocument, newId } from '../src/model';
import { createProject } from '../src/workspace/project';
import {
  addSeasonBatch,
  applyBatchImport,
  assignDocumentEpisode,
  createFolder,
  deleteFolder,
  inferSeriesTitle,
  moveDocumentToFolder,
  moveEpisode,
  moveFolder,
  orderedFolders,
  parseEpisodeFromFilename,
  renameDocument,
  renameFolder,
  renumberSeason,
  reorderDocument,
  updateEpisode
} from '../src/workspace/organize';

test('parseEpisodeFromFilename detects common series naming formats', () => {
  assert.deepEqual(parseEpisodeFromFilename('The North Shore - S01E04 - Doubt.fdx'), {
    season: 1, number: 4, title: 'Doubt', seriesHint: 'The North Shore', detected: true
  });
  assert.deepEqual(parseEpisodeFromFilename('S2E03_The_Storm.fountain'), {
    season: 2, number: 3, title: 'The Storm', seriesHint: undefined, detected: true
  });
  assert.deepEqual(parseEpisodeFromFilename('Harbour Watch 1x05 - Midnight Ferry.pdf'), {
    season: 1, number: 5, title: 'Midnight Ferry', seriesHint: 'Harbour Watch', detected: true
  });
  assert.deepEqual(parseEpisodeFromFilename('Season 2 Episode 4 - The Crossing.docx'), {
    season: 2, number: 4, title: 'The Crossing', seriesHint: undefined, detected: true
  });
  assert.deepEqual(parseEpisodeFromFilename('Episode 02 - Aftermath.fountain', 1, 3), {
    season: 3, number: 2, title: 'Aftermath', seriesHint: undefined, detected: true
  });
  assert.deepEqual(parseEpisodeFromFilename('01 - Pilot.fdx'), {
    season: 1, number: 1, title: 'Pilot', detected: true
  });
  assert.deepEqual(parseEpisodeFromFilename('Standalone Draft.fountain', 7, 2), {
    season: 2, number: 7, title: 'Standalone Draft', detected: false
  });
});

test('inferSeriesTitle extracts shared series prefix from filenames', () => {
  assert.equal(inferSeriesTitle([
    'Harbour Watch - S01E03 - Storm.fountain',
    'Harbour Watch - S01E01 - Pilot.fountain',
    'Harbour Watch - S01E02 - Crossing.fountain'
  ]), 'Harbour Watch');
  assert.equal(inferSeriesTitle(['Cold Tide 01.fdx', 'Cold Tide 02.fdx']), 'Cold Tide');
});

test('createProject scaffolds multi-season series and optional per-season folders', () => {
  const series = createProject('Harbour Watch', 'series', 'Coastal mystery.', {
    seasons: 2,
    episodesPerSeason: 3,
    folderPerSeason: true
  });
  assert.equal(series.episodes.length, 6);
  assert.equal(series.documents.length, 6);
  assert.equal(orderedFolders(series).length, 2);
  assert.deepEqual(orderedFolders(series).map(f => f.name), ['Season 1', 'Season 2']);
  assert.equal(series.documents[0].title, 'Episode 1');
  assert.equal(series.documents[0].folderId, orderedFolders(series)[0].id);
  assert.equal(series.documents[3].folderId, orderedFolders(series)[1].id);
});

test('folders create, rename, reorder, file scripts, and delete without losing scripts', () => {
  let project = createProject('Feature Anthology', 'film');
  const second = newDocument('Second Script', 'screenplay');
  const third = newDocument('Third Script', 'screenplay');
  project = { ...project, documents: [...project.documents, second, third] };

  const f1 = createFolder(project, 'Act I Drafts');
  project = f1.project;
  const f2 = createFolder(project, 'Production Polish');
  project = f2.project;
  assert.deepEqual(orderedFolders(project).map(f => f.name), ['Act I Drafts', 'Production Polish']);

  project = moveFolder(project, f2.folder.id, -1);
  assert.deepEqual(orderedFolders(project).map(f => f.name), ['Production Polish', 'Act I Drafts']);

  project = renameFolder(project, f1.folder.id, 'Early Drafts');
  assert.equal(orderedFolders(project).find(f => f.id === f1.folder.id)?.name, 'Early Drafts');

  project = moveDocumentToFolder(project, second.id, f1.folder.id);
  project = moveDocumentToFolder(project, third.id, f1.folder.id);
  assert.equal(project.documents.find(d => d.id === second.id)?.folderId, f1.folder.id);

  // Reorder within folder scope
  const folderDocIds = project.documents.filter(d => d.folderId === f1.folder.id).map(d => d.id);
  project = reorderDocument(project, third.id, -1, folderDocIds);
  assert.deepEqual(
    project.documents.filter(d => d.folderId === f1.folder.id).map(d => d.id),
    [third.id, second.id]
  );

  // Rename document
  project = renameDocument(project, third.id, 'Opening Night');
  assert.equal(project.documents.find(d => d.id === third.id)?.title, 'Opening Night');

  // Deleting a folder keeps scripts safely unfiled
  project = deleteFolder(project, f1.folder.id);
  assert.equal(project.documents.length, 3);
  assert.equal(project.documents.find(d => d.id === second.id)?.folderId, undefined);
  assert.equal(project.documents.find(d => d.id === third.id)?.folderId, undefined);
});

test('addSeasonBatch, moveEpisode, updateEpisode, renumberSeason, and assignDocumentEpisode maintain clean episode order', () => {
  let project = createProject('The Pier', 'series');
  const added = addSeasonBatch(project, {
    season: 2,
    count: 3,
    titles: ['Low Tide', 'Foghorn', 'Breakwater']
  });
  project = added.project;
  const s2 = project.episodes.filter(ep => ep.season === 2).sort((a, b) => a.number - b.number);
  assert.deepEqual(s2.map(ep => `${ep.number}:${ep.title}`), ['1:Low Tide', '2:Foghorn', '3:Breakwater']);

  // Swap Ep 3 up above Ep 2
  project = moveEpisode(project, s2[2].id, -1);
  const afterSwap = project.episodes.filter(ep => ep.season === 2).sort((a, b) => a.number - b.number);
  assert.deepEqual(afterSwap.map(ep => `${ep.number}:${ep.title}`), ['1:Low Tide', '2:Breakwater', '3:Foghorn']);

  // Create a gap and renumber 1..N
  project = updateEpisode(project, afterSwap[2].id, { number: 9, title: 'High Water' });
  assert.equal(project.documents.find(d => d.episodeId === afterSwap[2].id)?.title, 'High Water');
  project = renumberSeason(project, 2);
  const compacted = project.episodes.filter(ep => ep.season === 2).sort((a, b) => a.number - b.number);
  assert.deepEqual(compacted.map(ep => ep.number), [1, 2, 3]);

  // Assign a standalone document to Season 1 Ep 2, then unlink
  const extra = newDocument('Special Episode', 'screenplay');
  project = { ...project, documents: [...project.documents, extra] };
  project = assignDocumentEpisode(project, extra.id, { season: 1, number: 2, title: 'Special Episode' });
  assert.ok(project.documents.find(d => d.id === extra.id)?.episodeId);
  project = assignDocumentEpisode(project, extra.id, null);
  assert.equal(project.documents.find(d => d.id === extra.id)?.episodeId, undefined);
});

test('applyBatchImport replaces blank placeholder, creates per-season folders, and round-trips through SWDR archive', () => {
  const base = createProject('Harbour Watch', 'series');
  const makeEntry = (season: number, number: number, title: string) => {
    const doc = newDocument(title, 'screenplay');
    return {
      document: doc,
      source: {
        id: newId(),
        name: `Harbour Watch - S0${season}E0${number} - ${title}.fountain`,
        mime: 'text/plain',
        dataUrl: 'data:text/plain;base64,SU5ULiBQSU5F',
        addedAt: new Date().toISOString()
      },
      title,
      asEpisode: true,
      season,
      number
    };
  };

  const applied = applyBatchImport(base, [
    makeEntry(1, 1, 'Pilot'),
    makeEntry(1, 2, 'Crossing'),
    makeEntry(2, 1, 'Return')
  ], { folderPerSeason: true });

  const updated = applied.project;
  assert.equal(updated.documents.length, 3);
  assert.equal(updated.episodes.length, 3);
  assert.deepEqual(orderedFolders(updated).map(f => f.name), ['Season 1', 'Season 2']);
  assert.equal(updated.documents[0].folderId, orderedFolders(updated)[0].id);
  assert.equal(updated.documents[2].folderId, orderedFolders(updated)[1].id);

  // Archive round-trip preserves folders and folderId assignments
  const restored = importArchive(exportArchive(updated));
  assert.deepEqual(orderedFolders(restored).map(f => f.name), ['Season 1', 'Season 2']);
  assert.equal(restored.documents[0].folderId, updated.documents[0].folderId);
  assert.equal(restored.documents[2].folderId, updated.documents[2].folderId);
});
