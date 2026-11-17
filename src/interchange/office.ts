import { newBlock, newDocument } from '../model';
import type { AVRow, Block, BlockKind, DocumentModel, TitlePage } from '../model';
import { pack, requiredText, unpack } from './container';
import { decodeFountain } from './screenplay';
import type { ScriptConversion } from './screenplay';
import { tableFromRows } from './tabular';
import type { AVTable } from './tabular';
import { attr, element, elements, escapeXml, localName, parseXml, xmlHeader } from './xml';
import type { XmlNode } from './xml';

const stylePrefix = 'Swdr';
const namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const packageRelationship = 'http://schemas.openxmlformats.org/package/2006/relationships';
const officeRelationship = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const styleNames: Partial<Record<string, BlockKind>> = {
  scene: 'scene', sceneheading: 'scene', action: 'action', character: 'character', charactercue: 'character',
  dialogue: 'dialogue', parenthetical: 'parenthetical', transition: 'transition', shot: 'shot',
  act: 'act', newact: 'act', endofact: 'act', note: 'note', general: 'action'
};
const titleStyles: Record<string, keyof TitlePage> = {
  title: 'title', byline: 'byline', author: 'author', contact: 'contact', draftdate: 'draftDate'
};

function wordText(node: XmlNode): string {
  if (localName(node.tag) === 'tab') return '\t';
  if (['br', 'cr'].includes(localName(node.tag))) return '\n';
  if (['del', 'instrText', 'rPr', 'pPr', 'drawing'].includes(localName(node.tag))) return '';
  if (localName(node.tag) === 't') return node.children.filter(child => typeof child === 'string').join('');
  return elements(node).map(wordText).join('');
}

function wordBody(files: Record<string, Uint8Array>): XmlNode {
  const root = parseXml(requiredText(files, 'word/document.xml'));
  const body = element(root, 'body');
  if (!body || localName(root.tag) !== 'document') throw new Error('Could not find the main Word document.');
  return body;
}

export function decodeDocx(data: Uint8Array, title: string, asAv: boolean): ScriptConversion | AVTable {
  const files = unpack(data);
  const body = wordBody(files);
  if (asAv) {
    const tables = elements(body, 'tbl');
    const table = tables.find(item => elements(elements(item, 'tr')[0], 'tc').length >= 2);
    if (!table) throw new Error('No two-column table was found in this Word document. Choose Screenplay for a plain Word script.');
    return tableFromRows(elements(table, 'tr').map(row => elements(row, 'tc').map(cell => elements(cell, 'p').map(wordText).join('\n'))));
  }
  const paragraphs = elements(body, 'p');
  const text = paragraphs.map(wordText).join('\n');
  const styleMap = new Map<string, string>();
  if (files['word/styles.xml']) {
    const styles = parseXml(requiredText(files, 'word/styles.xml'));
    for (const style of elements(styles, 'style')) {
      const id = attr(style, 'styleId');
      const name = attr(element(style, 'name'), 'val');
      if (id && name) styleMap.set(id, name);
    }
  }
  const paragraphStyle = (node: XmlNode) => {
    const id = attr(element(element(node, 'pPr'), 'pStyle'), 'val') ?? '';
    return (styleMap.get(id) ?? id).replace(/^swdr/i, '').replace(/[\s_-]+/g, '').toLowerCase();
  };
  const styled = paragraphs.some(node => !!styleNames[paragraphStyle(node)]);
  const pageSize = element(element(body, 'sectPr'), 'pgSz');
  const paper = Number(attr(pageSize, 'w')) >= 11900 && Number(attr(pageSize, 'w')) < 12100 ? 'a4' : 'letter';
  const warnings: string[] = [];
  if (elements(body, 'tbl').length) warnings.push('Tables remain in the original. Use AV table mode for a two-column script.');
  if (files['word/footnotes.xml'] || files['word/comments.xml']) warnings.push('Word comments and footnotes remain in the original.');
  const app = files['docProps/app.xml'] ? parseXml(requiredText(files, 'docProps/app.xml')) : undefined;
  const sourcePages = Number(element(app, 'Pages')?.children[0]) || undefined;
  if (!styled) {
    const converted = decodeFountain(text, title, true);
    converted.document.paper = paper;
    return { ...converted, warnings: [...converted.warnings, ...warnings], sourcePages };
  }
  const document = newDocument(title, 'screenplay');
  document.paper = paper;
  const draftTitle: Partial<TitlePage> = {};
  const blocks: Block[] = [];
  for (const paragraph of paragraphs) {
    const style = paragraphStyle(paragraph);
    const value = wordText(paragraph);
    if (!value.trim()) continue;
    if (titleStyles[style]) draftTitle[titleStyles[style]] = value;
    else {
      const block = newBlock(styleNames[style] ?? 'action', value);
      if (block.kind === 'scene') {
        const numbered = /^(.*)\t([A-Z0-9]+)$/u.exec(value);
        if (numbered) [block.text, block.sceneNumber] = [numbered[1], numbered[2]];
      }
      blocks.push(block);
    }
  }
  if (draftTitle.title) {
    document.title = draftTitle.title;
    document.titlePage = { ...draftTitle, title: draftTitle.title };
  }
  if (blocks.length) document.blocks = blocks;
  return { document, original: text, warnings, uncertain: [], sourcePages };
}

