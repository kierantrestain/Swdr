import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newBlock, newDocument, newId, sceneList } from '../model';
import type { AVRow, DocumentModel, Project } from '../model';
import { decodeArchiveDocument, exportArchive, importArchive } from './archive';
import { dataUrl, pack } from './container';
import { readImport } from './intake';
import { decodeOdraft } from './odraft';
import { decodeDocx, exportAvDocx, exportDocx } from './office';
import { decodePdf } from './pdf-read';
import { exportPdf, pdfGlyphLoss } from './pdf-write';
import { acceptAvRevision, acceptRevision, reviewAvRevision, reviewRevision } from './reconcile';
import { readRtf } from './rtf';
import { decodeFdx, decodeFountain, exportFdx, exportFountain } from './screenplay';
import { decodeCsv, decodeXlsx, decodeYaml, exportAvCsv, exportAvXlsx, exportAvYaml, tableToAv } from './tabular';

const encode = (text: string) => new TextEncoder().encode(text);
const decode = (data: Uint8Array) => new TextDecoder().decode(data);
const paperFingerprint = (document: DocumentModel) =>
  document.blocks.map(block => [block.kind, block.text, block.sceneNumber, block.dual]);

function script() {
  const document = newDocument('The Crossing', 'screenplay');
  document.paper = 'a4';
  document.titlePage = { title: 'The Crossing', byline: 'Written by', author: 'Joan Martín' };
  document.blocks = [
    { ...newBlock('scene', 'EXT. RIVER - DUSK'), sceneNumber: '14A' },
    newBlock('action', 'A branch bends (then breaks).'),
    { ...newBlock('character', 'JOAN'), dual: 'left' },
    { ...newBlock('dialogue', 'Hold the door.'), dual: 'left' },
    { ...newBlock('character', 'IMANI'), dual: 'right' },
    { ...newBlock('dialogue', 'The lock is gone.'), dual: 'right' }
  ];
  return document;
}

function project(document: DocumentModel): Project {
  const now = '2026-11-17T00:00:00.000Z';
  return { id: newId(), title: 'Synthetic crossing', kind: 'film', synopsis: '', createdAt: now, updatedAt: now,
    episodes: [], documents: [document], snapshots: [], assets: [], modules: {} };
}

test('FDX and Fountain preserve the supported script elements, numbered scene and dual dialogue', () => {
  const document = script();
  const fdx = decodeFdx(exportFdx(document), 'Test').document;
  assert.deepEqual(paperFingerprint(fdx), paperFingerprint(document));
  assert.equal(fdx.paper, 'a4');
  assert.deepEqual(fdx.titlePage, { title: 'The Crossing', byline: 'Written by', author: 'Joan Martín', contact: undefined, draftDate: undefined });
  const fountain = decodeFountain(exportFountain(document), 'Test').document;
  assert.deepEqual(paperFingerprint(fountain), paperFingerprint(document));
  assert.equal(fountain.titlePage?.author, 'Joan Martín');
});

test('Word styles, cue text and paper survive editable DOCX conversion', () => {
  const document = script();
  const result = decodeDocx(exportDocx(document), 'Test', false);
  assert.ok('document' in result);
  assert.deepEqual(result.document.blocks.map(item => [item.kind, item.text, item.sceneNumber]),
    document.blocks.map(item => [item.kind, item.text, item.sceneNumber]));
  assert.equal(result.document.paper, 'a4');
  assert.equal(result.document.titlePage?.author, 'Joan Martín');
});

