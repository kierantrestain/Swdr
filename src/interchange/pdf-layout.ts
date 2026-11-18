import type { BlockKind } from '../model';

/** A positioned text run from a PDF page (PDF points, origin bottom-left). */
export interface PositionedText { text: string; x: number; y: number; size: number }
export interface PdfLine { text: string; x: number; y: number; size: number; page: number }
export interface LaidOutScript { blocks: { kind: BlockKind; text: string }[]; title?: string[] }

const SCENE_START = /^(?:INT|EXT|EST|INT\.?\/EXT|EXT\.?\/INT|I\/E)[.\s]/i;
const TRANSITION = /^(?:[A-Z0-9 .'’-]+ TO:|FADE (?:IN|OUT)[.:]|FADE TO BLACK\.|CUT TO BLACK\.|SMASH CUT:?|DISSOLVE:)$/;
const FURNITURE = /^(?:\(?CONTINUED\)?:?|CONTINUED: ?\(\d+\)|\(MORE\))$/i;
const CONTD = /\s*\((?:CONT['’]D|CONTINUED)\)\s*$/i;

/** Groups runs into lines and drops margin scene numbers, page numbers and revision marks. */
/** Text repeated at the same place on most pages (watermarks, running headers) is furniture. */
export function repeatedRuns(pages: PositionedText[][], height = 792): Set<string> {
  const seen = new Map<string, number>();
  for (const runs of pages) {
    // Only the header and footer bands: body lines can legitimately repeat (a frequent cue).
    const bands = runs.filter(run => run.y > height - 72 || run.y < 72);
    for (const key of new Set(bands.map(runKey))) seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return new Set([...seen.entries()].filter(([, count]) => pages.length >= 3 && count >= pages.length * 0.6).map(([key]) => key));
}

/** Export watermarks such as "Created using Celtx" are never script text. */
const WATERMARK = /^(?:created|made|written|exported) (?:using|with|in) [\w .-]{2,30}$/i;

function runKey(run: PositionedText): string {
  return `${Math.round(run.y / 4)}|${run.text.trim()}`;
}

export function pageLines(runs: PositionedText[], page: number, width: number, height: number, skip = new Set<string>()): PdfLine[] {
  const rows: PositionedText[][] = [];
  for (const run of [...runs].filter(item => !skip.has(runKey(item)) && !WATERMARK.test(item.text.trim())).sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find(line => Math.abs(line[0].y - run.y) < 1.5);
    if (row) row.push(run); else rows.push([run]);
  }
  const lines: PdfLine[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    const body = row.filter(run => {
      const bare = run.text.trim();
      if (!bare) return false;
      if (/^\*+$/.test(bare) && run.x > width * 0.7) return false;
      if (/^\d+[A-Z]{0,2}\.?$/.test(bare) && (run.x < width * 0.17 || run.x > width * 0.8)) return false;
      return true;
    });
    if (!body.length) continue;
    let text = '';
    let end = body[0].x;
    for (const run of body) {
      const glyph = run.size * 0.6;
      if (text && run.x - end > glyph * 0.5 && !/\s$/.test(text) && !/^\s/.test(run.text)) text += ' ';
      text += run.text;
      end = run.x + run.text.length * glyph;
    }
    const lead = body[0].text.length - body[0].text.trimStart().length;
    const clean = text.trim().replace(/\s{2,}/g, ' ');
    // Page numbers in the header or footer are page furniture, not script text.
    if ((row[0].y > height - 66 || row[0].y < 54) && /^\d+\.?$/.test(clean)) continue;
    lines.push({ text: clean, x: body[0].x + lead * body[0].size * 0.6, y: row[0].y, size: row[0].size, page });
  }
  return lines;
}

/**
 * Screenplay PDFs encode each element by its indent from the action margin:
 * action/scene 0", dialogue ~1", parenthetical ~1.5", character ~2", transition right.
 * Wrapped lines of one element are joined; speeches split across pages are rejoined.
 */
export function screenplayFromLines(pages: PdfLine[][]): LaidOutScript | null {
  const all = pages.flat();
  if (all.length < 8) return null;
  const counts = new Map<number, number>();
  for (const line of all) counts.set(Math.round(line.x), (counts.get(Math.round(line.x)) ?? 0) + 1);
  // The action margin is the leftmost indent in regular use. (The most common indent can be
  // the dialogue column in a dialogue-heavy script.)
  const left = Math.min(...[...counts.entries()].filter(([, count]) => count >= Math.max(3, all.length * 0.03)).map(([x]) => x));
  const blocks: LaidOutScript['blocks'] = [];
  let title: string[] | undefined;
  let previous: { line: PdfLine; kind: BlockKind } | null = null;
  let speaker = '';
  pages.forEach((lines, pageIndex) => {
    const bodyLines = lines.filter(line => Math.abs(line.x - left) < 4).length;
    if (pageIndex === 0 && pages.length > 1 && !lines.some(line => SCENE_START.test(line.text)) && bodyLines < 3) {
      title = lines.map(line => line.text);
      return;
    }
    lines.forEach((line, index) => {
      const { text } = line;
      if (FURNITURE.test(text)) return;
      const inches = (line.x - left) / 72;
      const upper = text === text.toUpperCase() && /\p{L}/u.test(text);
      const openParen = previous?.kind === 'parenthetical' && !previous.line.text.endsWith(')');
      let kind: BlockKind;
      if (inches < 0.45) kind = SCENE_START.test(text) ? 'scene' : TRANSITION.test(text) ? 'transition' : 'action';
      else if (openParen && inches < 2.4) kind = 'parenthetical';
      else if (text.startsWith('(') && inches < 2.4) kind = 'parenthetical';
      else if (inches < 1.8) kind = 'dialogue';
      else if (TRANSITION.test(text) || inches > 3.6) kind = upper ? 'transition' : 'action';
      else kind = upper ? 'character' : 'dialogue';

      if (kind === 'character') {
        const name = text.replace(CONTD, '').trim();
        // NAME (CONT'D) at the top of a page continues the speech from the previous page.
        if (index === 0 && name === speaker && CONTD.test(text)) {
          previous = { line, kind: 'dialogue' };
          return;
        }
        speaker = name;
      } else if (kind !== 'dialogue' && kind !== 'parenthetical') speaker = '';

      const samePage = previous?.line.page === line.page;
      const gap = previous && samePage ? previous.line.y - line.y : Infinity;
      // A paragraph continues onto the next page only if its last line stopped mid-sentence.
      const acrossPage = previous && !samePage && index === 0 && previous.kind === kind && !/[.!?:"”)\]]$/.test(previous.line.text);
      const joinable = previous?.kind === kind && (kind === 'action' || kind === 'dialogue' || (kind === 'parenthetical' && openParen));
      const last = blocks.at(-1);
      if (joinable && last && (gap < line.size * 1.6 || acrossPage)) last.text += (/[-–—]$/.test(last.text) ? '' : ' ') + text;
      else blocks.push({ kind, text });
      previous = { line, kind };
    });
  });
  if (!blocks.some(block => block.kind === 'scene') && blocks.filter(block => block.kind === 'character').length < 2) return null;
  return { blocks, title };
}
