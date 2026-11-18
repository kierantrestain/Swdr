import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { decodeBundle, decodeCeltxHtml, decodeOsf } from '../src/interchange/bundles';

const kinds = (conversion: { document: { blocks: Array<{ kind: string; text: string }> } }) =>
  conversion.document.blocks.map(block => [block.kind, block.text]);

const osf = `<?xml version="1.0"?><document type="Open Screenplay Format document" version="40"><paragraphs>
  <para><style basestylename="Scene Heading"/><text>INT. LIGHTHOUSE - NIGHT</text></para>
  <para><style basestylename="Action"/><text>Rain lashes the glass &amp; the lamp turns.</text></para>
  <para><style basestylename="Character"/><text>MARA</text></para>
  <para><style basestylename="Parenthetical"/><text>(quietly)</text></para>
  <para><style basestylename="Dialogue"/><text>Keep it lit.</text></para>
  <para><style basestylename="Transition"/><text>CUT TO:</text></para>
</paragraphs></document>`;

const expected = [
  ['scene', 'INT. LIGHTHOUSE - NIGHT'], ['action', 'Rain lashes the glass & the lamp turns.'], ['character', 'MARA'],
  ['parenthetical', '(quietly)'], ['dialogue', 'Keep it lit.'], ['transition', 'CUT TO:']
];

test('Fade In: bare Open Screenplay Format and the zipped .fadein both import', () => {
  assert.deepEqual(kinds(decodeOsf(osf, 'Lamp')), expected);
  assert.deepEqual(kinds(decodeBundle(strToU8(osf), 'osf', 'Lamp')), expected);
  assert.deepEqual(kinds(decodeBundle(zipSync({ 'document.xml': strToU8(osf) }), 'fadein', 'Lamp')), expected);
});

test('Celtx: the script HTML inside a .celtx project imports by paragraph class', () => {
  const html = `<html><body><p class="sceneheading">INT. LIGHTHOUSE - NIGHT</p><p class="action">Rain lashes the glass &amp; the lamp turns.</p>
    <p class="character">MARA</p><p class="parenthetical">(quietly)</p><p class="dialog">Keep it&nbsp;lit.</p><p class="transition">CUT TO:</p></body></html>`;
  assert.deepEqual(kinds(decodeCeltxHtml(html, 'Lamp')), expected);
  const bundle = zipSync({ 'project.rdf': strToU8('<rdf/>'), 'script-1a2b.html': strToU8(html), 'notes.html': strToU8('<p>notes</p>') });
  assert.deepEqual(kinds(decodeBundle(bundle, 'celtx', 'Lamp')), expected);
});

test('Highland and WriterDuet bundles read the Fountain or FDX they carry, and say what to do otherwise', () => {
  const fountain = 'INT. LIGHTHOUSE - NIGHT\n\nRain lashes the glass.\n\nMARA\nKeep it lit.\n';
  const highland = decodeBundle(zipSync({ 'text.md': strToU8(fountain), 'info.plist': strToU8('<plist/>') }), 'highland', 'Lamp');
  assert.deepEqual(kinds(highland).slice(0, 4), [['scene', 'INT. LIGHTHOUSE - NIGHT'], ['action', 'Rain lashes the glass.'], ['character', 'MARA'], ['dialogue', 'Keep it lit.']]);
  const fdx = '<?xml version="1.0"?><FinalDraft DocumentType="Script" Version="1"><Content><Paragraph Type="Scene Heading"><Text>EXT. PIER - DAY</Text></Paragraph></Content></FinalDraft>';
  assert.deepEqual(kinds(decodeBundle(zipSync({ 'backup/script.fdx': strToU8(fdx) }), 'wdz', 'Pier')), [['scene', 'EXT. PIER - DAY']]);
  assert.throws(() => decodeBundle(zipSync({ 'data.bin': new Uint8Array([1, 2, 3]) }), 'wdz', 'x'), /No script was found inside this WriterDuet file\. In WriterDuet, export a Final Draft/);
});