test('loose Word text flags an editable ambiguous cue and RTF decodes text safely', async () => {
  const word = pack({ 'word/document.xml': '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    '<w:p><w:r><w:t>INT. ROOM - NIGHT</w:t></w:r></w:p><w:p><w:r><w:t>Nora</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>Wait a minute.</w:t></w:r></w:p></w:body></w:document>' });
  const intake = await readImport('Nora.docx', word, 'screenplay');
  assert.ok(intake.type === 'script');
  assert.ok(intake.conversion.uncertain.some(line => line.source === 'Nora'));
  assert.match(readRtf(String.raw`{\rtf1\ansi Nora\par Caf\'e9.}`), /Nora\s+Café\./u);
  assert.equal(intake.source.name, 'Nora.docx');
});

test('PDF uses shared exact Letter or A4 geometry, emits selectable text and reports glyph limits', async () => {
  const document = script();
  const a4 = exportPdf(document);
  assert.match(decode(a4), /\/MediaBox \[0 0 595\.27559 841\.88976\]/u);
  const letter = exportPdf({ ...document, paper: 'letter', titlePage: undefined });
  assert.match(decode(letter), /\/MediaBox \[0 0 612 792\]/u);
  const incoming = await decodePdf(letter, 'Test');
  assert.ok(incoming.original.includes('A branch bends (then breaks).'));
  assert.equal(incoming.sourcePages, 1);
  assert.equal((await decodePdf(a4, 'Test')).document.paper, 'a4');
  assert.equal(pdfGlyphLoss({ ...document, blocks: [newBlock('action', '未完成')] }), true);
  assert.equal(pdfGlyphLoss(document), false);
});

test('scan-only and protected PDF imports contain recovery paths, mixed pages get a warning', async () => {
  const headers = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  const blank = '3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n';
  await assert.rejects(decodePdf(encode(headers + '2 0 obj\n<< /Type /Pages /Kids [3 0 R] >>\nendobj\n' + blank), 'Scan'), /run OCR/i);
  await assert.rejects(decodePdf(encode(headers + 'trailer\n<< /Encrypt 8 0 R >>'), 'Protected'), /protected/i);
  const mixed = encode(headers + '2 0 obj\n<< /Type /Pages /Kids [3 0 R 4 0 R] >>\nendobj\n' + blank +
    '4 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 5 0 R >>\nendobj\n' +
    '5 0 obj\n<< >>\nstream\nBT 1 0 0 1 100 700 Tm (Edge of the river) Tj ET\nendstream\nendobj\n');
  const result = await decodePdf(mixed, 'Mixed');
  assert.equal(result.sourcePages, 2);
  assert.match(result.original, /Page 1 has no extractable text/u);
  assert.match(result.warnings.join(' '), /1 page has no extractable text/u);
});

test('AV table formats preserve the supported cells and 60-second duration', () => {
  const rows: AVRow[] = [
    { id: newId(), video: 'River, wide', audio: 'Wind\nQuiet', durationSeconds: 19 },
    { id: newId(), video: 'Bridge camera', audio: 'VO "We cross"', durationSeconds: 41, cueSeconds: 19 }
  ];
  const selection = ({ video, audio, durationSeconds, cueSeconds }: AVRow) => ({ video, audio, durationSeconds, cueSeconds });
  const word = decodeDocx(exportAvDocx(rows, 'letter'), 'Test', true);
  assert.ok('headers' in word);
  for (const source of [decodeCsv(exportAvCsv(rows)), decodeYaml(exportAvYaml(rows)), decodeXlsx(exportAvXlsx(rows)), word]) {
    const converted = tableToAv(source, 'AV');
    assert.deepEqual(converted.missing, []);
    assert.deepEqual(converted.document.avRows.map(selection), rows.map(selection));
    assert.equal(converted.document.avRows.reduce((time, row) => time + row.durationSeconds, 0), 60);
  }
});

test('scene review preserves moved identities, original text anchors and locked page anchors', () => {
  const previous = script();
  const second = newBlock('scene', 'INT. STORE - DAY');
  previous.blocks.push(second, newBlock('action', 'The till rings.'));
  const originalScene = previous.blocks[0];
  const exact = previous.blocks[1];
  const incoming = newDocument('The Crossing', 'screenplay');
  const moved = newBlock('scene', second.text);
  const still = newBlock('scene', originalScene.text);
  incoming.blocks = [moved, newBlock('action', 'The till rings.'), still,
    newBlock('action', 'A light flickers.'), newBlock('action', exact.text), newBlock('scene', 'EXT. FERRY - DAY')];
  incoming.lockedPages = [{ label: '2', firstBlockId: still.id }];
  const review = reviewRevision(previous, incoming);
  assert.ok(review.matches.some(item => item.moved));
  assert.ok(review.matches.some(item => item.edited));
  assert.ok(review.matches.some(item => item.outcome === 'added'));
  const restored = acceptRevision(previous, incoming, review);
  assert.deepEqual(sceneList(restored).slice(0, 2).map(item => item.id), [second.sceneId, originalScene.sceneId]);
  assert.equal(restored.blocks[4].id, exact.id);
  assert.equal(restored.lockedPages?.[0].firstBlockId, originalScene.id);
  assert.notEqual(restored.revisionId, previous.revisionId);
});

test('AV revision review retains moved cue and storyboard identities', () => {
  const previous = newDocument('AV revised', 'av');
  const a = { id: newId(), video: 'Photo', audio: 'Intro', durationSeconds: 20, storyboardAssetId: newId() };
  const b = { id: newId(), video: 'Footage', audio: 'Outro', durationSeconds: 40 };
  previous.avRows = [a, b];
  const incoming = newDocument('AV revised', 'av');
  incoming.avRows = [{ ...b, id: newId() }, { ...a, id: newId(), durationSeconds: 21, storyboardAssetId: undefined }];
  const reviewed = reviewAvRevision(previous, incoming);
  assert.equal(reviewed.matches[1].edited, true);
  assert.equal(reviewed.matches[1].moved, true);
  const revised = acceptAvRevision(previous, incoming, reviewed);
  assert.equal(revised.avRows[1].id, a.id);
  assert.equal(revised.avRows[1].storyboardAssetId, a.storyboardAssetId);
});

test('SWDR archive keeps original assets, immutable snapshots and stored source references', () => {
  const document = script();
  const original = project(document);
  const sourceId = newId();
  original.assets.push({ id: sourceId, mime: 'text/plain', name: 'first.txt',
    dataUrl: dataUrl(encode('Original text'), 'text/plain'), addedAt: original.createdAt });
  original.snapshots.push({ id: newId(), kind: 'issued', label: 'First issue', createdAt: original.createdAt, document: structuredClone(document) });
  original.documents[0] = { ...document, revisionId: newId() };
  original.modules = { series: { source: { projectId: original.id, documentId: document.id,
    revisionId: document.revisionId, sceneId: document.blocks[0].sceneId, blockId: document.blocks[0].id } } };
  const restored = importArchive(exportArchive(original));
  assert.deepEqual(restored, JSON.parse(JSON.stringify(original)));
  assert.deepEqual(decodeArchiveDocument(restored, document.id, document.revisionId), JSON.parse(JSON.stringify(document)));
  const bad = structuredClone(original);
  bad.documents[0].lockedPages = [{ label: '2', firstBlockId: newId() }];
  assert.throws(() => importArchive(exportArchive(bad)), /missing block/i);
});

test('source-conforming OpenDraft AV document recovers its cue and embedded image references', () => {
  const asText = (value: string) => ({ type: 'paragraph', content: [{ type: 'text', text: value }] });
  const odraft = { format: 'opendraft-script', odraft_version: 2,
    meta: { title: 'Recovered AV' }, assets: [{ id: 'a1', filename: 'story.png', mime_type: 'image/png', data_base64: 'aW1hZ2U=' }],
    content: { type: 'doc', content: [{ type: 'avBlock', content: [{ type: 'avRow', attrs: { duration: '0:15', start: 8 },
      content: [{ type: 'avCell', content: [asText('Camera'), { type: 'avImage', attrs: { assetId: 'a1' } }] },
        { type: 'avCell', content: [asText('Speech')] }] }] }] } };
  const imported = decodeOdraft(JSON.stringify(odraft), 'Test');
  assert.equal(imported.document.kind, 'av');
  assert.equal(imported.document.avRows[0].durationSeconds, 15);
  assert.equal(imported.document.avRows[0].cueSeconds, 8);
  assert.equal(imported.document.avRows[0].storyboardAssetId, imported.relatedAssets[0].id);
});

test('invalid, unsupported and cancelled intake does not produce an editable draft', async () => {
  const cancel = new AbortController();
  cancel.abort();
  await assert.rejects(readImport('cancel.txt', encode('Text'), 'screenplay', cancel.signal), { name: 'AbortError' });
  await assert.rejects(readImport('bad.fdx', encode('<bad/>'), 'screenplay'), /Final Draft/i);
  await assert.rejects(readImport('legacy.wdz', encode('Data'), 'screenplay'), /editable.*Final Draft/i);
  await assert.rejects(readImport('bad.txt', Uint8Array.from([0xff, 0xff]), 'screenplay'));
});
