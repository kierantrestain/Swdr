import { decodeFountain } from './screenplay';
import type { ScriptConversion } from './screenplay';

const MAX_OBJECTS = 6000;
const MAX_STREAM_SIZE = 8 * 1024 * 1024;

class PdfImportError extends Error {
  readonly name = 'PdfImportError';
  constructor(readonly kind: 'protected' | 'image-only' | 'unsupported', message: string) { super(message); }
}

function latin(data: Uint8Array): string {
  const chunks = [];
  for (let offset = 0; offset < data.length; offset += 0x4000) chunks.push(String.fromCharCode(...data.subarray(offset, offset + 0x4000)));
  return chunks.join('');
}

const winAnsi = new TextDecoder('windows-1252');
const hexBytes = (value: string) => Uint8Array.from(value.replace(/\s/g, '').padEnd(Math.ceil(value.replace(/\s/g, '').length / 2) * 2, '0')
  .match(/.{2}/g)?.map(hex => Number.parseInt(hex, 16)) ?? []);

async function expandStream(body: string): Promise<string | undefined> {
  const marker = /\bstream(?:\r\n|\n|\r)/.exec(body);
  if (!marker) return undefined;
  const header = body.slice(0, marker.index);
  const start = marker.index + marker[0].length;
  const length = /\b\/Length\s+(\d+)\s*(?![\dR])(?=\s*\/|\s*>>)/.exec(header)?.[1] ??
    /\/Length\s+(\d+)(?=\s*(?:>>|\/))/.exec(header)?.[1];
  const end = length && start + Number(length) <= body.length ? start + Number(length) : body.lastIndexOf('endstream');
  if (end < start || end - start > MAX_STREAM_SIZE) return undefined;
  const content = body.slice(start, end);
  if (!/\/Filter\b/.test(header)) return content;
  if (!/\/Filter\s*(?:\/FlateDecode\b|\[\s*\/FlateDecode\s*\])/.test(header) || typeof DecompressionStream !== 'function') return undefined;
  const bytes = Uint8Array.from(content, char => char.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  const chunks: string[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await stream.read();
      if (done) break;
      size += value.length;
      if (size > MAX_STREAM_SIZE) return undefined;
      chunks.push(latin(value));
    }
    return chunks.join('');
  } catch {
    return undefined;
  } finally {
    await stream.cancel().catch(() => undefined);
    stream.releaseLock();
  }
}

function objectMap(source: string): Map<string, string> {
  const objects = new Map<string, string>();
  const headers = [...source.matchAll(/(?:^|[\r\n])\s*(\d+)\s+\d+\s+obj\b/g)];
  if (headers.length > MAX_OBJECTS) throw new PdfImportError('unsupported', 'The PDF is too complex for local text extraction. Export a DOCX or FDX copy.');
  headers.forEach((match, index) => {
    const start = match.index! + match[0].length;
    const window = source.slice(start, headers[index + 1]?.index ?? source.length);
    const end = window.lastIndexOf('endobj');
    if (end >= 0) objects.set(match[1], window.slice(0, end).trim());
  });
  return objects;
}

async function readObjectStreams(objects: Map<string, string>, signal?: AbortSignal) {
  for (const body of [...objects.values()]) {
    signal?.throwIfAborted();
    if (!/\/Type\s*\/ObjStm\b/.test(body.slice(0, 256))) continue;
    const stream = await expandStream(body);
    const first = Number(/\/First\s+(\d+)/.exec(body)?.[1]);
    if (!stream || !Number.isSafeInteger(first) || first < 0 || first > stream.length) continue;
    const list = stream.slice(0, first).trim().split(/\s+/);
    for (let index = 0; index < list.length; index += 2) {
      const offset = Number(list[index + 1]);
      const next = list[index + 3] === undefined ? stream.length - first : Number(list[index + 3]);
      if (objects.size >= MAX_OBJECTS) throw new PdfImportError('unsupported', 'The PDF has too many objects. Export a DOCX or FDX copy.');
      if (offset >= 0 && next > offset && first + next <= stream.length && !objects.has(list[index])) {
        objects.set(list[index], stream.slice(first + offset, first + next).trim());
      }
    }
  }
}

