import { newBlock, newDocument, newId } from '../model';
import type { Asset, AVRow, Block, BlockKind, TitlePage } from '../model';
import type { ScriptConversion } from './screenplay';
import { parseSeconds } from './tabular';

interface OdraftNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: OdraftNode[];
}

const mappedNodes: Record<string, BlockKind> = {
  sceneHeading: 'scene', action: 'action', paragraph: 'action', general: 'action', character: 'character',
  parenthetical: 'parenthetical', dialogue: 'dialogue', transition: 'transition', shot: 'shot',
  newAct: 'act', endOfAct: 'act', section: 'note', synopsis: 'note', lyrics: 'dialogue', note: 'note'
};

function obj(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asNode(value: unknown, depth = 0): OdraftNode {
  const shape = obj(value);
  if (!shape || typeof shape.type !== 'string' || depth > 48) throw new Error('The OpenDraft document has malformed editor nodes.');
  if (shape.content !== undefined && !Array.isArray(shape.content)) throw new Error('An OpenDraft node has invalid content.');
  return {
    type: shape.type,
    text: typeof shape.text === 'string' ? shape.text : undefined,
    attrs: obj(shape.attrs),
    content: Array.isArray(shape.content) ? shape.content.map(node => asNode(node, depth + 1)) : undefined
  };
}

function text(node?: OdraftNode): string {
  if (!node) return '';
  if (node.type === 'hardBreak') return '\n';
  if (node.text !== undefined) return node.text;
  return (node.content ?? []).map(text).join(node.type === 'avCell' ? '\n' : '');
}

function firstImage(node: OdraftNode): string | undefined {
  if (node.type === 'avImage' || node.type === 'screenplayImage') return string(node.attrs?.assetId);
  for (const child of node.content ?? []) {
    const image = firstImage(child);
    if (image) return image;
  }
}

export function decodeOdraft(source: string, title: string): ScriptConversion & { relatedAssets: Asset[] } {
  const root = obj(JSON.parse(source) as unknown);
  if (!root || root.format !== 'opendraft-script' || ![1, 2].includes(Number(root.odraft_version))) {
    throw new Error('Use an OpenDraft .odraft file saved in native format version 1 or 2.');
  }
  const content = obj(root.content);
  const payload = asNode(content);
  if (payload.type !== 'doc' || !Array.isArray(payload.content)) throw new Error('The .odraft file has no readable screenplay body.');
  const meta = obj(root.meta);
  const kind = payload.content.some(node => node.type === 'avBlock') ? 'av' : 'screenplay';
  const document = newDocument(string(meta?.title) ?? title, kind);
  const warnings = new Set<string>();
  const assetsBySource = new Map<string, string>();
  const relatedAssets: Asset[] = [];
  const importedAt = new Date().toISOString();
  if (Array.isArray(root.assets)) {
    for (const entry of root.assets.slice(0, 500)) {
      const asset = obj(entry);
      const oldId = string(asset?.id);
      const name = string(asset?.filename);
      const mime = string(asset?.mime_type);
      const data = string(asset?.data_base64);
      if (oldId && name && mime && /^image\/(?:png|jpeg|gif|webp|avif)$/i.test(mime) && data &&
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data) && !assetsBySource.has(oldId)) {
        const id = newId();
        assetsBySource.set(oldId, id);
        relatedAssets.push({ id, name, mime, dataUrl: 'data:' + mime + ';base64,' + data, addedAt: importedAt });
      } else warnings.add('Some embedded images could not be converted. They remain in the original .odraft.');
    }
  }
  if (meta?.assets_omitted) warnings.add('This .odraft was saved without embedded assets.');
  const seenScenes = new Set<string>();
  const blocks: Block[] = [];
  const avRows: AVRow[] = [];
  const importBlock = (node: OdraftNode, dual?: Block['dual']) => {
    const type = Object.hasOwn(mappedNodes, node.type) ? mappedNodes[node.type] : undefined;
    const value = text(node);
    if (!type && !value.trim()) return;
    if (!type) warnings.add('Custom OpenDraft elements were converted to action.');
    const block = newBlock(type ?? 'action', value);
    if (type === 'scene') {
      block.sceneNumber = string(node.attrs?.sceneNumber) ?? (typeof node.attrs?.sceneNumber === 'number' ? String(node.attrs.sceneNumber) : undefined);
      const stableId = string(node.attrs?.sceneUid);
      if (stableId && /^[a-z0-9][-a-z0-9_.:]{0,127}$/i.test(stableId) && !seenScenes.has(stableId)) block.sceneId = stableId;
      seenScenes.add(block.sceneId!);
    }
    if (dual) block.dual = dual;
    block.revision = string(node.attrs?.revision) ?? string(node.attrs?.revisionColor);
    blocks.push(block);
  };
  for (const node of payload.content) {
    if (node.type === 'titlePage') {
      const details: TitlePage = { title: string(node.attrs?.tpTitle) ?? document.title,
        byline: string(node.attrs?.tpCredit), author: string(node.attrs?.tpWrittenBy) ?? string(meta?.author),
        draftDate: string(node.attrs?.tpDraftDate), contact: string(node.attrs?.tpContact) };
      document.titlePage = details;
      if (string(node.attrs?.tpBasedOn) || string(node.attrs?.tpCopyright) || string(node.attrs?.tpNotes)) warnings.add('Additional title credits remain in the original .odraft.');
    } else if (node.type === 'dualDialogue') {
      (node.content ?? []).slice(0, 2).forEach((column, index) => {
        (column.content ?? []).forEach(line => importBlock(line, index === 0 ? 'left' : 'right'));
      });
    } else if (node.type === 'avBlock') {
      for (const row of node.content ?? []) {
        if (row.type !== 'avRow') continue;
        const cells = (row.content ?? []).filter(cell => cell.type === 'avCell');
        const image = firstImage(row);
        const storyboardAssetId = image ? assetsBySource.get(image) : undefined;
        if (image && !storyboardAssetId) warnings.add('Some storyboard images refer to assets outside the .odraft file.');
        const duration = row.attrs?.duration;
        const start = row.attrs?.start;
        const cueSeconds = start === null || start === undefined ? undefined : parseSeconds(String(start));
        const durationSeconds = duration === null || duration === undefined ? undefined : parseSeconds(String(duration));
        if ((start && cueSeconds === undefined) || (duration && durationSeconds === undefined)) warnings.add('Review the OpenDraft AV timing for unrecognised values.');
        avRows.push({ id: newId(), video: text(cells[0]), audio: text(cells[1]), durationSeconds: durationSeconds ?? 0,
          ...(cueSeconds === undefined ? {} : { cueSeconds }), ...(storyboardAssetId ? { storyboardAssetId } : {}) });
      }
    } else {
      importBlock(node);
    }
  }
  if (kind === 'av') document.avRows = avRows;
  else if (blocks.length) document.blocks = blocks;
  if (kind === 'av' && blocks.length) warnings.add('Screenplay text outside the AV rows remains in the original .odraft.');
  if (Object.keys(content ?? {}).some(key => key.startsWith('_'))) {
    warnings.add('OpenDraft story, review and revision metadata remains in the original file.');
  }
  const original = kind === 'av' ? avRows.map(row => row.video + '\n' + row.audio).join('\n\n') : blocks.map(block => block.text).join('\n');
  return { document, original, warnings: [...warnings], uncertain: [], relatedAssets,
    sourcePages: typeof meta?.page_count === 'number' && meta.page_count > 0 ? meta.page_count : undefined };
}
