import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { createPortal } from 'react-dom';
import type { DocumentModel } from '../model';
import { paginateDocument, revisionInk } from './layout';
import { timedRows, timingLabel } from './av-timing';

export function useScriptPrint(document: DocumentModel) {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const finish = () => setPrinting(false);
    window.addEventListener('afterprint', finish);
    return () => window.removeEventListener('afterprint', finish);
  }, []);
  function requestPrint() {
    flushSync(() => setPrinting(true));
    window.print();
  }
  const output = !printing ? null : createPortal(
    <div className="swdr-print-area">
      <style media="print">{`@page { size: ${document.paper === 'a4' ? 'A4' : 'letter'}; margin: ${document.kind === 'av' ? '0.55in' : '0'}; }`}</style>
      {document.kind === 'av' ? <AVPrint document={document} /> : <ManuscriptPrint document={document} />}
    </div>,
    window.document.body
  );
  return { output, requestPrint };
}

function ManuscriptPrint({ document }: { document: DocumentModel }) {
  const { geometry, pages } = paginateDocument(document);
  return pages.map((page, index) => (
    <article className="swdr-print-page" style={{ width: `${geometry.width}pt`, height: `${geometry.height}pt` }} key={index}>
      {page.lines.map((line, lineIndex) => (
        <div className="swdr-print-line" key={lineIndex} style={{
          top: `${line.y}pt`, left: `${line.x}pt`, width: `${line.width}pt`,
          textAlign: line.align, color: revisionInk(line.revision) || '#111', fontSize: `${geometry.fontSize}pt`
        }}>{line.text}</div>
      ))}
    </article>
  ));
}

function AVPrint({ document }: { document: DocumentModel }) {
  const timing = timedRows(document.avRows);
  return <article className="swdr-print-av">
    <h1>{document.title}</h1>
    <table>
      <thead><tr><th>Timecode</th><th>Video</th><th>Audio</th></tr></thead>
      <tbody>{timing.rows.map(row => <tr key={row.id}>
        <td>{timingLabel(row.startSeconds)}–{timingLabel(row.endSeconds)}</td>
        <td>{row.video}</td><td>{row.audio}</td>
      </tr>)}</tbody>
    </table>
    <p>Runtime {timingLabel(timing.durationSeconds)}</p>
  </article>;
}
