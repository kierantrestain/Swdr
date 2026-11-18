import assert from 'node:assert/strict';
import test from 'node:test';
import { decodePdf } from '../src/interchange/pdf-read';
import { exportPdf } from '../src/interchange/pdf-write';
import { isUppercaseElement } from '../src/writing/layout';
import { makeLongScript } from './support/fixtures';

test('a long screenplay PDF imports whole, with element types and joined paragraphs', async () => {
  const { document } = makeLongScript();
  document.showSceneNumbers = true;
  const source = document.blocks.filter(block => block.kind !== 'note' && block.text.trim())
    .map(block => `${block.kind}:${(isUppercaseElement(block.kind) ? block.text.toUpperCase() : block.text).replace(/\s+/g, ' ').trim()}`);
  const result = await decodePdf(exportPdf(document), 'Long');
  const imported = result.document.blocks.map(block => `${block.kind}:${block.text.replace(/\s+/g, ' ').trim()}`);
  assert.equal(result.uncertain.length, 0);
  assert.equal(imported.length, source.length, 'every element comes back as one block');
  const mismatches = imported.filter((line, index) => line !== source[index]);
  assert.deepEqual(mismatches.slice(0, 5), []);
  assert.ok(result.sourcePages! > 100);
});
