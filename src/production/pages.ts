import { sceneList } from '../model';
import type { DocumentModel } from '../model';
import { paginateDocument } from '../writing/layout';

export interface ScriptPages {
  /** Pages of script, excluding the title page. */
  pages: number;
  /** Page eighths per scene ID, measured on the laid-out page (at least 1/8 per scene). */
  eighths: Map<string, number>;
}

/**
 * Measures each scene of a screenplay or stage play in page eighths from the real page layout:
 * a scene runs from its heading to the next heading (across page breaks), and a page is eight eighths.
 */
export function scriptPages(document: DocumentModel): ScriptPages {
  const eighths = new Map<string, number>();
  if (document.kind === 'av') return { pages: 0, eighths };
  const { geometry, pages } = paginateDocument(document);
  const { height, top, bottom, fontSize, lineHeight } = geometry;
  const capacity = Math.floor((height - bottom - top - fontSize) / lineHeight) + 1;
  const headings = new Map(sceneList(document).map(scene => [scene.blockId, scene.id]));
  const starts: Array<{ id: string; at: number }> = [];
  const seen = new Set<string>();
  let pageIndex = 0;
  let end = 0;
  for (const page of pages) {
    if (page.titlePage) continue;
    for (const line of page.lines) {
      if (line.decoration === 'page-number') continue;
      const at = pageIndex * capacity + Math.round((line.y - top - fontSize) / lineHeight);
      const id = line.kind === 'scene' ? headings.get(line.blockId) : undefined;
      if (id && !seen.has(id)) {
        seen.add(id);
        starts.push({ id, at });
      }
      end = Math.max(end, at + 1);
    }
    pageIndex++;
  }
  starts.forEach((start, index) => {
    const length = (starts[index + 1]?.at ?? end) - start.at;
    eighths.set(start.id, Math.max(1, Math.round(length / capacity * 8)));
  });
  return { pages: pageIndex, eighths };
}
