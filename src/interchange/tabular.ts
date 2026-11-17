import { parseDocument, stringify } from 'yaml';
import { newDocument, newId } from '../model';
import type { AVRow, DocumentModel } from '../model';
import { pack, requiredText, unpack } from './container';
import { attr, element, elements, escapeXml, parseXml, xmlHeader, xmlText } from './xml';

export type AVField = 'video' | 'audio' | 'duration' | 'cue';
export interface AVTable {
  headers: string[];
  records: string[][];
  mapping: Partial<Record<AVField, number>>;
  warnings: string[];
  firstRow: string[];
}

export const avFields: Record<AVField, string> = {
  video: 'Video', audio: 'Audio', duration: 'Duration', cue: 'Start cue'
};
const knownHeaders: Record<AVField, string[]> = {
  video: ['video', 'picture', 'visual', 'visuals', 'images', 'action', 'scene', 'on screen'],
  audio: ['audio', 'sound', 'voice', 'dialogue', 'voiceover', 'voice over', 'narration', 'vo'],
  duration: ['duration', 'duration seconds', 'duration sec', 'runtime', 'length', 'length seconds', 'time', 'seconds'],
  cue: ['cue', 'start', 'start cue', 'start time', 'cue seconds', 'timecode', 'start seconds']
};

export function tableFromRows(rows: string[][]): AVTable {
  if (!rows.length || !rows[0]?.length) throw new Error('No AV rows were found.');
  const mapping: AVTable['mapping'] = {};
  const width = Math.max(...rows.map(row => row.length));
  if (width > 128 || rows.length > 20000) throw new Error('The AV table exceeds 128 columns or 20,000 rows.');
  const headers = Array.from({ length: width }, (_, index) => rows[0][index]?.trim() || 'Column ' + (index + 1));
  for (const [field, options] of Object.entries(knownHeaders) as [AVField, string[]][]) {
    const column = headers.findIndex(value => options.includes(value.trim().toLowerCase().replace(/[_()-]+/g, ' ').replace(/\s+/g, ' ')));
    if (column >= 0) mapping[field] = column;
  }
  return { headers, records: rows.slice(1).filter(row => row.some(cell => cell.trim())), mapping, warnings: [], firstRow: rows[0] };
}

function parseDelimited(source: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let endedQuote = false;
  const appendCell = () => { row.push(cell); cell = ''; endedQuote = false; };
  const appendRow = () => {
    appendCell();
    if (row.length > 128 || rows.length >= 20000) throw new Error('The AV table exceeds 128 columns or 20,000 rows.');
    if (row.some(value => value.trim())) rows.push(row);
    row = [];
  };
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
        endedQuote = true;
      } else {
        cell += char;
      }
    } else if (char === delimiter) {
      appendCell();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index++;
      appendRow();
    } else if (char === '"' && !cell && !endedQuote) {
      quoted = true;
    } else if (!endedQuote) {
      cell += char;
    } else if (!/\s/.test(char)) {
      throw new Error('The CSV has text after a closing quote.');
    }
  }
  if (quoted) throw new Error('The CSV contains an unmatched quote.');
  if (cell || row.length || endedQuote) appendRow();
  return rows;
}

export function decodeCsv(source: string): AVTable {
  const header = source.slice(0, 4096).split(/\r?\n/)[0];
  const delimiter = header.includes('\t') && !header.includes(',') ? '\t' : ',';
  return tableFromRows(parseDelimited(source, delimiter));
}

