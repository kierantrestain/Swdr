import { Schema } from 'prosemirror-model';
import type { Node as PMNode } from 'prosemirror-model';
import type { BlockKind } from '../../model';

// One node type carries every screenplay element. The element is an attribute, so
// changing Action to Character is a markup change that keeps the block's identity,
// and copy/paste of a range keeps each paragraph's element (no per-type nodes to lose).
export const schema = new Schema({
  nodes: {
    doc: { content: '(element | dual)+' },
    element: {
      group: 'flow',
      content: 'text*',
      marks: '',
      defining: true,
      attrs: {
        id: { default: '' },
        kind: { default: 'action' },
        sceneId: { default: null },
        sceneNumber: { default: null },
        alternate: { default: null },
        revision: { default: null }
      },
      parseDOM: [{
        tag: 'p[data-element]',
        getAttrs: dom => {
          const element = dom as HTMLElement;
          return { kind: element.dataset.element || 'action', id: '' };
        }
      }],
      toDOM: node => ['p', { 'data-element': node.attrs.kind, 'data-block-id': node.attrs.id, class: `swdr-el swdr-el-${node.attrs.kind}` }, 0]
    },
    // Dual dialogue is a real container: two speeches side by side. Editing either
    // column is ordinary text editing; the model flattens it back to flagged cues.
    dual: {
      content: 'column column',
      isolating: true,
      toDOM: () => ['div', { class: 'swdr-dual', 'data-dual': 'true' }, 0],
      parseDOM: [{ tag: 'div[data-dual]' }]
    },
    column: {
      content: 'element+',
      isolating: true,
      attrs: { side: { default: 'left' } },
      toDOM: node => ['div', { class: `swdr-dual-col swdr-dual-${node.attrs.side}` }, 0],
      parseDOM: [{ tag: 'div.swdr-dual-col', getAttrs: dom => ({ side: (dom as HTMLElement).classList.contains('swdr-dual-right') ? 'right' : 'left' }) }]
    },
    text: {}
  }
});

export function kindOf(node: PMNode): BlockKind {
  return node.attrs.kind as BlockKind;
}
