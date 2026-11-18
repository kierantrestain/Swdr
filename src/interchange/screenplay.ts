import { newBlock, newDocument } from '../model';
import type { Block, BlockKind, DocumentModel, TitlePage } from '../model';
import { attr, element, elements, escapeXml, localName, parseXml, xmlHeader, xmlText } from './xml';
import type { XmlNode } from './xml';
import { fdxStyle, fromFdxStyle, fromFountainEmphasis, fromRuns, styleRuns, toFountainEmphasis } from './styles';

export interface UncertainLine {
  blockId: string;
  source: string;
  suggested: BlockKind;
  reason: string;
}

export interface ScriptConversion {
  document: DocumentModel;
  original: string;
  warnings: string[];
  uncertain: UncertainLine[];
  sourcePages?: number;
}

export const elementLabel: Record<BlockKind, string> = {
  scene: 'Scene heading', action: 'Action', character: 'Character cue', parenthetical: 'Parenthetical',
  dialogue: 'Dialogue', transition: 'Transition', shot: 'Shot', act: 'Act', note: 'Note'
};

export const fdxType: Record<BlockKind, string> = {
  scene: 'Scene Heading', action: 'Action', character: 'Character', parenthetical: 'Parenthetical',
  dialogue: 'Dialogue', transition: 'Transition', shot: 'Shot', act: 'New Act', note: 'General'
};

const scenePattern = /^(?:(?:INT|EXT)[./](?:INT|EXT)\.?(?=\s)|(?:INT|EXT|EST|I\/E)\.(?=\s)|INT\/EXT(?=\s))/i;
const transitionPattern = /(?:\bTO:|^FADE OUT\.|^FADE IN:)$/i;
const actPattern = /^(?:END OF )?ACT (?:[IVXLCDM]+|\d+|ONE|TWO|THREE|FOUR|FIVE)(?: [–—-] .+)?$/i;
const simpleCue = /^[\p{L}\p{M}0-9 .'\u2019#/-]+(?:\s+\([^)]{1,24}\))?$/u;
const looksUpper = (line: string) => line.length < 55 && /\p{Lu}/u.test(line) && line === line.toUpperCase() && simpleCue.test(line);

export function decodeFountain(text: string, fallbackTitle: string, loose = false): ScriptConversion {
  if (!text.trim()) throw new Error('The document has no editable text.');
  const warnings = new Set<string>();
  const uncertain: UncertainLine[] = [];
  const withoutComments = text.replace(/\/\*[\s\S]*?\*\//g, () => {
    warnings.add('Fountain boneyard comments remain in the original file.');
    return '';
  });
  const lines = withoutComments.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
  const titleFields: Record<string, string> = {};
  let start = 0;
  let titleField = '';
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const title = /^\s*(title|credit|author[s]?|source|draft date|contact|copyright|notes):\s*(.*)$/i.exec(line);
    if (title) {
      titleField = title[1].toLowerCase();
      titleFields[titleField] = title[2];
    } else if (titleField && /^\s+\S/.test(line)) {
      titleFields[titleField] += (titleFields[titleField] ? '\n' : '') + line.trim();
    } else {
      break;
    }
    start = index + 1;
  }
  const titlePage = start ? {
    title: titleFields.title || fallbackTitle, byline: titleFields.credit,
    author: titleFields.author ?? titleFields.authors, contact: titleFields.contact, draftDate: titleFields['draft date']
  } : undefined;
  if (titleFields.source || titleFields.copyright || titleFields.notes) warnings.add('Additional title page fields remain in the original.');
  const document = newDocument(titlePage?.title ?? fallbackTitle, 'screenplay');
  document.titlePage = titlePage;
  const blocks: Block[] = [];
  let speaking = false;
  let voice: Block[] = [];
  let lastVoice: Block[] = [];
  for (let index = start; index < lines.length; index++) {
    const raw = lines[index];
    const line = raw.trim();
    const next = lines[index + 1]?.trim() ?? '';
    if (!line) {
      if (speaking) lastVoice = voice;
      speaking = false;
      continue;
    }
    let kind: BlockKind = 'action';
    let value = line;
    const afterBreak = index === start || !lines[index - 1].trim();
    const forcedCue = line.startsWith('@');
    const dual = line.endsWith('^');
    const cue = (forcedCue ? line.slice(1) : line).replace(/\s*\^$/, '').trim();
    const upperCue = afterBreak && looksUpper(cue) && !!next;
    if (line.startsWith('!')) {
      value = raw.slice(raw.indexOf('!') + 1);
    } else if (scenePattern.test(line) || /^\.(?!\.)\S/.test(line)) {
      kind = 'scene';
      value = line.replace(/^\./, '');
    } else if (actPattern.test(line)) {
      kind = 'act';
    } else if (/^>.*<$/.test(line)) {
      value = line.slice(1, -1).trim();
      warnings.add('Centred action and inline emphasis may need review.');
    } else if (line.startsWith('>') || transitionPattern.test(line) && !speaking) {
      kind = 'transition';
      value = line.replace(/^>\s*/, '');
    } else if (/^\[\[.*\]\]$/.test(line)) {
      kind = 'note';
      value = line.slice(2, -2).trim();
    } else if (/^(?:#{1,6}(?!.*#\s*$)\s*|=(?!=)\s*|={3,}$)/.test(line)) {
      kind = 'note';
      warnings.add('Outline markup and explicit page breaks are carried as review notes.');
    } else if (forcedCue || (upperCue && !scenePattern.test(next))) {
      kind = 'character';
      value = cue;
      if (speaking) lastVoice = voice;
    } else if (speaking && /^\(.*\)$/.test(line)) {
      kind = 'parenthetical';
    } else if (speaking) {
      kind = 'dialogue';
    } else {
      value = raw;
    }
    const block = newBlock(kind, value);
    if (kind === 'action' || kind === 'dialogue' || kind === 'parenthetical') {
      const parsed = fromFountainEmphasis(value);
      block.text = parsed.text;
      if (parsed.styles) block.styles = parsed.styles;
    }
    if (kind === 'scene') {
      const number = /\s+#([^#]+)#\s*$/.exec(value);
      if (number) {
        block.sceneNumber = number[1];
        block.text = value.slice(0, number.index).trimEnd();
      }
    }
    if (kind === 'character') {
      if (dual && lastVoice.length) {
        block.dual = 'right';
        lastVoice.forEach(item => { item.dual = 'left'; });
      } else if (dual) warnings.add('The first cue of a dual dialogue pair could not be identified.');
      voice = [block];
      speaking = true;
    } else if (kind === 'dialogue' || kind === 'parenthetical') {
      block.dual = voice[0]?.dual;
      voice.push(block);
    } else {
      if (speaking) lastVoice = voice;
      speaking = false;
    }
    if (loose && (kind === 'character' && !forcedCue ||
      kind === 'action' && /^[\p{Lu}][\p{Ll}\p{M}]+(?:\s+[\p{Lu}][\p{Ll}\p{M}]+)?$/u.test(line) && next && !scenePattern.test(next))) {
      uncertain.push({ blockId: block.id, source: raw, suggested: 'character',
        reason: 'The source line could be a character cue or action text.' });
    }
    blocks.push(block);
  }
  document.blocks = blocks.length ? blocks : document.blocks;
  return { document, original: text, warnings: [...warnings], uncertain };
}

