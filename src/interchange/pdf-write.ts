import type { DocumentModel } from '../model';
import { geometryFor, paginateDocument, revisionInk, wrapManuscriptText } from '../writing/layout';
import type { LaidOutLine, PageGeometry, WritingPage } from '../writing/layout';
import { timedRows, timingLabel } from '../writing/av-timing';

const winAnsi = new TextDecoder('windows-1252');
const encoding = new Map(Array.from({ length: 256 }, (_, byte) => [winAnsi.decode(Uint8Array.of(byte)), byte]));

function pdfText(text: string): string {
  return '(' + [...text].map(character => {
    const byte = encoding.get(character) ?? 63;
    return byte < 32 || byte >= 127 ? '\\' + byte.toString(8).padStart(3, '0') :
      '()\\'.includes(character) ? '\\' + character : character;
  }).join('') + ')';
}

const decimal = (value: number) => Number(value.toFixed(5));
function color(label?: string): string {
  const ink = revisionInk(label);
  if (!ink) return '0 0 0';
  return [1, 3, 5].map(index => decimal(Number.parseInt(ink.slice(index, index + 2), 16) / 255)).join(' ');
}

function lineCommands(line: LaidOutLine, geometry: PageGeometry): string {
  const width = Array.from(line.text).length * geometry.glyphWidth;
  const shift = line.align === 'right' ? line.width - width : line.align === 'center' ? (line.width - width) / 2 : 0;
  return 'BT /F1 ' + geometry.fontSize + ' Tf ' + color(line.revision) + ' rg 1 0 0 1 ' +
    decimal(line.x + shift) + ' ' + decimal(geometry.height - line.y) + ' Tm ' + pdfText(line.text) + ' Tj ET';
}

function layoutAv(document: DocumentModel): { geometry: PageGeometry; pages: WritingPage[] } {
  const geometry = { ...geometryFor(document.paper), fontSize: 10, glyphWidth: 6, left: 40, right: 40, top: 42, bottom: 42 };
  const available = geometry.width - geometry.left - geometry.right;
  const timeBox = 132;
  const gap = 18;
  const column = (available - timeBox - 2 * gap) / 2;
  const timed = timedRows(document.avRows);
  const pages: WritingPage[] = [];
  let lines: LaidOutLine[] = [];
  let y = geometry.top;
  function add(text: string, x: number, width: number, rowY: number, blockId = '') {
    lines.push({ kind: 'action', align: 'left', blockId, text, x, y: rowY, width });
  }
  const maxWidth = Math.floor(column / geometry.glyphWidth);
  function nextPage() {
    lines = [];
    pages.push({ label: String(pages.length + 1), lines });
    y = geometry.top;
    const title = document.title.slice(0, 55) + (pages.length > 1 ? ' (continued)' : '');
    add(title, geometry.left, available, y);
    y += 26;
    add('TIMECODE', geometry.left, timeBox, y);
    add('VIDEO', geometry.left + timeBox + gap, column, y);
    add('AUDIO', geometry.left + timeBox + 2 * gap + column, column, y);
    y += 22;
  }
  nextPage();
  for (const row of timed.rows) {
    const video = wrapManuscriptText(row.video, maxWidth);
    const audio = wrapManuscriptText(row.audio, maxWidth);
    const count = Math.max(video.length, audio.length);
    for (let index = 0; index < count; index++) {
      const acrossPage = y > geometry.height - geometry.bottom;
      if (acrossPage) nextPage();
      if (index === 0 || acrossPage) {
        const label = timingLabel(row.startSeconds) + '–' + timingLabel(row.endSeconds);
        const timeLines = wrapManuscriptText(acrossPage && index ? 'Continued ' + label : label, Math.floor(timeBox / geometry.glyphWidth));
        timeLines.forEach((time, number) => add(time, geometry.left, timeBox, y + number * geometry.lineHeight, row.id));
        if (video[index] !== undefined) add(video[index], geometry.left + timeBox + gap, column, y, row.id);
        if (audio[index] !== undefined) add(audio[index], geometry.left + timeBox + 2 * gap + column, column, y, row.id);
        y += Math.max(1, timeLines.length) * geometry.lineHeight;
      } else {
        if (video[index] !== undefined) add(video[index], geometry.left + timeBox + gap, column, y, row.id);
        if (audio[index] !== undefined) add(audio[index], geometry.left + timeBox + 2 * gap + column, column, y, row.id);
        y += geometry.lineHeight;
      }
    }
    y += 12;
  }
  if (y > geometry.height - geometry.bottom) nextPage();
  add('TOTAL RUNTIME  ' + timingLabel(timed.durationSeconds), geometry.left, available, y);
  return { geometry, pages };
}

export function pdfGlyphLoss(document: DocumentModel): boolean {
  const { pages } = document.kind === 'av' ? layoutAv(document) : paginateDocument(document);
  return pages.some(page => page.lines.some(line => [...line.text].some(character => !encoding.has(character))));
}

export function exportPdf(document: DocumentModel): Uint8Array {
  const { geometry, pages } = document.kind === 'av' ? layoutAv(document) : paginateDocument(document);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count ' + pages.length + ' /Kids [' + pages.map((_, index) => (4 + index * 2) + ' 0 R').join(' ') + '] >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>'
  ];
  for (const page of pages) {
    const stream = page.lines.map(line => lineCommands(line, geometry)).join('\n');
    const contents = objects.length + 2;
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + decimal(geometry.width) + ' ' + decimal(geometry.height) + ']' +
      ' /Resources << /Font << /F1 3 0 R >> >> /Contents ' + contents + ' 0 R >>');
    objects.push('<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream');
  }
  const parts: string[] = ['%PDF-1.4\n'];
  const offsets: number[] = [];
  let length = parts[0].length;
  objects.forEach((value, index) => {
    offsets.push(length);
    const item = (index + 1) + ' 0 obj\n' + value + '\nendobj\n';
    parts.push(item);
    length += item.length;
  });
  parts.push('xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n' +
    offsets.map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('') +
    'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + length + '\n%%EOF\n');
  return new TextEncoder().encode(parts.join(''));
}
