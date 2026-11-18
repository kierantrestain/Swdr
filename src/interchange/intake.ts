import { newId } from '../model';
import type { Asset, Project } from '../model';
import { importArchive } from './archive';
import { dataUrl, decodeText, MAX_FILE_BYTES } from './container';
import { decodeOdraft } from './odraft';
import { decodeDocx } from './office';
import { decodePdf } from './pdf-read';
import { readRtf } from './rtf';
import { decodeBundle } from './bundles';
import { decodeFdx, decodeFountain } from './screenplay';
import type { ScriptConversion } from './screenplay';
import { decodeCsv, decodeXlsx, decodeYaml } from './tabular';
import type { AVTable } from './tabular';

export const fileFormats = {
  fdx: ['Final Draft', 'application/xml'],
  fountain: ['Fountain', 'text/plain'],
  txt: ['Plain text', 'text/plain'],
  docx: ['Word', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  rtf: ['Rich text', 'application/rtf'],
  pdf: ['PDF', 'application/pdf'],
  odraft: ['OpenDraft', 'application/json'],
  celtx: ['Celtx', 'application/zip'],
  fadein: ['Fade In', 'application/zip'],
  osf: ['Open Screenplay Format', 'application/xml'],
  highland: ['Highland', 'application/zip'],
  wdz: ['WriterDuet backup', 'application/zip'],
  swdr: ['SWDR project archive', 'application/zip'],
  csv: ['CSV', 'text/csv'],
  xlsx: ['Excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  yaml: ['YAML', 'application/yaml'],
  yml: ['YAML', 'application/yaml']
} as const;

export type IntakeResult =
  | { type: 'script'; conversion: ScriptConversion; source: Asset; relatedAssets?: Asset[] }
  | { type: 'av'; table: AVTable; source: Asset; title: string }
  | { type: 'archive'; project: Project };

export function pathExtension(name: string): string {
  return (/\.(\w+)$/.exec(name)?.[1] ?? '').toLowerCase();
}

function conversionRoute(extension: string): string {
  if (extension === 'doc' || extension === 'pages' || extension === 'gdoc') return 'Open the source in Word, Google Docs or Pages and export as Word (.docx), then import the editable file.';
  if (extension === 'fdr') return 'Open this older Final Draft file in Final Draft and save a new .fdx copy.';
  if (['cxscript', 'sbx', 'arc'].includes(extension)) {
    return 'Open this file in the source application and export an editable Final Draft (.fdx), Fountain or Word (.docx) copy.';
  }
  return 'Choose a supported file. For a cloud link, open the original app and download an editable DOCX, FDX, Fountain or AV table first.';
}

export async function readImport(name: string, bytes: Uint8Array, mode: 'screenplay' | 'av', signal?: AbortSignal): Promise<IntakeResult> {
  signal?.throwIfAborted();
  if (bytes.length > MAX_FILE_BYTES) throw new Error('This file exceeds the 24 MB import limit.');
  if (!bytes.length) throw new Error('The selected file is empty.');
  const extension = pathExtension(name);
  if (!Object.hasOwn(fileFormats, extension)) throw new Error(conversionRoute(extension));
  if (extension === 'swdr') return { type: 'archive', project: importArchive(bytes) };
  const title = name.replace(/\.\w+$/, '') || 'Imported draft';
  const source: Asset = { id: newId(), name, mime: fileFormats[extension as keyof typeof fileFormats][1],
    dataUrl: dataUrl(bytes, fileFormats[extension as keyof typeof fileFormats][1]), addedAt: new Date().toISOString() };
  let conversion: ScriptConversion & { relatedAssets?: Asset[] };
  if (extension === 'pdf') conversion = await decodePdf(bytes, title, signal);
  else if (extension === 'docx') {
    const result = decodeDocx(bytes, title, mode === 'av');
    if ('headers' in result) return { type: 'av', table: result, source, title };
    conversion = result;
  } else if (extension === 'xlsx') return { type: 'av', table: decodeXlsx(bytes), source, title };
  else if (extension === 'csv') return { type: 'av', table: decodeCsv(decodeText(bytes)), source, title };
  else if (extension === 'yaml' || extension === 'yml') return { type: 'av', table: decodeYaml(decodeText(bytes)), source, title };
  else if (['celtx', 'fadein', 'osf', 'highland', 'wdz'].includes(extension)) conversion = decodeBundle(bytes, extension, title);
  else if (extension === 'rtf') conversion = decodeFountain(readRtf(new TextDecoder('windows-1252').decode(bytes)), title, true);
  else {
    const text = decodeText(bytes);
    if (extension === 'fdx') conversion = decodeFdx(text, title);
    else if (extension === 'odraft') conversion = decodeOdraft(text, title);
    else conversion = decodeFountain(text, title, extension === 'txt');
  }
  signal?.throwIfAborted();
  return { type: 'script', conversion, source, relatedAssets: conversion.relatedAssets };
}
