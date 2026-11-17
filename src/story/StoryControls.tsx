import { ArrowUpRight, Link2 } from 'lucide-react';
import { sceneList } from '../model';
import type { DocumentModel, Project, SourceRef } from '../model';
import { exactSource, sourceDocument, sourceLabel } from './source';

export function initialSource(project: Project, document: DocumentModel): SourceRef | undefined {
  const screenplay = sceneList(document).length ? document : project.documents.find(item => sceneList(item).length);
  return screenplay && exactSource(project, screenplay, sceneList(screenplay)[0].blockId);
}

export function SourceFields({ project, value, onChange }: {
  project: Project;
  value?: SourceRef;
  onChange: (source: SourceRef | undefined) => void;
}) {
  const documents = project.documents.filter(document => sceneList(document).length);
  const selected = value && sourceDocument(project, value);
  const retained = selected && !documents.some(document => document.id === selected.id && document.revisionId === selected.revisionId);
  const entries = retained ? [selected, ...documents] : documents;
  const key = (document: DocumentModel) => `${document.id}:${document.revisionId}`;
  const scenes = selected ? sceneList(selected) : [];
  const start = scenes.find(scene => scene.id === value?.sceneId);
  const end = start && scenes.find(scene => scene.index > start.index)?.index;
  const blocks = start && selected ? selected.blocks.slice(start.index, end) : [];
  return <div className="swdr-story-source-fields">
    <label>Source script<select required value={selected ? key(selected) : ''} onChange={event => {
      const document = entries.find(document => key(document) === event.currentTarget.value);
      onChange(document && exactSource(project, document, sceneList(document)[0].blockId));
    }}>
      <option value="">Select a script with a scene</option>
      {entries.map(document => <option key={key(document)} value={key(document)}>{document.title}{!documents.includes(document) ? ' · Retained revision' : ''}</option>)}
    </select></label>
    <label>Source scene<select required disabled={!selected} value={value?.sceneId ?? ''} onChange={event => {
      if (selected) onChange(exactSource(project, selected, scenes.find(scene => scene.id === event.currentTarget.value)?.blockId));
    }}>
      <option value="">Select a scene</option>
      {scenes.map(scene => <option key={scene.id} value={scene.id}>{scene.number} · {scene.heading || 'Untitled scene'}</option>)}
    </select></label>
    <label>Exact source line<select required disabled={!start} value={value?.blockId ?? ''} onChange={event => {
      if (selected) onChange(exactSource(project, selected, event.currentTarget.value));
    }}>
      <option value="">Select a line</option>
      {blocks.map((block, index) => <option key={block.id} value={block.id}>{(start?.index ?? 0) + index + 1} · {block.text.slice(0, 115) || block.kind}</option>)}
    </select></label>
  </div>;
}

export function SourceButton({ project, source, onOpen, label }: {
  project: Project; source: SourceRef; onOpen: (source: SourceRef) => void; label?: string;
}) {
  return <button type="button" className="swdr-source-link quiet" title={`Revision ${source.revisionId}`} onClick={() => onOpen(source)}>
    <Link2 size={13} aria-hidden="true" />{label || sourceLabel(project, source)}<ArrowUpRight size={12} aria-hidden="true" />
  </button>;
}
