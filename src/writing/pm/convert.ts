import type { Node as PMNode } from 'prosemirror-model';
import { newId } from '../../model';
import type { Block, BlockKind } from '../../model';
import { isUppercaseElement } from '../layout';
import { schema } from './schema';

const SPEECH: BlockKind[] = ['parenthetical', 'dialogue'];

function elementNode(block: Block): PMNode {
  return schema.nodes.element.create({
    id: block.id, kind: block.kind, sceneId: block.sceneId ?? null, sceneNumber: block.sceneNumber ?? null,
    alternate: block.alternate ?? null, revision: block.revision ?? null
  }, block.text ? schema.text(block.text) : null);
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
    && a.dual === b.dual && a.revision === b.revision && a.alternate === b.alternate;
}

/**
 * Editor document → model blocks. Unchanged blocks keep object identity so memoised
 * consumers (pagination, scene lists, production links) only recompute what moved.
 * Edited text is stamped with the active revision colour, matching issued-draft rules.
 */
export function docToBlocks(doc: PMNode, previous: Block[], revisionLabel?: string): Block[] {
  const prior = new Map(previous.map(block => [block.id, block]));
  const blocks: Block[] = [];
  const read = (node: PMNode, dual?: 'left' | 'right') => {
    const kind = node.attrs.kind as BlockKind;
    const raw = node.textContent;
    const text = isUppercaseElement(kind) ? raw.toUpperCase() : raw;
    const before = prior.get(node.attrs.id);
    const changed = !before || before.text !== text || before.kind !== kind;
    const revision = changed && revisionLabel ? revisionLabel : before?.revision ?? node.attrs.revision ?? undefined;
    const block: Block = {
      id: node.attrs.id, kind, text,
      ...(node.attrs.sceneId ? { sceneId: node.attrs.sceneId } : {}),
      ...(node.attrs.sceneNumber ? { sceneNumber: node.attrs.sceneNumber } : {}),
      ...(dual && kind === 'character' ? { dual } : {}),
      ...(node.attrs.alternate ? { alternate: node.attrs.alternate } : {}),
      ...(revision ? { revision } : {})
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