function references(value: string): string[] {
  return [...value.matchAll(/(\d+)\s+\d+\s+R\b/g)].map(match => match[1]);
}

function pagesInOrder(objects: Map<string, string>): Array<[string, string]> {
  const catalog = [...objects.values()].find(body => /^<<[\s\S]*?\/Type\s*\/Catalog\b/.test(body.slice(0, 1400)));
  const root = /\/Pages\s+(\d+)\s+\d+\s+R/.exec(catalog ?? '')?.[1];
  const visited = new Set<string>();
  const pages: Array<[string, string]> = [];
  function visit(id: string, depth: number) {
    if (visited.has(id) || depth > 120) return;
    visited.add(id);
    const item = objects.get(id);
    if (!item) return;
    if (/\/Type\s*\/Page\b/.test(item)) pages.push([id, item]);
    else references(/\/Kids\s*\[([^\]]*)\]/.exec(item)?.[1] ?? '').forEach(child => visit(child, depth + 1));
  }
  if (root) visit(root, 0);
  return pages.length ? pages : [...objects].filter(([, body]) => /\/Type\s*\/Page\b/.test(body.slice(0, 1400)));
}

function unicodeText(hex: string): string {
  const bytes = hexBytes(hex);
  if (bytes.length === 1) return String.fromCharCode(bytes[0]);
  return new TextDecoder('utf-16be').decode(bytes);
}

async function readCmap(body: string): Promise<Map<string, string>> {
  const stream = await expandStream(body);
  const map = new Map<string, string>();
  if (!stream) return map;
  for (const section of stream.matchAll(/beginbfchar\b([\s\S]*?)endbfchar\b/g)) {
    for (const pair of section[1].matchAll(/<([\da-f]+)>\s*<([\da-f]+)>/gi)) map.set(pair[1].toLowerCase(), unicodeText(pair[2]));
  }
  for (const section of stream.matchAll(/beginbfrange\b([\s\S]*?)endbfrange\b/g)) {
    for (const range of section[1].matchAll(/<([\da-f]+)>\s*<([\da-f]+)>\s*(?:<([\da-f]+)>|\[([^\]]*)\])/gi)) {
      const first = Number.parseInt(range[1], 16);
      const last = Number.parseInt(range[2], 16);
      if (last < first || last - first > 4000 || map.size > 20000) continue;
      const alternatives = [...(range[4] ?? '').matchAll(/<([\da-f]+)>/gi)].map(match => match[1]);
      for (let index = first; index <= last && map.size <= 20000; index++) {
        const target = range[3] ? (Number.parseInt(range[3], 16) + index - first).toString(16).padStart(range[3].length, '0') :
          alternatives[index - first];
        if (target) map.set(index.toString(16).padStart(range[1].length, '0'), unicodeText(target));
      }
    }
  }
  return map;
}

interface PdfFont { map: Map<string, string>; identity: boolean }

async function readFonts(body: string, objects: Map<string, string>, cached: Map<string, PdfFont>): Promise<Map<string, PdfFont>> {
  const fonts = new Map<string, PdfFont>();
  const visited = new Set<string>();
  let resource = body;
  for (let depth = 0; depth < 40 && resource; depth++) {
    const resourceId = /\/Resources\s+(\d+)\s+\d+\s+R\b/.exec(resource)?.[1];
    const scope = resourceId ? objects.get(resourceId) ?? '' : resource;
    const fontId = /\/Font\s+(\d+)\s+\d+\s+R\b/.exec(scope)?.[1];
    const dictionary = fontId ? objects.get(fontId) ?? '' : /\/Font\s*<<([\s\S]*?)>>/.exec(scope)?.[1] ?? '';
    for (const entry of dictionary.matchAll(/\/([-\w.]+)\s+(\d+)\s+\d+\s+R/g)) {
      if (fonts.has(entry[1])) continue;
      if (!cached.has(entry[2])) {
        const fontBody = objects.get(entry[2]) ?? '';
        const cmapId = /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(fontBody)?.[1];
        cached.set(entry[2], { identity: /\/Identity-[HV]\b/.test(fontBody), map: cmapId ? await readCmap(objects.get(cmapId) ?? '') : new Map() });
      }
      fonts.set(entry[1], cached.get(entry[2])!);
    }
    const parent = /\/Parent\s+(\d+)\s+\d+\s+R/.exec(resource)?.[1];
    if (!parent || visited.has(parent)) break;
    visited.add(parent);
    resource = objects.get(parent) ?? '';
  }
  return fonts;
}

