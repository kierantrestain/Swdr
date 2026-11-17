import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export const MAX_FILE_BYTES = 24 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 80 * 1024 * 1024;
const MAX_ENTRIES = 2048;

export function unpack(data: Uint8Array): Record<string, Uint8Array> {
  if (data.length > MAX_FILE_BYTES) throw new Error('This file exceeds the 24 MB import limit.');
  if (data[0] !== 0x50 || data[1] !== 0x4b) throw new Error('This file is not a ZIP-based document.');
  let expanded = 0;
  let entries = 0;
  const seen = new Set<string>();
  return unzipSync(data, {
    filter(entry) {
      const name = entry.name;
      if (++entries > MAX_ENTRIES || seen.has(name) || /^(\/|[A-Za-z]:)|\\|\0/u.test(name) || name.split('/').some(part => part === '..' || part === '__proto__')) {
        throw new Error('The document contains an invalid or duplicate archive path.');
      }
      seen.add(name);
      expanded += entry.originalSize;
      if (expanded > MAX_EXPANDED_BYTES) throw new Error('The unpacked document exceeds the 80 MB limit.');
      return !name.endsWith('/');
    }
  });
}

export function pack(files: Record<string, Uint8Array | string>): Uint8Array {
  let expanded = 0;
  const entries = Object.entries(files).map(([name, content]) => {
    const bytes = typeof content === 'string' ? strToU8(content) : content;
    expanded += bytes.length;
    if (expanded > MAX_EXPANDED_BYTES) throw new Error('The archive contents exceed the 80 MB restore limit.');
    return [name, [bytes, { mtime: new Date(2000, 0, 1) }]] as const;
  });
  if (entries.length > MAX_ENTRIES) throw new Error('The archive contains too many entries.');
  return zipSync(Object.fromEntries(entries.map(([name, [bytes, options]]) => [name, [bytes, options]])), { level: 6 });
}

export function requiredText(files: Record<string, Uint8Array>, path: string): string {
  const bytes = Object.hasOwn(files, path) ? files[path] : undefined;
  if (!bytes) throw new Error('Required archive entry is missing: ' + path);
  return strFromU8(bytes);
}

export function decodeText(data: Uint8Array): string {
  if (data[0] === 0xff && data[1] === 0xfe) return new TextDecoder('utf-16le', { fatal: true }).decode(data);
  if (data[0] === 0xfe && data[1] === 0xff) return new TextDecoder('utf-16be', { fatal: true }).decode(data);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(data);
  if (text.includes('\0')) throw new Error('The file contains binary data instead of text.');
  return text;
}

export function dataUrl(bytes: Uint8Array, mime: string): string {
  const pieces: string[] = [];
  for (let start = 0; start < bytes.length; start += 0x4000) {
    pieces.push(String.fromCharCode(...bytes.subarray(start, start + 0x4000)));
  }
  return 'data:' + mime + ';base64,' + btoa(pieces.join(''));
}

export function dataUrlBytes(value: string): { mime: string; bytes: Uint8Array } {
  const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/=]*)$/i.exec(value);
  if (!match) throw new Error('An attached asset has an unsupported data URL.');
  return { mime: match[1], bytes: Uint8Array.from(atob(match[2]), byte => byte.charCodeAt(0)) };
}
