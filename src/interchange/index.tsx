import { Download } from 'lucide-react';
import type { WorkspaceViewProps } from '../model';
import { exportArchive } from './archive';
import { exportAvDocx, exportDocx } from './office';
import { exportPdf, pdfGlyphLoss } from './pdf-write';
import { exportFdx, exportFountain } from './screenplay';
import { exportAvCsv, exportAvXlsx, exportAvYaml } from './tabular';
import './interchange.css';

export { exportArchive, importArchive } from './archive';
export { readImport } from './intake';
export { acceptAvRevision, acceptRevision, reviewAvRevision, reviewRevision } from './reconcile';

function download(name: string, type: string, content: string | Uint8Array) {
  const part = typeof content === 'string' ? content : Uint8Array.from(content).buffer;
  const href = URL.createObjectURL(new Blob([part], { type }));
  const link = window.document.createElement('a');
  link.href = href;
  link.download = name;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 30000);
}

// eslint-disable-next-line no-control-regex -- Remove characters the download filename cannot contain.
const fileBase = (title: string) => title.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 120) || 'SWDR';

interface ExportFile {
  label: string;
  extension: string;
  type: string;
  content: () => string | Uint8Array;
  project?: boolean;
}

export function ExportActions({ project, document, onStatus, includeProject = true }:
  Pick<WorkspaceViewProps, 'project' | 'document' | 'onStatus'> & { includeProject?: boolean }) {
  const pdf: ExportFile = { label: 'PDF', extension: 'pdf', type: 'application/pdf', content: () => exportPdf(document) };
  const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const formats: ExportFile[] = document.kind === 'av' ? [
    pdf,
    { label: 'Two-column Word', extension: 'docx', type: docxType, content: () => exportAvDocx(document.avRows, document.paper) },
    { label: 'CSV table', extension: 'csv', type: 'text/csv;charset=utf-8', content: () => exportAvCsv(document.avRows) },
    { label: 'Excel table', extension: 'xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', content: () => exportAvXlsx(document.avRows) },
    { label: 'YAML data', extension: 'yaml', type: 'application/yaml', content: () => exportAvYaml(document.avRows) }
  ] : [
    pdf,
    { label: 'Final Draft', extension: 'fdx', type: 'application/xml', content: () => exportFdx(document) },
    { label: 'Fountain', extension: 'fountain', type: 'text/plain;charset=utf-8', content: () => exportFountain(document) },
    { label: 'Word', extension: 'docx', type: docxType, content: () => exportDocx(document) },
    { label: 'Plain text', extension: 'txt', type: 'text/plain;charset=utf-8', content: () => document.blocks.map(block => block.text).join('\n') + '\n' }
  ];
  if (includeProject) formats.push({ label: 'Project archive', extension: 'swdr', type: 'application/zip', project: true, content: () => exportArchive(project) });

  function save(format: ExportFile) {
    try {
      if (format.extension === 'pdf' && pdfGlyphLoss(document)) {
        onStatus('This draft contains characters outside the PDF Courier encoding. Use print or an editable export.');
        return;
      }
      download(fileBase(format.project ? project.title : document.title) + '.' + format.extension, format.type, format.content());
      if (format.project) { try { localStorage.setItem(`swdr-backup:${project.id}`, new Date().toISOString()); } catch { /* reminder only */ } }
      onStatus(format.label + ' export downloaded.');
    } catch (error) {
      onStatus(error instanceof Error ? error.message : 'The export could not be created.');
    }
  }

  return <details className="export-actions">
    <summary><Download size={15}/> Export</summary>
    <div className="export-menu">{formats.map(format => <button type="button" key={format.extension} onClick={event => {
      save(format);
      event.currentTarget.closest('details')?.removeAttribute('open');
    }}>
      <span>{format.label}</span><code>.{format.extension}</code>
    </button>)}</div>
  </details>;
}
