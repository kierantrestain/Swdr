/**
 * Screenwriting app files that wrap a script SWDR already understands:
 * - Fade In (.fadein): a zip holding Open Screenplay Format XML (document.xml); .osf is that XML on its own.
 * - Highland (.highland): a zip holding the Fountain text.
 * - Celtx desktop (.celtx): a zip holding the script as HTML paragraphs classed by element.
 * - WriterDuet backups (.wdz) and other bundles: read whichever of the above they contain.
 * Each is translated to Final Draft paragraphs and read by the tested FDX importer.
 */
import { strFromU8, unzipSync } from 'fflate';
import { decodeFdx, decodeFountain } from './screenplay';
import type { ScriptConversion } from './screenplay';
import { attr, escapeXml, localName, parseXml, xmlHeader, xmlText } from './xml';
import type { XmlNode } from './xml';

const TYPES: Record<string, string> = {
  'scene heading': 'Scene Heading', sceneheading: 'Scene Heading', slugline: 'Scene Heading', heading: 'Scene Heading',
  action: 'Action', description: 'Action', general: 'Action',
  character: 'Character', dialogue: 'Dialogue', dialog: 'Dialogue', parenthetical: 'Parenthetical',
  transition: 'Transition', shot: 'Shot', 'new act': 'New Act', act: 'New Act', 'end of act': 'End of Act'
};

function fdxType(style: string): string {
  return TYPES[style.trim().toLowerCase().replace(/[_-]+/g, ' ')] ?? TYPES[style.trim().toLowerCase().replace(/[\s_-]+/g, '')] ?? 'Action';
}

function toFdx(paragraphs: Array<{ type: string; text: string }>): string {
  return `${xmlHeader}<FinalDraft DocumentType="Script" Template="No" Version="1"><Content>${paragraphs
    .filter(item => item.text.trim() || item.type === 'Action')
    .map(item => `<Paragraph Type="${item.type}"><Text>${escapeXml(item.text)}</Text></Paragraph>`).join('')}</Content></FinalDraft>`;
}

function walk(node: XmlNode, visit: (node: XmlNode) => void) {
  visit(node);
  for (const child of node.children) if (typeof child !== 'string') walk(child, visit);
}

/** Open Screenplay Format (Fade In): <para><style basestylename="Action"/><text>…</text></para>. */
export function decodeOsf(source: string, title: string): ScriptConversion {
  const root = parseXml(source);
  const paragraphs: Array<{ type: string; text: string }> = [];
  walk(root, node => {
    if (localName(node.tag).toLowerCase() !== 'para') return;
    let style = 'Action';
    let text = '';
    for (const child of node.children) {
      if (typeof child === 'string') continue;
      const name = localName(child.tag).toLowerCase();
      if (name === 'style') style = attr(child, 'basestylename') ?? attr(child, 'basestyle') ?? attr(child, 'stylename') ?? attr(child, 'name') ?? style;
      if (name === 'text') text += xmlText(child);
    }
    paragraphs.push({ type: fdxType(style), text });
  });
  if (!paragraphs.length) throw new Error('The file does not contain Open Screenplay Format paragraphs.');
  return decodeFdx(toFdx(paragraphs), title);
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

function htmlText(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, code: string) => code[0] === '#'
      ? String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1)))
      : ENTITIES[code.toLowerCase()] ?? match)
    .replace(/\s+/g, ' ').trim();
}

/** Celtx desktop scripts: <p class="sceneheading">…</p>, <p class="dialog">…</p> and so on. */
export function decodeCeltxHtml(html: string, title: string): ScriptConversion {
  const paragraphs: Array<{ type: string; text: string }> = [];
  for (const match of html.matchAll(/<p\b[^>]*\bclass\s*=\s*["']?([\w\s-]+)["']?[^>]*>([\s\S]*?)<\/p>/gi)) {
    paragraphs.push({ type: fdxType(match[1].split(/\s+/)[0]), text: htmlText(match[2]) });
  }
  if (!paragraphs.length) throw new Error('The file does not contain a Celtx script.');
  return decodeFdx(toFdx(paragraphs), title);
}

const SCRIPT_CLASSES = /class\s*=\s*["']?(sceneheading|action|character|dialog)\b/i;

/** Opens a screenwriting app bundle and reads the script inside it. */
export function decodeBundle(bytes: Uint8Array, extension: string, title: string): ScriptConversion {
  if (extension === 'osf') return decodeOsf(new TextDecoder().decode(bytes), title);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    // Some exports are the bare XML or HTML rather than a zip.
    const text = new TextDecoder().decode(bytes);
    if (/<para\b/i.test(text)) return decodeOsf(text, title);
    if (SCRIPT_CLASSES.test(text)) return decodeCeltxHtml(text, title);
    if (/<FinalDraft\b/.test(text)) return decodeFdx(text, title);
    throw new Error(unreadable(extension));
  }
  const entries = Object.entries(files).filter(([name]) => !name.endsWith('/') && !name.startsWith('__MACOSX'));
  const named = (pattern: RegExp) => entries.filter(([name]) => pattern.test(name.toLowerCase())).sort((a, b) => b[1].length - a[1].length)[0];
  const text = (entry: [string, Uint8Array]) => strFromU8(entry[1]);

  const fdx = named(/\.fdx$/);
  if (fdx) return decodeFdx(text(fdx), title);
  const osf = named(/(^|\/)document\.xml$|\.osf$/);
  if (osf && /<para\b/i.test(text(osf))) return decodeOsf(text(osf), title);
  const fountain = named(/\.fountain$|(^|\/)text\.(md|txt)$/);
  if (fountain) return decodeFountain(text(fountain), title, false);
  const celtx = entries.filter(([name]) => /\.x?html?$/.test(name.toLowerCase())).map(entry => [entry, text(entry)] as const)
    .filter(([, html]) => SCRIPT_CLASSES.test(html)).sort((a, b) => b[1].length - a[1].length)[0];
  if (celtx) return decodeCeltxHtml(celtx[1], title);
  throw new Error(unreadable(extension));
}

function unreadable(extension: string): string {
  const app = { celtx: 'Celtx', wdz: 'WriterDuet', fadein: 'Fade In', highland: 'Highland', osf: 'Fade In' }[extension] ?? 'the source application';
  return `No script was found inside this ${app} file. In ${app}, export a Final Draft (.fdx), Fountain or Word (.docx) copy and import that instead.`;
}
