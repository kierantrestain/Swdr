import type { StyleRange, TextStyle } from '../model';

export interface StyledRun {
  text: string;
  styles: TextStyle[];
}

const ORDER: TextStyle[] = ['bold', 'italic', 'underline'];

/** Splits text into runs that share the same inline styles. */
export function styleRuns(text: string, styles: StyleRange[] = []): StyledRun[] {
  if (!styles.length) return [{ text, styles: [] }];
  const cuts = new Set([0, text.length]);
  for (const range of styles) {
    cuts.add(Math.max(0, Math.min(text.length, range.from)));
    cuts.add(Math.max(0, Math.min(text.length, range.to)));
  }
  const points = [...cuts].sort((a, b) => a - b);
  const runs: StyledRun[] = [];
  for (let index = 0; index < points.length - 1; index++) {
    const [from, to] = [points[index], points[index + 1]];
    if (from === to) continue;
    const active = ORDER.filter(style => styles.some(range => range.style === style && range.from <= from && range.to >= to));
    runs.push({ text: text.slice(from, to), styles: active });
  }
  return runs;
}

/** Joins runs back into text plus merged style ranges. */
export function fromRuns(runs: StyledRun[]): { text: string; styles?: StyleRange[] } {
  let text = '';
  const ranges: StyleRange[] = [];
  for (const run of runs) {
    const start = text.length;
    text += run.text;
    for (const style of run.styles) {
      const open = [...ranges].reverse().find(range => range.style === style);
      if (open && open.to === start) open.to = text.length;
      else ranges.push({ from: start, to: text.length, style });
    }
  }
  return ranges.length ? { text, styles: ranges } : { text };
}

/** Final Draft run style attribute, e.g. "Bold+Italic". */
export function fdxStyle(styles: TextStyle[]): string {
  return styles.map(style => style[0].toUpperCase() + style.slice(1)).join('+');
}

export function fromFdxStyle(value: string | undefined): { styles: TextStyle[]; unsupported: boolean } {
  const parts = (value ?? '').split('+').map(part => part.trim().toLowerCase()).filter(Boolean);
  const styles = ORDER.filter(style => parts.includes(style));
  return { styles, unsupported: parts.some(part => !ORDER.includes(part as TextStyle)) };
}

/** Fountain emphasis: ***bold italic***, **bold**, *italic*, _underline_ (literal * and _ escaped). */
export function toFountainEmphasis(text: string, styles: StyleRange[] = []): string {
  if (!styles.length) return text;
  return styleRuns(text, styles).map(run => {
    const escaped = run.text.replace(/([*_\\])/g, '\\$1');
    if (!run.styles.length || !run.text.trim()) return escaped;
    const stars = (run.styles.includes('bold') ? '**' : '') + (run.styles.includes('italic') ? '*' : '');
    const under = run.styles.includes('underline') ? '_' : '';
    return under + stars + escaped + stars + under;
  }).join('');
}

const EMPHASIS = /(\\[*_])|(_?)(\*{1,3})(?=\S)((?:\\.|[^*\\])+?)(?<=\S)\3\2|(_)(?=\S)((?:\\.|[^_\\])+?)(?<=\S)_/g;

/** Reads Fountain emphasis markers into plain text and style ranges. */
export function fromFountainEmphasis(source: string): { text: string; styles?: StyleRange[] } {
  if (!/[*_]/.test(source)) return { text: source };
  const runs: StyledRun[] = [];
  let last = 0;
  for (const match of source.matchAll(EMPHASIS)) {
    const at = match.index ?? 0;
    if (at > last) runs.push({ text: source.slice(last, at), styles: [] });
    if (match[1]) runs.push({ text: match[1].slice(1), styles: [] });
    else if (match[3]) {
      const stars = match[3].length;
      const styles: TextStyle[] = [];
      if (stars >= 2) styles.push('bold');
      if (stars !== 2) styles.push('italic');
      if (match[2]) styles.push('underline');
      runs.push({ text: match[4].replace(/\\([*_\\])/g, '$1'), styles });
    } else runs.push({ text: match[6].replace(/\\([*_\\])/g, '$1'), styles: ['underline'] });
    last = at + match[0].length;
  }
  if (last < source.length) runs.push({ text: source.slice(last), styles: [] });
  return fromRuns(runs);
}
