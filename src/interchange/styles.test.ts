import assert from 'node:assert/strict';
import test from 'node:test';
import { newBlock, newDocument } from '../model';
import type { Block } from '../model';
import { decodeFdx, decodeFountain, exportFdx, exportFountain } from './screenplay';
import { fromFountainEmphasis, toFountainEmphasis } from './styles';

function styledScript() {
  const document = newDocument('Styled', 'screenplay');
  const scene = newBlock('scene', 'INT. SIGNAL BOX - NIGHT');
  const action: Block = { ...newBlock('action', 'She pulls the red lever and waits.'), styles: [
    { from: 14, to: 17, style: 'bold' }, { from: 18, to: 23, style: 'italic' }, { from: 28, to: 33, style: 'underline' }
  ] };
  const cue = newBlock('character', 'ADA');
  const line: Block = { ...newBlock('dialogue', 'Never the red one.'), styles: [{ from: 6, to: 17, style: 'bold' }, { from: 6, to: 17, style: 'italic' }] };
  document.blocks = [scene, action, cue, line];
  return document;
}

const styled = (blocks: Block[]) => blocks.filter(block => block.styles).map(block => ({ text: block.text, styles: block.styles }));

test('bold, italic and underline survive an FDX round trip as Final Draft text runs', () => {
  const source = styledScript();
  const xml = exportFdx(source);
  assert.match(xml, /<Text Style="Bold">red<\/Text>/);
  assert.match(xml, /<Text Style="Bold\+Italic">the red one<\/Text>/);
  const result = decodeFdx(xml, 'Styled');
  assert.deepEqual(styled(result.document.blocks), styled(source.blocks));
  assert.ok(!result.warnings.some(warning => /text styles/.test(warning)));
});

test('unstyled paragraphs keep a single FDX text run', () => {
  const document = newDocument('Plain', 'screenplay');
  document.blocks = [newBlock('action', 'Plain text.')];
  assert.match(exportFdx(document), /<Paragraph Type="Action"><Text>Plain text\.<\/Text><\/Paragraph>/);
});

test('styles survive a Fountain round trip using emphasis markers', () => {
  const source = styledScript();
  const text = exportFountain(source);
  assert.match(text, /!She pulls the \*\*red\*\* \*lever\* and _waits_\./);
  assert.match(text, /Never \*\*\*the red one\*\*\*\./);
  const result = decodeFountain(text, 'Styled');
  assert.deepEqual(styled(result.document.blocks), styled(source.blocks));
});

test('Fountain emphasis leaves unpaired and escaped markers as literal text', () => {
  assert.deepEqual(fromFountainEmphasis('Save file_name to disk'), { text: 'Save file_name to disk' });
  assert.deepEqual(fromFountainEmphasis('Five \\*stars\\* only'), { text: 'Five *stars* only' });
  assert.deepEqual(fromFountainEmphasis('2 * 3 = 6'), { text: '2 * 3 = 6' });
  const literal = toFountainEmphasis('a*b', [{ from: 0, to: 1, style: 'bold' }]);
  assert.equal(literal, '**a**\\*b');
  assert.deepEqual(fromFountainEmphasis(literal), { text: 'a*b', styles: [{ from: 0, to: 1, style: 'bold' }] });
});

test('a styled script prints bold and italic faces and underlines in the PDF', async () => {
  const { exportPdf } = await import('./pdf-write');
  const pdf = new TextDecoder().decode(exportPdf(styledScript()));
  for (const face of ['Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique']) assert.match(pdf, new RegExp('/BaseFont /' + face + ' '));
  assert.match(pdf, /\/F2 12 Tf [^\n]*\(red\) Tj/);
  assert.match(pdf, /\/F3 12 Tf [^\n]*\(lever\) Tj/);
  assert.match(pdf, /\/F4 12 Tf [^\n]*\(the red one\) Tj/);
  assert.match(pdf, / re f/);
});
