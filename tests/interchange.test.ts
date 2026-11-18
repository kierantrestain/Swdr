import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { newBlock, newDocument, newId, sceneList, sourceFor } from '../src/model';
import { createProject, issueDocument, resolveSource } from '../src/workspace/project';
import { exportArchive, importArchive } from '../src/interchange/archive';
import { readImport } from '../src/interchange/intake';
import { exportAvDocx, exportDocx } from '../src/interchange/office';
import { exportPdf } from '../src/interchange/pdf-write';
import { acceptRevision, reviewRevision } from '../src/interchange/reconcile';
import { exportFdx, exportFountain } from '../src/interchange/screenplay';
import { exportAvCsv, exportAvXlsx, exportAvYaml, tableToAv } from '../src/interchange/tabular';
import { lockManuscriptPages, paginateDocument, revisionInk } from '../src/writing/layout';
import { timedRows } from '../src/writing/av-timing';
import { onePixelPng, rasterPdf, sampleScreenplay } from './support/fixtures';

const encoder = new TextEncoder();

test('FDX, Fountain and DOCX carry editable screenplay elements and scene numbers', async () => {
  const document = sampleScreenplay();
  const formats = [
    ['fixture.fdx', encoder.encode(exportFdx(document))],
    ['fixture.fountain', encoder.encode(exportFountain(document))],
    ['fixture.docx', exportDocx(document)]
  ] as const;
  for (const [name, bytes] of formats) {
    const imported = await readImport(name, bytes, 'screenplay');
    assert.equal(imported.type, 'script', name);
    const roundTrip = imported.conversion.document;
    assert.equal(roundTrip.titlePage?.title, 'Last Train', name);
    assert.equal(roundTrip.titlePage?.author, 'Fictional Writer', name);
    assert.equal(roundTrip.blocks.find(block => block.kind === 'scene')?.sceneNumber, '12A', name);
    assert.deepEqual(roundTrip.blocks.filter(block => ['scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition'].includes(block.kind))
      .map(({ kind, text }) => ({ kind, text })), document.blocks.map(({ kind, text }) => ({ kind, text })), name);
    assert(imported.source.dataUrl.startsWith('data:'), name);
  }
});

