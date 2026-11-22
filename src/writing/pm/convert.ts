import type { Node as PMNode } from 'prosemirror-model';
import { newId } from '../../model';
import type { Block, BlockKind, StyleRange, TextStyle } from '../../model';
import { isUppercaseElement } from '../layout';
import { schema } from './schema';

const SPEECH: BlockKind[] = ['parenthetical', 'dialogue'];

/** Splits text at style boundaries into marked text nodes. */
function styledText(text: string, styles: StyleRange[] = []): PMNode[] {
  if (!text) return [];
  if (!styles.length) return [schema.text(text)];
  const cuts = new Set([0, text.length]);
  for (const range of styles) {
    cuts.add(Math.max(0, Math.min(text.length, range.from)));
    cuts.add(Math.max(0, Math.min(text.length, range.to)));
  }
  const points = [...cuts].sort((a, b) => a - b);
  const nodes: PMNode[] = [];
  for (let index = 0; index < points.length - 1; index++) {
    const [from, to] = [points[index], points[index + 1]];
    if (from === to) continue;
    const marks = styles.filter(range => range.from <= from && range.to >= to).map(range => schema.marks[range.style].create());
    nodes.push(schema.text(text.slice(from, to), marks));
  }
  return nodes;
}

function elementNode(block: Block): PMNode {
  return schema.nodes.element.create({
    id: block.id, kind: block.kind, sceneId: block.sceneId ?? null, sceneNumber: block.sceneNumber ?? null,
    alternate: block.alternate ?? null, revision: block.revision ?? null
  }, styledText(block.text, block.styles));
}

/** Reads marks back into merged style ranges. */
function readStyles(node: PMNode): StyleRange[] | undefined {
  if (node.childCount === 0) return undefined;
  if (node.childCount === 1 && node.firstChild!.marks.length === 0) return undefined;
  let hasAnyMark = false;
  for (let i = 0; i < node.childCount; i += 1) {
    if (node.child(i).marks.length > 0) { hasAnyMark = true; break; }
  }
  if (!hasAnyMark) return undefined;
  const ranges: StyleRange[] = [];
  node.forEach((child, offset) => {
    for (const mark of child.marks) {
      const style = mark.type.name as TextStyle;
      let previous: StyleRange | undefined;
      for (let idx = ranges.length - 1; idx >= 0; idx -= 1) {
        if (ranges[idx].style === style) { previous = ranges[idx]; break; }
      }
      if (previous && previous.to === offset) previous.to = offset + child.nodeSize;
      else ranges.push({ from: offset, to: offset + child.nodeSize, style });
    }
  });
  return ranges.length ? ranges : undefined;
}

function sameStyles(a?: StyleRange[], b?: StyleRange[]): boolean {
  if (a === b) return true;
  const lenA = a?.length ?? 0;
  const lenB = b?.length ?? 0;
  if (lenA !== lenB) return false;
  if (lenA === 0) return true;
  for (let i = 0; i < lenA; i += 1) {
    const x = a![i];
    const y = b![i];
    if (x.from !== y.from || x.to !== y.to || x.style !== y.style) return false;
  }
  return true;
}

/** Model blocks → editor document. Dual cues and their speeches become one container. */
export function blocksToDoc(blocks: Block[]): PMNode {
  const content: PMNode[] = [];
  const speechEnd = (from: number) => {
    let end = from + 1;
    while (end < blocks.length && SPEECH.includes(blocks[end].kind)) end++;
    return end;
  };
  for (let index = 0; index < blocks.length;) {
    const block = blocks[index];
    if (block.kind === 'character' && block.dual) {
      const firstEnd = speechEnd(index);
      const partner = blocks[firstEnd];
      if (partner?.kind === 'character' && partner.dual && partner.dual !== block.dual) {
        const secondEnd = speechEnd(firstEnd);
        const first = blocks.slice(index, firstEnd).map(elementNode);
        const second = blocks.slice(firstEnd, secondEnd).map(elementNode);
        const [left, right] = block.dual === 'left' ? [first, second] : [second, first];
        content.push(schema.nodes.dual.create(null, [
          schema.nodes.column.create({ side: 'left' }, left),
          schema.nodes.column.create({ side: 'right' }, right)
        ]));
        index = secondEnd;
        continue;
      }
    }
    content.push(elementNode({ ...block, dual: undefined }));
    index++;
  }
  if (!content.length) content.push(elementNode({ id: newId(), kind: 'scene', text: '', sceneId: newId() }));
  return schema.nodes.doc.create(null, content);
}

function same(a: Block, b: Block): boolean {
  return a.id === b.id && a.kind === b.kind && a.text === b.text && a.sceneId === b.sceneId && a.sceneNumber === b.sceneNumber
    && a.dual === b.dual && a.revision === b.revision && a.alternate === b.alternate
    && sameStyles(a.styles, b.styles);
}

/**
 * Editor document → model blocks. Unchanged blocks keep object identity so memoised
 * consumers (pagination, scene lists, production links) only recompute what moved.
 * Edited text is stamped with the active revision colour, matching issued-draft rules.
 */
export function docToBlocks(doc: PMNode, previous: Block[], revisionLabel?: string): Block[] {
  const prior = new Map<string, Block>();
  for (let i = 0; i < previous.length; i += 1) prior.set(previous[i].id, previous[i]);
  const blocks: Block[] = [];
  const read = (node: PMNode, dual?: 'left' | 'right') => {
    const kind = node.attrs.kind as BlockKind;
    const raw = node.textContent;
    const text = isUppercaseElement(kind) ? raw.toUpperCase() : raw;
    const before = prior.get(node.attrs.id);
    const styles = readStyles(node);
    const changed = !before || before.text !== text || before.kind !== kind || !sameStyles(before.styles, styles);
    if (!changed && before && before.sceneId === (node.attrs.sceneId || undefined)
      && before.sceneNumber === (node.attrs.sceneNumber || undefined)
      && before.dual === (dual && kind === 'character' ? dual : undefined)
      && before.alternate === (node.attrs.alternate || undefined)
      && before.revision === (before.revision ?? node.attrs.revision ?? undefined)) {
      blocks.push(before);
      return;
    }
    const revision = changed && revisionLabel ? revisionLabel : before?.revision ?? node.attrs.revision ?? undefined;
    const block: Block = {
      id: node.attrs.id, kind, text,
      ...(node.attrs.sceneId ? { sceneId: node.attrs.sceneId } : {}),
      ...(node.attrs.sceneNumber ? { sceneNumber: node.attrs.sceneNumber } : {}),
      ...(dual && kind === 'character' ? { dual } : {}),
      ...(node.attrs.alternate ? { alternate: node.attrs.alternate } : {}),
      ...(revision ? { revision } : {}),
      ...(styles ? { styles } : {})
    };
    blocks.push(before && same(before, block) ? before : block);
  };
  doc.forEach(node => {
    if (node.type === schema.nodes.dual) {
      node.forEach(column => {
        let first = true;
        column.forEach(child => {
          read(child, first && child.attrs.kind === 'character' ? column.attrs.side : undefined);
          first = false;
        });
      });
    } else read(node);
  });
  return blocks;
}
