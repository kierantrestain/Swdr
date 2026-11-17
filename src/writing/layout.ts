import type { Block, BlockKind, DocumentModel, LockedPage, Paper, TitlePage } from '../model';

export interface PageGeometry {
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
  fontSize: number;
  lineHeight: number;
  glyphWidth: number;
}

export interface ElementBox {
  x: number;
  width: number;
  align: 'left' | 'center' | 'right';
}

export interface LaidOutLine extends ElementBox {
  blockId: string;
  kind: BlockKind;
  text: string;
  y: number;
  revision?: string;
  decoration?: 'page-number' | 'scene-number' | 'continuation';
}

export interface WritingPage {
  label: string;
  lines: LaidOutLine[];
  titlePage?: boolean;
}

interface PreparedLine extends ElementBox {
  blockId: string;
  kind: BlockKind;
  text: string;
  revision?: string;
}

type Lane = 'left' | 'right';

export function geometryFor(paper: Paper): PageGeometry {
  return {
    width: paper === 'a4' ? 210 * 72 / 25.4 : 612,
    height: paper === 'a4' ? 297 * 72 / 25.4 : 792,
    top: 72, right: 72, bottom: 72, left: 108,
    fontSize: 12, lineHeight: 12, glyphWidth: 7.2
  };
}

export function elementBox(kind: BlockKind, geometry: PageGeometry, lane?: Lane, stageplay = false): ElementBox {
  const { width, left, right } = geometry;
  const available = width - left - right;
  if (lane) {
    const gap = 36;
    const column = (available - gap) / 2;
    const inset = kind === 'parenthetical' ? 14 : 0;
    return {
      x: left + (lane === 'right' ? column + gap : 0) + inset,
      width: column - 2 * inset,
      align: kind === 'character' ? 'center' : 'left'
    };
  }
  if (stageplay) {
    if (['character', 'scene', 'act', 'transition'].includes(kind)) return { x: left, width: available, align: 'center' };
    if (kind === 'parenthetical' || kind === 'action') return { x: left + 36, width: available - 72, align: 'left' };
    return { x: left, width: available, align: 'left' };
  }
  switch (kind) {
    case 'character': return { x: left + 144, width: available - 144, align: 'left' };
    case 'parenthetical': return { x: left + 108, width: Math.min(194.4, available - 108), align: 'left' };
    case 'dialogue': return { x: left + 72, width: Math.min(252, available - 72), align: 'left' };
    case 'transition': return { x: left, width: available, align: 'right' };
    case 'act': return { x: left, width: available, align: 'center' };
    default: return { x: left, width: available, align: 'left' };
  }
}

export function isUppercaseElement(kind: BlockKind): boolean {
  return ['scene', 'character', 'transition', 'shot', 'act'].includes(kind);
}

export function manuscriptText(block: Block): string {
  return isUppercaseElement(block.kind) ? block.text.toUpperCase() : block.text;
}

export function wrapManuscriptText(text: string, characters: number): string[] {
  const max = Math.max(1, Math.floor(characters));
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')) {
    let rest = Array.from(paragraph);
    while (rest.length > max) {
      let breakAt = max;
      while (breakAt > 0 && !/\s/u.test(rest[breakAt])) breakAt--;
      const length = breakAt > 0 ? breakAt : max;
      lines.push(rest.slice(0, length).join('').trimEnd());
      rest = rest.slice(length);
      while (rest.length && /\s/u.test(rest[0])) rest.shift();
    }
    lines.push(rest.join('').trimEnd());
  }
  return lines;
}

function prepare(block: Block, geometry: PageGeometry, stageplay: boolean, lane?: Lane): PreparedLine[] {
  const box = elementBox(block.kind, geometry, lane, stageplay);
  return wrapManuscriptText(manuscriptText(block), Math.floor(box.width / geometry.glyphWidth + 1e-8))
    .map(text => ({ ...box, blockId: block.id, kind: block.kind, text, revision: block.revision }));
}