test('PDF stream and MediaBox goldens keep both page sizes and locked revision labels', async () => {
  const document = sampleScreenplay();
  document.blocks.push(...Array.from({ length: 95 }, (_, index) => newBlock('action', `Beat ${index}.`)));
  const locked = lockManuscriptPages(document);
  const a4 = {
    ...document, lockedPages: locked, revisionLabel: 'Blue',
    blocks: [...document.blocks.slice(0, 1), ...Array.from({ length: 50 }, (_, index) => ({
      ...newBlock('action', `Added beat ${index}.`), revision: 'Blue'
    })), ...document.blocks.slice(1)]
  };
  const pdf = exportPdf(a4);
  const source = new TextDecoder().decode(pdf);
  const a4Boxes = [...source.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map(match => [Number(match[1]), Number(match[2])]);
  assert.equal(a4Boxes.length, paginateDocument(a4).pages.length);
  assert(a4Boxes.every(([width, height]) => width === 595.27559 && height === 841.88976));
  assert.match(source, /\/BaseFont \/Courier \/Encoding \/WinAnsiEncoding/);
  assert.match(source, /\/F1 12 Tf/);
  assert.match(source, /\(1A\.\) Tj/);
  const revisedInk = revisionInk('Blue');
  assert(revisedInk);
  const blue = [1, 3, 5].map(offset => Number((parseInt(revisedInk.slice(offset, offset + 2), 16) / 255).toFixed(5))).join(' ');
  assert(source.includes(`/F1 12 Tf ${blue} rg`));
  const letter = sampleScreenplay();
  const letterPdf = exportPdf({ ...letter, paper: 'letter' });
  assert.match(new TextDecoder().decode(letterPdf), /\/MediaBox \[0 0 612 792\]/);
  const imported = await readImport('text-layer.pdf', letterPdf, 'screenplay');
  assert.equal(imported.type, 'script');
  assert(imported.conversion.document.blocks.some(block => block.text.includes('Count the red lamps.')));
});

test('PDF intake distinguishes a scan, mixed text, protected data and an invalid file', async () => {
  await assert.rejects(readImport('scan.pdf', rasterPdf(false), 'screenplay'), /editable text|OCR/i);
  const mixed = await readImport('mixed.pdf', rasterPdf(true), 'screenplay');
  assert.equal(mixed.type, 'script');
  assert.equal(mixed.conversion.sourcePages, 2);
  assert(mixed.conversion.warnings.some(warning => /no extractable text/i.test(warning)));
  const protectedPdf = encoder.encode(new TextDecoder().decode(rasterPdf(false)).replace('/Root 1 0 R', '/Root 1 0 R /Encrypt 9 0 R'));
  await assert.rejects(readImport('protected.pdf', protectedPdf, 'screenplay'), /protected/i);
  await assert.rejects(readImport('broken.pdf', encoder.encode('this is not a PDF'), 'screenplay'), /PDF document/i);
  await assert.rejects(readImport('stale.wdz', encoder.encode('synthetic, unsupported'), 'screenplay'), /No script was found inside this WriterDuet file.*export a Final Draft/i);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(readImport('cancel.fountain', encoder.encode('INT. ROOM - DAY'), 'screenplay', abort.signal), { name: 'AbortError' });
  const retry = await readImport('cancel.fountain', encoder.encode('INT. ROOM - DAY'), 'screenplay');
  assert.equal(retry.type, 'script');
});

test('maps AV fields through CSV, XLSX, YAML and a two-column DOCX', async () => {
  const rows = [
    { id: newId(), video: 'Pan across the room.', audio: 'LIVE: Presenting from the platform.', durationSeconds: 15, cueSeconds: 0 },
    { id: newId(), video: 'Cut to the map.', audio: 'Voiceover with comma, and a quote “here”.', durationSeconds: 45, cueSeconds: 15 }
  ];
  for (const [name, bytes] of [
    ['timing.csv', encoder.encode(exportAvCsv(rows))],
    ['timing.xlsx', exportAvXlsx(rows)],
    ['timing.yaml', encoder.encode(exportAvYaml(rows))],
    ['timing.docx', exportAvDocx(rows, 'letter')]
  ] as const) {
    const imported = await readImport(name, bytes, 'av');
    assert.equal(imported.type, 'av', name);
    const conversion = tableToAv(imported.table, imported.title).document;
    assert.deepEqual(conversion.avRows.map(row => [row.video, row.audio]), rows.map(row => [row.video, row.audio]), name);
    if (!name.endsWith('.docx')) assert.equal(timedRows(conversion.avRows).durationSeconds, 60, name);
  }
});

test('archive restores an asset, revision and exact source link into a blank workspace', async () => {
  const project = createProject('Wide Awake', 'film');
  const document = sampleScreenplay();
  project.documents = [document];
  const asset = { id: newId(), name: 'storyboard.png', mime: 'image/png', dataUrl: `data:image/png;base64,${onePixelPng}`, addedAt: new Date().toISOString() };
  project.assets = [asset];
  const issued = issueDocument(project, document.id, 'Shooting draft');
  const reference = sourceFor(issued.project, issued.snapshot.document, { sceneId: sceneList(document)[0].id, blockId: document.blocks[4].id });
  issued.project.modules = { test: { source: reference, assetId: asset.id } };
  const restored = importArchive(exportArchive(issued.project));
  assert.equal(restored.id, project.id);
  assert.equal(restored.assets[0].dataUrl, asset.dataUrl);
  assert.deepEqual(restored.modules.test, JSON.parse(JSON.stringify(issued.project.modules.test)));
  assert.deepEqual(restored.snapshots[0].document.blocks, issued.snapshot.document.blocks);
  assert.equal(resolveSource(restored, reference)?.blocks.find(block => block.id === reference.blockId)?.text, 'Count the red lamps.');
});

test('reimport previews added, omitted, moved and edited scenes while retaining approved identifiers', () => {
  const previous = newDocument('Harbour', 'screenplay');
  previous.blocks = [
    newBlock('scene', 'INT. OFFICE - DAY'), newBlock('action', 'A report lands on the desk.'),
    newBlock('scene', 'EXT. PAVEMENT - NIGHT'), newBlock('action', 'In the rain.'),
    newBlock('scene', 'EXT. HARBOUR - DAY'), newBlock('action', 'Wind from the North.')
  ];
  const incoming = newDocument('Harbour', 'screenplay');
  incoming.blocks = [
    newBlock('scene', 'EXT. HARBOUR - DAY'), newBlock('action', 'Wind from the West.'),
    newBlock('scene', 'INT. OFFICE - DAY'), newBlock('action', 'A report lands on the desk.'),
    newBlock('scene', 'INT. RECORD STORE - NIGHT'), newBlock('action', 'Someone turns the key.')
  ];
  const preview = reviewRevision(previous, incoming);
  assert.equal(preview.omitted[0]?.heading, 'EXT. PAVEMENT - NIGHT');
  assert(preview.matches.some(match => match.moved));
  assert(preview.matches.some(match => match.edited && match.incoming.heading === 'EXT. HARBOUR - DAY'));
  assert(preview.matches.some(match => match.outcome === 'added'));
  const accepted = acceptRevision(previous, incoming, preview);
  assert.equal(accepted.id, previous.id);
  assert.notEqual(accepted.revisionId, previous.revisionId);
  assert.equal(sceneList(accepted)[0].id, sceneList(previous)[2].id);
  assert.equal(accepted.blocks[1].id, previous.blocks[5].id);
  assert.equal(accepted.blocks[1].text, 'Wind from the West.');
});