export function exportFountain(document: DocumentModel): string {
  const title = document.titlePage;
  const lines = title ? [
    ['Title', title.title], ['Credit', title.byline], ['Author', title.author],
    ['Draft date', title.draftDate], ['Contact', title.contact]
  ].filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => key + ': ' + value.replace(/\r?\n/g, '\n    ')) : [];
  if (lines.length) lines.push('');
  const addBoundary = () => { if (lines.length && lines[lines.length - 1] !== '') lines.push(''); };
  for (const block of document.blocks) {
    const { kind, text } = block;
    if (kind !== 'dialogue' && kind !== 'parenthetical') addBoundary();
    if (kind === 'scene') lines.push((scenePattern.test(text) ? '' : '.') + text + (block.sceneNumber ? ' #' + block.sceneNumber + '#' : ''));
    else if (kind === 'character') lines.push('@' + text + (block.dual === 'right' ? ' ^' : ''));
    else if (kind === 'transition') lines.push('> ' + text);
    else if (kind === 'note') lines.push('[[' + text.replace(/\r?\n/g, ' ').replaceAll(']]', '] ]') + ']]');
    else if (kind === 'dialogue' || kind === 'parenthetical' || kind === 'act') lines.push(toFountainEmphasis(text, block.styles));
    else lines.push('!' + toFountainEmphasis(text, block.styles).replace(/\r?\n/g, '\n!'));
  }
  return lines.join('\n') + '\n';
}

function paragraphText(node: XmlNode): string {
  return elements(node, 'Text').map(xmlText).join('');
}

function parseParagraph(node: XmlNode, warnings: Set<string>): Block {
  const input = attr(node, 'Type') ?? 'Action';
  const translated = (Object.entries(fdxType) as [BlockKind, string][]).find(([, value]) => value === input)?.[0];
  const kind = translated === 'note' && input === 'General' ? 'action' : translated;
  if (!kind) warnings.add('Some Final Draft paragraph types were converted to action. Review those lines.');
  let unsupportedStyle = false;
  const styled = fromRuns(elements(node, 'Text').map(run => {
    const { styles, unsupported } = fromFdxStyle(attr(run, 'Style'));
    unsupportedStyle ||= unsupported;
    return { text: xmlText(run), styles };
  }));
  const block = newBlock(kind ?? 'action', styled.text);
  if (styled.styles) block.styles = styled.styles;
  if (block.kind === 'scene') block.sceneNumber = attr(node, 'Number') ?? attr(element(node, 'SceneProperties'), 'Number');
  block.revision = attr(node, 'RevisionID') ?? elements(node, 'Text').map(run => attr(run, 'RevisionID')).find(Boolean);
  if (unsupportedStyle) warnings.add('Final Draft text styles other than bold, italic and underline remain in the original.');
  return block;
}