function titlePageLines(title: TitlePage, geometry: PageGeometry): LaidOutLine[] {
  const { width, height, left, right } = geometry;
  const main = { x: left, width: width - left - right, align: 'center' as const, blockId: '', kind: 'action' as const };
  const lines: LaidOutLine[] = [];
  let base = Math.round(height * 0.38);
  for (const value of [title.title.toUpperCase(), title.byline || 'Written by', title.author ?? '']) {
    if (!value.trim()) continue;
    for (const text of wrapManuscriptText(value, Math.floor(main.width / geometry.glyphWidth))) {
      lines.push({ ...main, text, y: base });
      base += 12;
    }
    base += 12;
  }
  const credits = [title.draftDate ?? '', title.contact ?? ''].filter(value => value.trim())
    .flatMap(value => wrapManuscriptText(value, Math.floor(main.width / geometry.glyphWidth)));
  for (const [index, text] of credits.entries()) {
    lines.push({ ...main, align: 'left', text, y: height - 72 - (credits.length - 1 - index) * 12 });
  }
  return lines;
}

function overflowLabel(label: string): string {
  const match = /^([0-9]+)([A-Z]*)$/.exec(label);
  if (!match) return label + 'A';
  const suffix = match[2].split('');
  let index = suffix.length - 1;
  while (index >= 0 && suffix[index] === 'Z') {
    suffix[index] = 'A';
    index--;
  }
  if (index < 0) suffix.unshift('A');
  else suffix[index] = String.fromCharCode(suffix[index].charCodeAt(0) + 1);
  return match[1] + suffix.join('');
}

function dialogueEnd(blocks: Block[], from: number, anchors: Map<string, string>): number {
  let next = from + 1;
  while (next < blocks.length && !anchors.has(blocks[next].id) && ['dialogue', 'parenthetical'].includes(blocks[next].kind)) next++;
  return next;
}