function paragraph(text: string, style?: string) {
  const properties = style ? '<w:pPr><w:pStyle w:val="' + stylePrefix + style + '"/></w:pPr>' : '';
  const runs = text.replaceAll('\r\n', '\n').split(/([\n\t])/).map(part => part === '\n' ? '<w:br/>' :
    part === '\t' ? '<w:tab/>' : '<w:t xml:space="preserve">' + escapeXml(part) + '</w:t>').join('');
  return '<w:p>' + properties + '<w:r>' + runs + '</w:r></w:p>';
}

function styleDocument() {
  const indents: Partial<Record<BlockKind, [number, number]>> = {
    character: [3100, 800], dialogue: [1430, 2000], parenthetical: [2200, 2410]
  };
  const types = Object.entries({
    scene: 'Scene Heading', action: 'Action', character: 'Character', dialogue: 'Dialogue',
    parenthetical: 'Parenthetical', transition: 'Transition', shot: 'Shot', act: 'Act', note: 'Note',
    title: 'Title', byline: 'Byline', author: 'Author', contact: 'Contact', draftdate: 'Draft date'
  });
  return xmlHeader + '<w:styles xmlns:w="' + namespace + '"><w:docDefaults><w:rPrDefault><w:rPr>' +
    '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:sz w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults>' +
    types.map(([style, label]) => {
      const indent = indents[style as BlockKind];
      const aligned = ['act', 'title', 'byline', 'author', 'draftdate'].includes(style) ? 'center' :
        style === 'transition' ? 'right' : 'left';
      return '<w:style w:type="paragraph" w:styleId="' + stylePrefix + style + '"><w:name w:val="' +
        label + '"/><w:pPr><w:spacing w:before="' + (['character', 'dialogue', 'parenthetical'].includes(style) ? '0' : '200') +
        '" w:after="0" w:line="240" w:lineRule="exact"/><w:jc w:val="' + aligned + '"/>' +
        (indent ? '<w:ind w:left="' + indent[0] + '" w:right="' + indent[1] + '"/>' : '') +
        '</w:pPr></w:style>';
    }).join('') + '</w:styles>';
}

function wordZip(body: string, paper: DocumentModel['paper']): Uint8Array {
  const size = paper === 'a4' ? 'w:w="11906" w:h="16838"' : 'w:w="12240" w:h="15840"';
  return pack({
    '[Content_Types].xml': xmlHeader + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
    '_rels/.rels': xmlHeader + '<Relationships xmlns="' + packageRelationship + '"><Relationship Id="rId1" Type="' +
      officeRelationship + '/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/_rels/document.xml.rels': xmlHeader + '<Relationships xmlns="' + packageRelationship + '"><Relationship Id="rId1" Type="' +
      officeRelationship + '/styles" Target="styles.xml"/></Relationships>',
    'word/styles.xml': styleDocument(),
    'word/document.xml': xmlHeader + '<w:document xmlns:w="' + namespace + '"><w:body>' + body +
      '<w:sectPr><w:pgSz ' + size + '/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="2160" ' +
      'w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>'
  });
}

export function exportDocx(document: DocumentModel): Uint8Array {
  if (document.kind === 'av') return exportAvDocx(document.avRows, document.paper);
  const title = document.titlePage;
  const before = title ? Object.entries(titleStyles).map(([style, key]) =>
    title[key] ? paragraph(title[key]!, style) : '').join('') + '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : '';
  const body = document.blocks.filter(block => block.kind !== 'note').map(block =>
    paragraph(block.text + (block.kind === 'scene' && block.sceneNumber ? '\t' + block.sceneNumber : ''), block.kind)).join('');
  return wordZip(before + body, document.paper);
}

export function exportAvDocx(rows: AVRow[], paper: DocumentModel['paper']): Uint8Array {
  const cell = (value: string) => '<w:tc><w:tcPr><w:tcW w:type="dxa" w:w="2150"/></w:tcPr>' + paragraph(value) + '</w:tc>';
  const data = [['Video', 'Audio', 'Duration seconds', 'Cue seconds'], ...rows.map(row =>
    [row.video, row.audio, String(row.durationSeconds), row.cueSeconds === undefined ? '' : String(row.cueSeconds)])];
  const table = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>' +
    '<w:gridCol w:w="2150"/>'.repeat(4) + '</w:tblGrid>' +
    data.map(row => '<w:tr>' + row.map(cell).join('') + '</w:tr>').join('') + '</w:tbl>';
  return wordZip(table, paper);
}