export function decodeYaml(source: string): AVTable {
  const document = parseDocument(source, { schema: 'core', uniqueKeys: true });
  if (document.errors.length) throw new Error('Invalid AV YAML: ' + document.errors[0].message);
  const value: unknown = document.toJS({ maxAliasCount: 0 });
  const rows = Array.isArray(value) ? value : value && typeof value === 'object' && 'rows' in value ? value.rows : undefined;
  if (!Array.isArray(rows) || !rows.length || rows.length > 20000) throw new Error('AV YAML must contain up to 20,000 rows beneath a rows key or as a list.');
  const entries: Record<string, unknown>[] = rows.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Each AV YAML row must use named fields.');
    return item as Record<string, unknown>;
  });
  const keys = [...new Set(entries.flatMap(item => Object.keys(item)))];
  if (keys.length > 128) throw new Error('AV YAML exceeds 128 fields.');
  const data = entries.map(item => keys.map(key => {
    const cell = Object.hasOwn(item, key) ? item[key] : undefined;
    if (cell === undefined || cell === null) return '';
    if (['string', 'number', 'boolean'].includes(typeof cell)) return String(cell);
    throw new Error('AV YAML field values must be plain text or numbers.');
  }));
  return tableFromRows([keys, ...data]);
}

function sheetPath(target: string): string {
  if (/^(?:https?:|\/\/)|\\.|\.\./i.test(target)) throw new Error('The first worksheet refers to an external resource.');
  return target.startsWith('/') ? target.slice(1) : 'xl/' + target.normalize('NFC');
}

export function decodeXlsx(data: Uint8Array): AVTable {
  const files = unpack(data);
  const workbook = parseXml(requiredText(files, 'xl/workbook.xml'));
  const relations = parseXml(requiredText(files, 'xl/_rels/workbook.xml.rels'));
  const sheetId = attr(elements(element(workbook, 'sheets'), 'sheet')[0], 'id');
  const route = elements(relations, 'Relationship').find(link => attr(link, 'Id') === sheetId);
  const target = attr(route, 'Target');
  if (!target) throw new Error('The first worksheet is missing.');
  const sheet = parseXml(requiredText(files, sheetPath(target)));
  const shared = files['xl/sharedStrings.xml'] ? elements(parseXml(requiredText(files, 'xl/sharedStrings.xml')), 'si').map(item =>
    elements(item).filter(node => node.tag.endsWith('t') || node.tag.endsWith('r')).map(xmlText).join('')) : [];
  const styles = files['xl/styles.xml'] ? parseXml(requiredText(files, 'xl/styles.xml')) : undefined;
  const styleIds = elements(element(styles, 'cellXfs'), 'xf').map(item => Number(attr(item, 'numFmtId')));
  const timeStyles = new Set(elements(element(styles, 'numFmts'), 'numFmt')
    .filter(item => /\b[hms]+(:[hms]+)+\b|\[[hms]+\]/i.test(attr(item, 'formatCode') ?? ''))
    .map(item => Number(attr(item, 'numFmtId'))));
  for (const id of [18, 19, 20, 21, 22, 45, 46, 47]) timeStyles.add(id);
  let formulaFound = false;
  const records = elements(element(sheet, 'sheetData'), 'row').map(row => {
    const cells: string[] = [];
    for (const cell of elements(row, 'c')) {
      const address = /^([A-Z]{1,3})[1-9]\d*$/.exec(attr(cell, 'r') ?? '')?.[1];
      const column = address ? [...address].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1 : cells.length;
      if (column >= 128) throw new Error('The worksheet uses a column beyond the 128-column import limit.');
      const type = attr(cell, 't');
      const value = xmlText(element(cell, 'v'));
      if (element(cell, 'f')) formulaFound = true;
      if (type === 's') cells[column] = shared[Number(value)] ?? '';
      else if (type === 'inlineStr') cells[column] = xmlText(element(cell, 'is'));
      else if (value && timeStyles.has(styleIds[Number(attr(cell, 's') ?? 0)]) && Number.isFinite(Number(value))) {
        cells[column] = String(Math.round(Number(value) * 86400 * 1000) / 1000);
      } else cells[column] = value;
    }
    return Array.from({ length: cells.length }, (_, index) => cells[index] ?? '');
  });
  const table = tableFromRows(records);
  if (elements(element(workbook, 'sheets'), 'sheet').length > 1) table.warnings.push('Only the first worksheet is in this import. Move the AV sheet first to import a different tab.');
  if (formulaFound) table.warnings.push('Spreadsheet formulas are read from their saved values.');
  return table;
}