function decodeGlyphs(bytes: Uint8Array, font?: PdfFont): string {
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  if (!font?.map.size) return font?.identity ? '' : winAnsi.decode(bytes);
  const result = [];
  for (let i = 0; i < bytes.length; i++) {
    const first = bytes[i].toString(16).padStart(2, '0');
    const second = bytes[i + 1]?.toString(16).padStart(2, '0');
    const pair = second === undefined ? undefined : font.map.get(first + second);
    if (pair !== undefined) {
      result.push(pair);
      i++;
    } else {
      result.push(font.map.get(first) ?? (font.identity ? '' : winAnsi.decode(bytes.subarray(i, i + 1))));
    }
  }
  return result.join('');
}

function literal(source: string, start: number): { bytes: Uint8Array; end: number } {
  let depth = 1;
  const chars: number[] = [];
  let end = start + 1;
  const escaped: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12 };
  for (; end < source.length && depth; end++) {
    let char = source[end];
    if (char === '\\') {
      char = source[++end];
      if (char === '\r' && source[end + 1] === '\n') end++;
      if (!char || char === '\n' || char === '\r') continue;
      const octal = /^[0-7]{1,3}/.exec(source.slice(end, end + 3))?.[0];
      if (octal) {
        chars.push(Number.parseInt(octal, 8));
        end += octal.length - 1;
      } else chars.push(escaped[char] ?? char.charCodeAt(0));
    } else {
      if (char === '(') depth++;
      if (char === ')') depth--;
      if (depth) chars.push(char.charCodeAt(0));
    }
  }
  return { bytes: Uint8Array.from(chars), end };
}

interface TextFragment { text: string; x: number; y: number; size: number }

