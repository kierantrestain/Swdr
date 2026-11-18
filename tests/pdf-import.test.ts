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

test('a dialogue-heavy page keeps the action margin and drops a repeating watermark', async () => {
  const { pageLines, repeatedRuns, screenplayFromLines } = await import('../src/interchange/pdf-layout');
  // Geometry measured from a real Celtx export: action 108 pt, dialogue 173 pt, cue 245 pt.
  const page = (index: number) => {
    const runs = [{ text: 'Created using Celtx', x: 230, y: 400, size: 12 }, { text: 'Draft 3', x: 280, y: 760, size: 12 }, { text: 'INT. CONTROL ROOM - NIGHT', x: 108, y: 681, size: 12 }, { text: 'Rain on the glass.', x: 108, y: 655, size: 12 }];
    let y = 629;
    for (let speech = 0; speech < 6; speech++) {
      runs.push({ text: speech % 2 ? 'DANIEL' : 'LEWIS', x: 245, y, size: 12 }, { text: `Line ${index}-${speech} that wraps`, x: 173, y: y - 13, size: 12 }, { text: 'onto a second line.', x: 173, y: y - 26, size: 12 });
      y -= 52;
    }
    return runs;
  };
  const pages = [page(1), page(2), page(3)];
  const skip = repeatedRuns(pages);
  const result = screenplayFromLines(pages.map((runs, index) => pageLines(runs, index, 612, 792, skip)))!;
  const kinds = result.blocks.slice(0, 5).map(block => `${block.kind}:${block.text}`);
  assert.deepEqual(kinds, ['scene:INT. CONTROL ROOM - NIGHT', 'action:Rain on the glass.', 'character:LEWIS', 'dialogue:Line 1-0 that wraps onto a second line.', 'character:DANIEL']);
  assert.ok(!result.blocks.some(block => /Celtx|Draft 3/.test(block.text)));
});
