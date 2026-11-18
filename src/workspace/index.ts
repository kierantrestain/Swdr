import { useCallback, useEffect, useRef, useState } from 'react';
import { newId } from '../model';
import type { Project } from '../model';
import { clearJournal, journalProject, loadWorkspace, writeProject } from './database';
import type { ProjectRecord } from './database';

export { createProject, issueDocument, resolveSource, restoreDocument, snapshotDocument } from './project';

export type LocalSaveStatus = 'loading' | 'saving' | 'saved' | 'error';
type ProjectMutation = Project | ((project: Project) => Project);

interface SaveQueue {
  queued?: ProjectRecord;
  persistedStamp: string | null;
  journalKeys: string[];
  active: boolean;
}

function toProjects(records: Map<string, ProjectRecord>): Project[] {
  return Array.from(records.values(), record => record.project)
    .filter((project): project is Project => project !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

/** Delay before writing a burst of edits to IndexedDB. */
const COALESCE_MS = 180;

export function useWorkspace() {
  const records = useRef(new Map<string, ProjectRecord>());
  const queues = useRef(new Map<string, SaveQueue>());
  const mounted = useRef(false);
  const errors = useRef(new Map<string, string>());
  const [projects, setProjects] = useState<Project[]>([]);
  const [status, setStatus] = useState<LocalSaveStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    mounted.current = true;
    loadWorkspace().then(loaded => {
      if (cancelled) return;
      records.current = loaded;
      setProjects(toProjects(loaded));
      setStatus('saved');
      setReady(true);
    }).catch((cause: unknown) => {
      if (cancelled) return;
      setError(cause instanceof Error ? cause.message : 'The local workspace could not be opened.');
      setStatus('error');
    });
    return () => {
      mounted.current = false;
      cancelled = true;
    };
  }, []);

  const syncStatus = useCallback(() => {
    if (!mounted.current) return;
    const failure = errors.current.values().next().value as string | undefined;
    setError(failure ?? null);
    setStatus(failure ? 'error' : [...queues.current.values()].some(queue => queue.active || queue.queued) ? 'saving' : 'saved');
  }, []);

  const drain = useCallback(async (id: string, queue: SaveQueue) => {
    if (queue.active) return;
    queue.active = true;
    syncStatus();
    // Coalesce a burst of edits (typing) into one write. Every change is already in the
    // synchronous localStorage journal, which load replays if the page closes first.
    await new Promise(resolve => setTimeout(resolve, COALESCE_MS));
    while (queue.queued) {
      const writing = queue.queued;
      queue.queued = undefined;
      const journalKeys = queue.journalKeys.splice(0);
      try {
        await writeProject(writing, queue.persistedStamp);
        queue.persistedStamp = writing.stamp;
        errors.current.delete(id);
        clearJournal(journalKeys);
      } catch (cause) {
        queue.queued ??= writing;
        queue.journalKeys.unshift(...journalKeys);
        errors.current.set(id, cause instanceof Error ? cause.message : 'Local save failed.');
        break;
      }
    }
    queue.active = false;
    if (!queue.queued) queues.current.delete(id);
    syncStatus();
  }, [syncStatus]);

  const change = useCallback((id: string, project: Project | null) => {
    const previous = records.current.get(id);
    const next = { id, stamp: newId(), project };
    let queue = queues.current.get(id);
    if (!queue) {
      queue = { persistedStamp: previous?.stamp ?? null, journalKeys: [], active: false };
      queues.current.set(id, queue);
    }
    const key = journalProject(previous, next);
    if (key) queue.journalKeys.push(key);
    records.current.set(id, next);
    queue.queued = next;
    setProjects(toProjects(records.current));
    void drain(id, queue);
  }, [drain]);

  const saveProject = useCallback((project: Project) => {
    const previous = records.current.get(project.id)?.project;
    if (previous && previous.snapshots !== project.snapshots) {
      const known = new Map(project.snapshots.map(snapshot => [snapshot.id, snapshot]));
      if (previous.snapshots.some(snapshot => {
        const target = known.get(snapshot.id);
        return target !== snapshot && JSON.stringify(target) !== JSON.stringify(snapshot);
      })) throw new Error('This update changes a stored snapshot. Restore the snapshot as a new head.');
    }
    const next = { ...project, updatedAt: new Date().toISOString() };
    change(project.id, next);
    return next;
  }, [change]);

  const updateProject = useCallback((id: string, mutation: ProjectMutation) => {
    const current = records.current.get(id)?.project;
    if (!current) return undefined;
    const next = typeof mutation === 'function' ? mutation(current) : mutation;
    if (next === current) return current;
    if (next.id !== id) throw new Error('A project ID cannot change during an update.');
    return saveProject(next);
  }, [saveProject]);

  const removeProject = useCallback((id: string) => {
    if (records.current.get(id)?.project) change(id, null);
  }, [change]);

  const retrySave = useCallback(() => {
    for (const [id, queue] of queues.current) void drain(id, queue);
  }, [drain]);

  return { projects, ready, status, error, saveProject, updateProject, removeProject, retrySave };
}
