import { ArrowUpRight, X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';
import type { Project, Snapshot, SourceRef, WorkspaceViewProps } from '../model';
import type { ProductionOutput, ProductionPlan, ScriptChange } from './model';

export interface PaneProps {
  /** Scenes whose writing draft differs from the issued snapshot used by production. */
  changes: ScriptChange[];
  /** Opens the release flow to issue the latest draft and review its production links. */
  reviewScript?: () => void;
  project: Project;
  plan: ProductionPlan;
  snapshot: Snapshot;
  source: SourceRef;
  readOnly?: boolean;
  update: (change: (plan: ProductionPlan, project: Project) => ProductionPlan, message?: string) => boolean;
  /** Changes the project and this plan together, such as adding a photo asset and linking it. */
  /** Builds or refreshes cast, locations and page counts from the issued script. */
  syncScript?: () => void;
  updateProject: (change: (project: Project, plan: ProductionPlan) => Project, message?: string) => boolean;
  onOpenSource: WorkspaceViewProps['onOpenSource'];
  onProjectChange: WorkspaceViewProps['onProjectChange'];
  onStatus: WorkspaceViewProps['onStatus'];
  issueOutput: (kind: ProductionOutput['kind'], filename: string, content: string) => void;
}

export function SourceButton({ source, onOpenSource, children }: PropsWithChildren<{
  source: SourceRef;
  onOpenSource: PaneProps['onOpenSource'];
}>) {
  return <button type="button" className="production-source" onClick={() => onOpenSource(source)}>
    {children || 'Source'} <ArrowUpRight size={13} aria-hidden="true" />
  </button>;
}

export function Empty({ children, action }: PropsWithChildren<{ action?: ReactNode }>) {
  return <div className="production-empty"><p>{children}</p>{action}</div>;
}

export function Dialog({ title, onClose, print, children }: PropsWithChildren<{
  title: string;
  onClose: () => void;
  print?: boolean;
}>) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); };
  }, []);
  return <dialog
    ref={dialog}
    className={`production-dialog${print ? ' production-print' : ''}`}
    aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}
  >
    <div className="production-dialog-heading">
      <h2 id={titleId}>{title}</h2>
      <button type="button" className="production-icon" onClick={onClose} aria-label="Close preview"><X size={20} /></button>
    </div>
    {children}
  </dialog>;
}

export function downloadText(filename: string, content: string) {
  const type = filename.endsWith('.csv') ? 'text/csv;charset=utf-8' : filename.endsWith('.json') ? 'application/json' : 'text/plain;charset=utf-8';
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function displayDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
  }).format(parsed);
}