export function decodeFdx(source: string, fallbackTitle: string): ScriptConversion {
  const root = parseXml(source);
  const content = element(root, 'Content');
  if (localName(root.tag) !== 'FinalDraft' || !content) throw new Error('The file does not contain a Final Draft screenplay.');
  const warnings = new Set<string>();
  const document = newDocument(fallbackTitle, 'screenplay');
  const titlePage = element(root, 'TitlePage');
  if (titlePage) {
    const fields = elements(element(titlePage, 'Content') ?? titlePage, 'Paragraph')
      .map(node => [attr(node, 'Type'), paragraphText(node)] as const).filter(([, text]) => !!text.trim());
    const get = (name: string) => fields.find(([key]) => key?.toLowerCase() === name)?.[1];
    const title: TitlePage = {
      title: get('title') ?? fields[0]?.[1] ?? fallbackTitle,
      byline: get('credit'), author: get('author') ?? get('authors'),
      contact: get('contact'), draftDate: get('draft date')
    };
    document.title = title.title;
    document.titlePage = title;
  }
  const pageLayout = element(root, 'PageLayout');
  const paper = attr(pageLayout, 'PaperSize') ?? attr(element(root, 'PageSize'), 'Name');
  if (paper?.toLowerCase() === 'a4') document.paper = 'a4';
  for (const attribute of ['LockedPages', 'PageBreaks', 'Revisions', 'ScriptNotes', 'AlternateDialogue']) {
    if (element(root, attribute)) warnings.add('Custom Final Draft revision, note and page settings remain in the original.');
  }
  const blocks = elements(content).flatMap(paragraph => {
    const dual = localName(paragraph.tag) === 'DualDialogue' ? paragraph : element(paragraph, 'DualDialogue');
    if (!dual) return localName(paragraph.tag) === 'Paragraph' ? [parseParagraph(paragraph, warnings)] : [];
    let voices = 0;
    return elements(dual, 'Paragraph').map(node => {
      const block = parseParagraph(node, warnings);
      if (block.kind === 'character') voices++;
      block.dual = voices > 1 ? 'right' : 'left';
      return block;
    });
  });
  if (blocks.length) document.blocks = blocks;
  return { document, original: blocks.map(block => block.text).join('\n'), warnings: [...warnings], uncertain: [] };
}

function fdxParagraph(block: Block): string {
  const type = fdxType[block.kind];
  const number = block.kind === 'scene' && block.sceneNumber ? ' Number="' + escapeXml(block.sceneNumber) + '"' : '';
  const change = block.revision ? ' RevisionID="' + escapeXml(block.revision) + '"' : '';
  const runs = block.styles?.length
    ? styleRuns(block.text, block.styles).map(run => '<Text' + change + (run.styles.length ? ' Style="' + fdxStyle(run.styles) + '"' : '') + '>' + escapeXml(run.text) + '</Text>').join('')
    : '<Text' + change + '>' + escapeXml(block.text) + '</Text>';
  return '<Paragraph Type="' + type + '"' + number + '>' + runs + '</Paragraph>';
}

export function exportFdx(document: DocumentModel): string {
  const paragraphs: string[] = [];
  for (let index = 0; index < document.blocks.length; index++) {
    const block = document.blocks[index];
    if (block.kind === 'note') continue;
    if (block.kind !== 'character' || block.dual !== 'left') {
      paragraphs.push(fdxParagraph(block));
      continue;
    }
    const group = [block];
    let end = index + 1;
    while (end < document.blocks.length && document.blocks[end].dual &&
      !(document.blocks[end].kind === 'character' && document.blocks[end].dual === 'left')) {
      group.push(document.blocks[end++]);
    }
    if (group.some(item => item.dual === 'right')) {
      paragraphs.push('<Paragraph><DualDialogue>' + group.map(fdxParagraph).join('') + '</DualDialogue></Paragraph>');
      index = end - 1;
    } else {
      paragraphs.push(fdxParagraph(block));
    }
  }
  const title = document.titlePage;
  const titlePage = title ? '<TitlePage><Content>' + [
    ['Title', title.title], ['Credit', title.byline], ['Author', title.author], ['Contact', title.contact], ['Draft Date', title.draftDate]
  ].filter((entry): entry is [string, string] => Boolean(entry[1])).map(([key, value]) =>
    '<Paragraph Type="' + key + '"><Text>' + escapeXml(value) + '</Text></Paragraph>').join('') + '</Content></TitlePage>' : '';
  return xmlHeader + '<FinalDraft DocumentType="Script" Template="No" Version="1"><Content>' +
    paragraphs.join('') + '</Content>' + titlePage + '<PageLayout PaperSize="' +
    (document.paper === 'a4' ? 'A4' : 'Letter') + '"/></FinalDraft>';
}
