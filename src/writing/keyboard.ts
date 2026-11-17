import { BLOCK_KINDS, newBlock } from '../model';
import type { Block, BlockKind, DocumentModel } from '../model';
import { isUppercaseElement } from './layout';

export const elementNames: Record<BlockKind, string> = {
  scene: 'Scene heading', action: 'Action', character: 'Character', parenthetical: 'Parenthetical',
  dialogue: 'Dialogue', transition: 'Transition', shot: 'Shot', act: 'Act', note: 'Note'
};

export function nextElement(kind: BlockKind): BlockKind {
  switch (kind) {
    case 'character':
    case 'parenthetical':
      return 'dialogue';
    case 'transition':
    case 'act':
      return 'scene';
    default:
      return 'action';
  }
}

export function cycleElement(kind: BlockKind, direction: number): BlockKind {
  return BLOCK_KINDS[(BLOCK_KINDS.indexOf(kind) + direction + BLOCK_KINDS.length) % BLOCK_KINDS.length];
}

export function withElement(block: Block, kind: BlockKind): Block {
  if (block.kind === kind) return block;
  return {
    ...block, kind, text: isUppercaseElement(kind) ? block.text.toUpperCase() : block.text,
    sceneId: kind === 'scene' ? block.sceneId ?? newBlock('scene').sceneId : block.sceneId,
    dual: kind === 'character' ? block.dual : undefined
  };
}

export function splitBlock(block: Block, start: number, end: number): { left: Block; right: Block } {
  const tail = block.text.slice(end);
  const rightKind = tail && ['action', 'dialogue', 'note'].includes(block.kind) ? block.kind : nextElement(block.kind);
  return { left: { ...block, text: block.text.slice(0, start) }, right: newBlock(rightKind, tail) };
}

export function replaceBlock(document: DocumentModel, blockId: string, update: (block: Block) => Block): DocumentModel {
  const index = document.blocks.findIndex(block => block.id === blockId);
  if (index === -1) return document;
  const block = document.blocks[index];
  const nextBlock = update(block);
  if (block === nextBlock) return document;
  const blocks = document.blocks.slice();
  blocks[index] = nextBlock;
  return { ...document, blocks };
}

export function pairDialogue(document: DocumentModel, cueId: string): DocumentModel | null {
  const index = document.blocks.findIndex(block => block.id === cueId && block.kind === 'character');
  if (index < 0) return null;
  const nextCue = (from: number) => {
    let candidate = from + 1;
    while (candidate < document.blocks.length && ['parenthetical', 'dialogue'].includes(document.blocks[candidate].kind)) candidate++;
    return document.blocks[candidate]?.kind === 'character' ? candidate : -1;
  };
  const first = document.blocks[index];
  if (first.dual) {
    let partner = first.dual === 'left' ? nextCue(index) : index - 1;
    while (partner >= 0 && ['parenthetical', 'dialogue'].includes(document.blocks[partner].kind)) partner--;
    const partnerId = document.blocks[partner]?.dual && document.blocks[partner]?.id;
    return {
      ...document,
      blocks: document.blocks.map(block => block.id === cueId || block.id === partnerId ? { ...block, dual: undefined } : block)
    };
  }
  const partner = nextCue(index);
  if (partner < 0 || document.blocks[partner].dual) return null;
  return {
    ...document,
    blocks: document.blocks.map((block, position) => {
      if (position === index) return { ...block, dual: 'left' };
      if (position === partner) return { ...block, dual: 'right' };
      return block;
    })
  };
}
