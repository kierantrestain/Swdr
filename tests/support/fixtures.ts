import { newBlock, newDocument } from '../../src/model';
import type { Block, DocumentModel } from '../../src/model';
import { paginateDocument } from '../../src/writing/layout';

export const onePixelPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jMioAAAAASUVORK5CYII=';

export function sampleScreenplay(): DocumentModel {
  const document = newDocument('Last Train', 'screenplay');
  document.paper = 'a4';
  document.titlePage = { title: 'Last Train', author: 'Fictional Writer', byline: 'Written by' };
  document.blocks = [
    { ...newBlock('scene', 'INT. SIGNAL ROOM - NIGHT'), sceneNumber: '12A' },
    newBlock('action', 'The glass shivers as the last train passes.'),
    newBlock('character', 'MARA'),
    newBlock('parenthetical', '(in a whisper)'),
    newBlock('dialogue', 'Count the red lamps.'),
    newBlock('transition', 'CUT TO:')
  ];
  return document;
}

export function makeLongScript() {
  const document = newDocument('The Long Feature', 'screenplay');
  const sections: Block[][] = Array.from({ length: 250 }, (_, index) => [
    newBlock('scene', `INT. SIGNAL STATION ${index + 1} - NIGHT`),
    ...Array.from({ length: 16 }, () => newBlock('action', 'Through the window, a thin strip of moonlight moves across the empty track.'))
  ]);
  let count = 120;
  let pages = 0;
  while (count < sections.length) {
    document.blocks = sections.slice(0, count).flat();
    pages = paginateDocument(document).pages.length;
    if (pages >= 168) break;
    count += 10;
  }
  return { document, pages };
}

export function rasterPdf(includeText: boolean): Uint8Array {
  const pageIds = includeText ? [3, 6] : [3];
  const imageStream = '00000000>';
  const textStream = 'BT /F1 12 Tf 1 0 0 1 72 700 Tm (INT. SIGNAL ROOM - NIGHT) Tj ET';
  const imageOperators = 'q 120 0 0 120 72 390 cm /Im0 Do Q';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] >>`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${imageOperators.length} >>\nstream\n${imageOperators}\nendstream`,
    `<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /BitsPerComponent 8 /ColorSpace /DeviceGray /Filter /ASCIIHexDecode /Length ${imageStream.length} >>\nstream\n${imageStream}\nendstream`
  ];
  if (includeText) objects.push(
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 8 0 R >> >> /Contents 7 0 R >>',
    `<< /Length ${textStream.length} >>\nstream\n${textStream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>'
  );
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const start = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}
