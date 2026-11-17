import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { exportPdf } from '../src/interchange/pdf-write';
import { newBlock, newDocument } from '../src/model';
import { lockManuscriptPages, paginateDocument } from '../src/writing/layout';

const manuscript = newDocument('Harbour Lights', 'screenplay');
manuscript.titlePage = { title: 'Harbour Lights', author: 'A Fictional Writer' };
manuscript.blocks = [
  { ...newBlock('scene', 'INT. SIGNAL HOUSE - NIGHT'), sceneNumber: '1' },
  newBlock('action', 'The lantern goes out.'),
  { ...newBlock('character', 'JUNE'), dual: 'left' },
  newBlock('dialogue', 'Wait for dawn.'),
  { ...newBlock('character', 'ROWAN'), dual: 'right' },
  newBlock('dialogue', 'The tide is already turning.'),
  ...Array.from({ length: 72 }, (_, index) => newBlock('action', `The gauge marks level ${index + 1}.`))
];

const revised = {
  ...manuscript,
  lockedPages: lockManuscriptPages(manuscript),
  revisionLabel: 'Blue',
  blocks: [manuscript.blocks[0],
    ...Array.from({ length: 34 }, (_, index) => ({ ...newBlock('action', `An additional note ${index + 1}.`), revision: 'Blue' })),
    ...manuscript.blocks.slice(1)]
};
const cases = [
  ['Letter with title page and dual dialogue', manuscript, '4b5ce2a79f6b8104e6b82563409a0b4a260ec776ae0bfc1d515e9acb1d2dcde6'],
  ['A4 with title page and dual dialogue', { ...manuscript, paper: 'a4' as const }, 'b4fd4288591a9797680e245c061e788a4386e9a2f38606b88eb0f130ab6347c1'],
  ['Locked Blue revision with added pages', revised, 'b90507854ba598fcfc9ec6f49f72a26d4d08001aa54ee3a0ed9668221066711d']
] as const;

for (const [name, document, sha256] of cases) {
  test(`PDF golden keeps exact byte geometry for ${name}`, () => {
    if (document === revised) assert(paginateDocument(revised).pages.some(page => /^1[A-Z]+$/.test(page.label)));
    const rendered = exportPdf(document);
    const hash = createHash('sha256').update(rendered).digest('hex');
    assert.equal(hash, sha256);
  });
}