export function paginateDocument(document: DocumentModel, options: { includeNotes?: boolean } = {}): { geometry: PageGeometry; pages: WritingPage[] } {
  const geometry = geometryFor(document.paper);
  const { width, height, top, right, bottom, left, fontSize, lineHeight } = geometry;
  const lineCapacity = Math.floor((height - bottom - top - fontSize) / lineHeight) + 1;
  const pages: WritingPage[] = [];
  if (document.titlePage) pages.push({ titlePage: true, label: '', lines: titlePageLines(document.titlePage, geometry) });
  const stageplay = document.kind === 'stageplay';
  const numbering = (document as DocumentModel & { showSceneNumbers?: boolean }).showSceneNumbers !== false;
  const blocks = options.includeNotes ? document.blocks : document.blocks.filter(block => block.kind !== 'note');
  const present = new Set(blocks.map(block => block.id));
  const anchors = new Map<string, string>();
  const reserved = new Set<string>();
  for (const anchor of document.lockedPages ?? []) {
    if (!present.has(anchor.firstBlockId) || !/^[1-9]\d*[A-Z]*$/.test(anchor.label) || reserved.has(anchor.label) || anchors.has(anchor.firstBlockId)) continue;
    anchors.set(anchor.firstBlockId, anchor.label);
    reserved.add(anchor.label);
  }

  let page: WritingPage;
  let row = 0;
  let label = '';
  let scene = 0;
  const used = new Set<string>();

  function newPage(anchor?: string): void {
    if (anchor && !used.has(anchor)) label = anchor;
    else if (!label) label = '1';
    else if (anchors.size) {
      do label = overflowLabel(label); while (used.has(label) || reserved.has(label));
    } else label = String(Number(label) + 1);
    used.add(label);
    page = { label, lines: [] };
    pages.push(page);
    row = 0;
    if (label !== '1') {
      page.lines.push({
        blockId: '', kind: 'action', text: label + '.', x: left, y: 36,
        width: width - left - right, align: 'right', decoration: 'page-number'
      });
    }
  }

  function append(line: PreparedLine, at: number, decoration?: LaidOutLine['decoration']): void {
    page.lines.push({ ...line, y: top + fontSize + at * lineHeight, decoration });
  }

  function startElement(kind: BlockKind, keepWith: number): void {
    const gap = row > 0 && (kind === 'scene' || kind === 'character' || kind === 'action' || kind === 'transition' || kind === 'act' || kind === 'shot' || kind === 'note') ? 1 : 0;
    if (row + gap + keepWith > lineCapacity) newPage();
    else row += gap;
  }

  function flushDialogue(lanes: { cue: Block; lines: PreparedLine[]; lane?: Lane }[]): void {
    startElement('character', Math.min(3, Math.max(...lanes.map(lane => lane.lines.length))));
    let consumed = 0;
    const length = Math.max(...lanes.map(lane => lane.lines.length));
    while (consumed < length) {
      const room = lineCapacity - row;
      const continuing = length - consumed > room;
      const count = continuing ? room - 1 : length - consumed;
      for (const lane of lanes) {
        for (let index = consumed; index < Math.min(lane.lines.length, consumed + count); index++) {
          append(lane.lines[index], row + index - consumed);
        }
        if (continuing && lane.lines.length > consumed + count) {
          const box = elementBox('parenthetical', geometry, lane.lane, stageplay);
          append({ ...box, text: '(MORE)', blockId: lane.cue.id, kind: 'parenthetical', align: 'center' }, row + count, 'continuation');
        }
      }
      row += count;
      consumed += count;
      if (continuing) {
        newPage();
        for (const lane of lanes) {
          if (lane.lines.length <= consumed) continue;
          const box = elementBox('character', geometry, lane.lane, stageplay);
          const text = manuscriptText(lane.cue);
          const continuation = /\(CONT[’']D\)$/i.test(text) ? text : text + ' (CONT’D)';
          append({ ...box, text: continuation, blockId: lane.cue.id, kind: 'character' }, row, 'continuation');
        }
        row++;
      }
    }
  }

  newPage(anchors.get(blocks[0]?.id));
  for (let index = 0; index < blocks.length;) {
    const block = blocks[index];
    const anchor = anchors.get(block.id);
    if (index && anchor && anchor !== label) newPage(anchor);
    if (block.kind === 'character') {
      const firstEnd = dialogueEnd(blocks, index, anchors);
      const partner = blocks[firstEnd];
      if (block.dual && partner?.kind === 'character' && partner.dual && partner.dual !== block.dual && !anchors.has(partner.id)) {
        const secondEnd = dialogueEnd(blocks, firstEnd, anchors);
        const lanes = [
          { cue: block, lines: blocks.slice(index, firstEnd).flatMap(entry => prepare(entry, geometry, stageplay, block.dual)), lane: block.dual },
          { cue: partner, lines: blocks.slice(firstEnd, secondEnd).flatMap(entry => prepare(entry, geometry, stageplay, partner.dual)), lane: partner.dual }
        ];
        flushDialogue(lanes.sort((first, second) => first.lane.localeCompare(second.lane)));
        index = secondEnd;
      } else {
        flushDialogue([{ cue: block, lines: blocks.slice(index, firstEnd).flatMap(entry => prepare(entry, geometry, stageplay)) }]);
        index = firstEnd;
      }
      continue;
    }
    const lines = prepare(block, geometry, stageplay);
    const keep = block.kind === 'scene' && blocks[index + 1] ? Math.min(lines.length + 1, lineCapacity) : 1;
    startElement(block.kind, keep);
    if (block.kind === 'scene') scene++;
    if (block.kind === 'scene' && numbering) {
      const number = block.sceneNumber || String(scene);
      const base = { blockId: block.id, kind: block.kind, text: number, revision: block.revision };
      append({ ...base, x: 36, width: left - 51, align: 'right' }, row, 'scene-number');
      append({ ...base, x: width - right + 12, width: right - 36, align: 'left' }, row, 'scene-number');
    }
    for (const line of lines) {
      if (row === lineCapacity) newPage();
      append(line, row++);
    }
    index++;
  }
  return { geometry, pages };
}

export function lockManuscriptPages(document: DocumentModel): LockedPage[] {
  const used = new Set<string>();
  return paginateDocument({ ...document, lockedPages: undefined }).pages.flatMap(page => {
    const first = page.lines.find(line => line.blockId && !line.decoration);
    if (!page.label || !first || used.has(first.blockId)) return [];
    used.add(first.blockId);
    return [{ label: page.label, firstBlockId: first.blockId }];
  });
}

export function revisionInk(label?: string): string {
  if (!label) return '';
  const inks: Record<string, string> = {
    white: '#48413a', blue: '#235194', pink: '#8e345a', yellow: '#735913', green: '#21604a',
    goldenrod: '#906317', buff: '#754c36', salmon: '#994938', cherry: '#8d233d'
  };
  return inks[label.toLowerCase()] || '#174d88';
}