export function parseSeconds(text: string): number | undefined {
  const value = text.trim().replace(/\s*(?:seconds?|secs?|s)$/i, '');
  if (!value) return undefined;
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number.isFinite(Number(value)) ? Number(value) : undefined;
  const parts = value.split(':');
  if (parts.length < 2 || parts.length > 3 || !parts.every((part, index) =>
    (index < parts.length - 1 ? /^\d{1,4}$/ : /^\d{1,2}(?:\.\d+)?$/).test(part))) return undefined;
  const numbers = parts.map(Number);
  if (numbers.slice(1).some(number => number >= 60)) return undefined;
  return numbers.reduce((seconds, part) => seconds * 60 + part, 0);
}

export function tableToAv(table: AVTable, title: string, previous?: DocumentModel): { document: DocumentModel; warnings: string[]; missing: string[] } {
  const column = (field: AVField) => table.mapping[field];
  const cell = (row: string[], field: AVField) => row[column(field) ?? -1] ?? '';
  const missing = (['video', 'audio', 'duration'] as const).filter(field => column(field) === undefined).map(field => avFields[field]);
  const warnings = [...table.warnings];
  const document = newDocument(title, 'av');
  const invalidTiming: number[] = [];
  document.avRows = table.records.map((row, index) => {
    const duration = parseSeconds(cell(row, 'duration'));
    const rawCue = cell(row, 'cue').trim();
    const cue = parseSeconds(rawCue);
    if (column('duration') !== undefined && duration === undefined || rawCue && cue === undefined) invalidTiming.push(index + 2);
    return {
      id: previous?.avRows[index]?.id ?? newId(), video: cell(row, 'video'), audio: cell(row, 'audio'),
      durationSeconds: duration ?? 0, ...(cue === undefined ? {} : { cueSeconds: cue })
    };
  });
  if (invalidTiming.length) warnings.push('Check missing or invalid timing in source rows ' + invalidTiming.slice(0, 10).join(', ') +
    (invalidTiming.length > 10 ? ' and ' + (invalidTiming.length - 10) + ' more.' : '.'));
  return { document, warnings, missing };
}

function rowsForExport(rows: AVRow[]): Array<Array<string | number>> {
  return [['Video', 'Audio', 'Duration seconds', 'Cue seconds'],
    ...rows.map(row => [row.video, row.audio, row.durationSeconds, row.cueSeconds ?? ''])];
}

export function exportAvCsv(rows: AVRow[]): string {
  const quote = (text: string | number) => '"' + String(text).replaceAll('"', '""') + '"';
  return rowsForExport(rows).map(row => row.map(quote).join(',')).join('\r\n') + '\r\n';
}

export function exportAvYaml(rows: AVRow[]): string {
  return stringify({
    rows: rows.map(row => ({ video: row.video, audio: row.audio, duration_seconds: row.durationSeconds,
      ...(row.cueSeconds === undefined ? {} : { cue_seconds: row.cueSeconds }) }))
  });
}

const officeRelationship = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const packageRelationship = 'http://schemas.openxmlformats.org/package/2006/relationships';

export function exportAvXlsx(rows: AVRow[]): Uint8Array {
  const cells = rowsForExport(rows).map((row, index) =>
    '<row r="' + (index + 1) + '">' + row.map((value, column) => {
      const address = ' r="' + String.fromCharCode(65 + column) + (index + 1) + '"';
      return typeof value === 'number' ? '<c' + address + '><v>' + value + '</v></c>' :
        '<c' + address + ' t="inlineStr"><is><t xml:space="preserve">' + escapeXml(value) + '</t></is></c>';
    }).join('') + '</row>').join('');
  return pack({
    '[Content_Types].xml': xmlHeader + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': xmlHeader + '<Relationships xmlns="' + packageRelationship + '"><Relationship Id="rId1" Type="' +
      officeRelationship + '/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': xmlHeader + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="' +
      officeRelationship + '"><sheets><sheet name="AV" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': xmlHeader + '<Relationships xmlns="' + packageRelationship + '"><Relationship Id="rId1" Type="' +
      officeRelationship + '/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': xmlHeader + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + cells + '</sheetData></worksheet>'
  });
}