function textFragments(content: string, fonts: Map<string, PdfFont>): TextFragment[] {
  const words = /[-+]?(?:\d+\.\d*|\.\d+|\d+)|\/[-\w.]+|[A-Za-z][A-Za-z0-9*]*|["']/gy;
  const fragments: TextFragment[] = [];
  let args: Array<number | string | Uint8Array> = [];
  let array = false;
  let writing = false;
  let x = 0;
  let y = 0;
  let size = 12;
  let lead = 12;
  let font: PdfFont | undefined;
  let position = 0;
  const number = (index: number, fallback = 0) => typeof args.at(index) === 'number' ? Number(args.at(index)) : fallback;
  while (position < content.length && fragments.length < 100000) {
    const char = content[position];
    if (char === '%') {
      const lineEnd = content.indexOf('\n', position);
      position = lineEnd === -1 ? content.length : lineEnd + 1;
    } else if (char === '(') {
      const parsed = literal(content, position);
      args.push(parsed.bytes);
      position = parsed.end;
    } else if (char === '<' && content[position + 1] !== '<') {
      const end = content.indexOf('>', position + 1);
      if (end < 0) break;
      args.push(hexBytes(content.slice(position + 1, end)));
      position = end + 1;
    } else if (char === '[' || char === ']') {
      array = char === '[';
      position++;
    } else {
      words.lastIndex = position;
      const token = words.exec(content)?.[0];
      if (!token) {
        position++;
        continue;
      }
      position = words.lastIndex;
      if (token.startsWith('/') || /^[+.\d-]/.test(token)) {
        if (args.length < 60000) args.push(token.startsWith('/') ? token.slice(1) : Number(token));
        continue;
      }
      if (array) continue;
      if (token === 'BT') {
        writing = true;
        x = 0;
        y = 0;
      } else if (token === 'ET') {
        writing = false;
      } else if (writing) {
        if (token === 'Tm') {
          x = number(-2);
          y = number(-1);
        } else if (token === 'Td' || token === 'TD') {
          x += number(-2);
          y += number(-1);
          if (token === 'TD') lead = -number(-1);
        } else if (token === 'TL') {
          lead = number(-1, size);
        } else if (token === 'T*') {
          y -= lead;
        } else if (token === 'Tf') {
          font = fonts.get(String(args.at(-2)));
          size = Math.abs(number(-1, 12));
        } else if (['Tj', 'TJ', "'", '"'].includes(token)) {
          if (token === "'" || token === '"') y -= lead;
          const decoded = args.map(item => item instanceof Uint8Array ? decodeGlyphs(item, font) :
            token === 'TJ' && typeof item === 'number' && item < -120 ? ' ' : '').join('');
          // eslint-disable-next-line no-control-regex -- Discard PDF glyph control codes while retaining spaces and line endings.
          const text = decoded.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
          if (text.trim()) fragments.push({ text, x, y, size });
        }
      }
      args = [];
    }
  }
  return fragments;
}

function readLines(fragments: TextFragment[]): string {
  const lines: TextFragment[][] = [];
  for (const item of fragments) {
    const line = lines.at(-1);
    if (line && Math.abs(line[0].y - item.y) < 1.5) line.push(item);
    else lines.push([item]);
  }
  return lines.map((line, index) => {
    const previous = lines[index - 1]?.[0];
    const gap = previous && Math.abs(previous.y - line[0].y) > Math.max(previous.size, line[0].size, 12) * 1.45 ? '\n' : '';
    return gap + line.sort((a, b) => a.x - b.x).map(item => item.text).join(' ');
  }).join('\n');
}

export async function decodePdf(data: Uint8Array, title: string, signal?: AbortSignal): Promise<ScriptConversion> {
  signal?.throwIfAborted();
  const source = latin(data);
  if (!/^\s*%PDF-1\.[0-9]|^\s*%PDF-2\.[0-9]/.test(source)) throw new Error('The file does not contain a PDF document.');
  if (/\/Encrypt\s*(?:\d+\s+\d+\s+R|<<)/.test(source)) {
    throw new PdfImportError('protected', 'This PDF is protected. In the source application, export an authorised unprotected DOCX, FDX or text PDF.');
  }
  const objects = objectMap(source);
  await readObjectStreams(objects, signal);
  const pages = pagesInOrder(objects);
  if (!pages.length) throw new PdfImportError('unsupported', 'The PDF page structure could not be read. Export DOCX, FDX or plain text from its source application.');
  const cachedFonts = new Map<string, PdfFont>();
  const pageText: string[] = [];
  for (const [, body] of pages) {
    signal?.throwIfAborted();
    const contentIds = references(/\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R\b)/.exec(body)?.[1] ?? '');
    const fonts = await readFonts(body, objects, cachedFonts);
    const fragments: TextFragment[] = [];
    for (const id of contentIds) {
      const stream = await expandStream(objects.get(id) ?? '');
      if (stream) fragments.push(...textFragments(stream, fonts));
    }
    pageText.push(readLines(fragments));
  }
  const original = pageText.map((text, index) => text.trim() || '[Page ' + (index + 1) + ' has no extractable text]').join('\n\n');
  if (!pageText.some(text => /\p{L}|\p{N}/u.test(text))) {
    throw new PdfImportError('image-only', 'No editable text was recovered. For a scan, run OCR in your PDF editor, review the result and export DOCX or a searchable PDF.');
  }
  const conversion = decodeFountain(pageText.join('\n\n'), title, true);
  const pageBox = pages.map(([, page]) => /\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/.exec(page)).find(Boolean);
  if (pageBox) {
    const [, x1, y1, x2, y2] = pageBox.map(Number);
    if (Math.abs(x2 - x1 - 595.28) <= 2 && Math.abs(y2 - y1 - 841.89) <= 2) conversion.document.paper = 'a4';
  }
  const emptyPages = pageText.filter(text => !text.trim()).length;
  if (emptyPages) conversion.warnings.push(emptyPages + ' page' + (emptyPages === 1 ? ' has' : 's have') +
    ' no extractable text. Review the original for blank or scanned pages. For missing pages, run OCR or re-export an editable copy before reimporting.');
  conversion.warnings.push('PDF text is reconstructed in text-stream order. Review reading order, screenplay element types and visual formatting.');
  return { ...conversion, original, sourcePages: pages.length };
}
