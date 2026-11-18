import { useCallback, useEffect, useRef, useState } from 'react';
import { mergeTeamProjects } from '../../server/team-model';
import { newId } from '../model';
import type { Project } from '../model';
import { readWorkspaceCache, removeWorkspaceCache, writeWorkspaceCache } from './database';
import type { TeamProject, TeamResponse } from './team-contract';

const RECORD_KEY = 'team/current';
const CACHE_WINDOW = 12 * 3600000;

export type TeamLocalStatus = 'saved' | 'saving' | 'error';
export type TeamServerStatus = 'synced' | 'pending' | 'syncing' | 'offline' | 'conflict' | 'denied' | 'error';

export class TeamRequestError extends Error {
  public readonly latest?: TeamProject;
  public readonly conflicts?: string[];

  constructor(public readonly status: number, response: TeamResponse<unknown>) {
    super(response.error ?? 'The team request failed.');
    this.latest = response.latest;
    this.conflicts = response.conflicts;
  }
}

export async function teamRequest<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/team', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, action }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw new TeamRequestError(0, { error: 'SWDR is offline. Saved local team edits are queued.' });
  }
  let payload: TeamResponse<T>;
  try {
    payload = await response.json() as TeamResponse<T>;
  } catch {
    throw new TeamRequestError(response.status, { error: 'The private team route is not available on this server.' });
  }
  if (!response.ok || payload.data === undefined) throw new TeamRequestError(response.status, payload);
  return payload.data;
}

interface PendingSave {
  operationId: string;
  version: number;
  project: Project;
}

interface TeamCache {
  verifiedAt: number;
  head: TeamProject;
  draft?: Project;
  pending?: PendingSave;
  conflict?: { latest: TeamProject; paths: string[] };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The team request failed.';
}

function sameAccess(left: TeamProject, right: TeamProject): boolean {
  const a = left.grant;
  const b = right.grant;
  return a.email === b.email && a.role === b.role
    && Array.isArray(a.episodeIds) === Array.isArray(b.episodeIds)
    && (a.episodeIds ?? []).length === (b.episodeIds ?? []).length
    && a.episodeIds?.every(id => b.episodeIds?.includes(id)) !== false;
}

export function useTeamDraft() {
  const [state, setState] = useState<TeamCache>();
  const [localStatus, setLocalStatus] = useState<TeamLocalStatus>('saved');
  const [serverStatus, setServerStatus] = useState<TeamServerStatus>('synced');
  const [message, setMessage] = useState<string>();
  const cache = useRef<TeamCache | undefined>(undefined);
  const writes = useRef(Promise.resolve());
  const busy = useRef(false);
  const generation = useRef(0);
  const mount = useRef(true);

  useEffect(() => {
    mount.current = true;
    return () => { mount.current = false; };
  }, []);

  const persist = useCallback((next?: TeamCache): Promise<void> => {
    cache.current = next;
    setState(next);
    setLocalStatus('saving');
    const write = writes.current.catch(() => undefined).then(() => next
      ? writeWorkspaceCache(RECORD_KEY, next)
      : removeWorkspaceCache(RECORD_KEY));
    writes.current = write;
    void write.then(() => {
      if (mount.current && writes.current === write) setLocalStatus('saved');
    }, () => {
      if (mount.current && writes.current === write) setLocalStatus('error');
    });
    return write;
  }, []);

  const flush = useCallback(async () => {
    const opening = cache.current;
    if (!opening || busy.current) return;
    if (!navigator.onLine) {
      setServerStatus('offline');
      return;
    }
    busy.current = true;
    const stamp = generation.current;
    try {
      if (opening.conflict || (!opening.pending && !opening.draft)) {
        const remote = await teamRequest<TeamProject>('open', { projectId: opening.head.project.id });
        if (!mount.current || generation.current !== stamp) return;
        const current = cache.current;
        if (!current) return;
        if (!sameAccess(current.head, remote)) {
          void persist({ head: remote, verifiedAt: Date.now() });
          setMessage('Your project access changed.');
          setServerStatus('synced');
          return;
        }
        if (current.conflict) {
          if (current.conflict.latest.version !== remote.version) {
            void persist({ ...current, conflict: { ...current.conflict, latest: remote }, verifiedAt: Date.now() });
          }
          setServerStatus('conflict');
          return;
        }
        if (current.draft || current.pending) return;
        if (current.head.version !== remote.version) void persist({ head: remote, verifiedAt: Date.now() });
        setServerStatus('synced');
        setMessage(undefined);
        return;
      }
      const pending = opening.pending ?? {
        operationId: newId(), version: opening.head.version, project: opening.draft!
      };
      if (!opening.pending) {
        setServerStatus('pending');
        await persist({ ...opening, pending });
      } else {
        await writes.current;
      }
      if (!mount.current || generation.current !== stamp) return;
      setServerStatus('syncing');
      const updated = await teamRequest<TeamProject>('save', {
        projectId: opening.head.project.id, ...pending,
        expectedRole: opening.head.grant.role, expectedEpisodeIds: opening.head.grant.episodeIds
      });
      if (!mount.current || generation.current !== stamp) return;
      const current = cache.current;
      if (!current) return;
      const outstanding = current.draft && current.draft !== pending.project;
      if (outstanding && current.draft && sameAccess(current.head, updated)) {
        const merge = mergeTeamProjects(pending.project, current.draft, updated.project);
        if (merge.conflicts.length) {
          void persist({ ...current, pending: undefined, conflict: { latest: updated, paths: merge.conflicts } });
          setServerStatus('conflict');
          setMessage('An edit overlaps a change from another writer.');
        } else {
          void persist({ head: updated, draft: merge.project, verifiedAt: Date.now() });
          setServerStatus('pending');
          setMessage(undefined);
        }
      } else {
        void persist({ head: updated, verifiedAt: Date.now() });
        setServerStatus('synced');
        setMessage(undefined);
      }
    } catch (error) {
      if (!mount.current || generation.current !== stamp) return;
      const current = cache.current;
      setMessage(errorMessage(error));
      if (error instanceof TeamRequestError) {
        if (error.status === 401 || error.status === 403 || error.status === 404) {
          void persist(undefined);
          setServerStatus('denied');
        } else if (error.status === 409 && current && error.latest) {
          if (sameAccess(current.head, error.latest)) {
            void persist({ ...current, conflict: { latest: error.latest, paths: error.conflicts ?? ['project'] } });
            setServerStatus('conflict');
          } else {
            void persist({ head: error.latest, verifiedAt: Date.now() });
            setServerStatus('synced');
            setMessage('Your project access changed.');
          }
        } else {
          setServerStatus(error.status === 0 ? 'offline' : 'error');
        }
      } else {
        setServerStatus('error');
      }
    } finally {
      busy.current = false;
    }
  }, [persist]);

  // Sync faster while collaborators are active, slower when alone, and rarely in a background tab.
  const pace = useRef(1750);
  const setPace = useCallback((ms: number) => { pace.current = ms; }, []);
  useEffect(() => {
    let timer = 0;
    const loop = () => {
      timer = window.setTimeout(() => { void flush(); loop(); }, document.visibilityState === 'hidden' ? 6000 : pace.current);
    };
    loop();
    window.addEventListener('online', flush);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('online', flush);
    };
  }, [flush]);

  const open = useCallback(async (projectId: string, email: string, initial?: TeamProject) => {
    const old = await readWorkspaceCache<TeamCache>(RECORD_KEY);
    try {
      const remote = initial ?? await teamRequest<TeamProject>('open', { projectId });
      generation.current++;
      if (old?.head.project.id === projectId && old.head.grant.email === email && sameAccess(old.head, remote)
        && (old.draft || old.pending || old.conflict)) {
        await persist({ ...old, verifiedAt: Date.now() });
        setServerStatus(old.conflict ? 'conflict' : 'pending');
      } else {
        await persist({ verifiedAt: Date.now(), head: remote });
        setServerStatus('synced');
      }
      setMessage(undefined);
    } catch (error) {
      if (old?.head.project.id === projectId && old.head.grant.email === email && error instanceof TeamRequestError && error.status === 0
        && old.verifiedAt > Date.now() - CACHE_WINDOW) {
        generation.current++;
        await persist(old);
        setServerStatus('offline');
        return;
      }
      if (old?.head.project.id === projectId && error instanceof TeamRequestError
        && (error.status === 401 || error.status === 403 || error.status === 404)) {
        generation.current++;
        await persist(undefined);
      }
      throw error;
    }
  }, [persist]);

  const resume = useCallback(async (email?: string) => {
    const saved = await readWorkspaceCache<TeamCache>(RECORD_KEY);
    if (!saved) return undefined;
    if ((email && saved.head.grant.email !== email) || saved.verifiedAt <= Date.now() - CACHE_WINDOW) {
      await persist(undefined);
      return undefined;
    }
    await open(saved.head.project.id, saved.head.grant.email);
    return saved.head.grant.email;
  }, [open, persist]);

  const close = useCallback(async () => {
    if (cache.current?.draft || cache.current?.pending || cache.current?.conflict) {
      throw new Error('This draft has pending edits. Sync or resolve them before opening another team project.');
    }
    generation.current++;
    await persist(undefined);
  }, [persist]);

  const forget = useCallback(async () => {
    generation.current++;
    await persist(undefined);
    setMessage(undefined);
  }, [persist]);

  const edit = useCallback((mutation: Project | ((project: Project) => Project)) => {
    const active = cache.current;
    if (!active || !['owner', 'editor'].includes(active.head.grant.role) || active.conflict) return;
    const base = active.draft ?? active.head.project;
    const draft = typeof mutation === 'function' ? mutation(base) : mutation;
    if (draft === base || draft.id !== base.id) return;
    void persist({ ...active, draft });
    setServerStatus(navigator.onLine ? 'pending' : 'offline');
  }, [persist]);

  const acceptServer = useCallback((head: TeamProject) => {
    if (cache.current?.head.project.id !== head.project.id) return;
    generation.current++;
    void persist({ head, verifiedAt: Date.now() });
    setServerStatus('synced');
    setMessage(undefined);
  }, [persist]);

  const resolve = useCallback((decision: 'server' | 'stash') => {
    const active = cache.current;
    if (!active?.conflict) return;
    const { latest } = active.conflict;
    const existing = active.draft ?? active.pending?.project;
    if (decision === 'stash' && existing && ['owner', 'editor'].includes(latest.grant.role)) {
      const stamp = new Date().toISOString();
      const stashes = existing.documents.flatMap(document => {
        const latestDocument = latest.project.documents.find(item => item.id === document.id);
        const previous = active.head.project.documents.find(item => item.id === document.id);
        if (!latestDocument || JSON.stringify(previous) === JSON.stringify(document)) return [];
        return [{
          id: newId(), kind: 'stash' as const, label: 'Recovered offline edit', createdAt: stamp,
          document: { ...structuredClone(document), revisionId: newId() }
        }];
      });
      if (stashes.length) {
        void persist({
          head: latest, verifiedAt: Date.now(),
          draft: { ...latest.project, snapshots: [...latest.project.snapshots, ...stashes] }
        });
        setServerStatus('pending');
        setMessage('Your version is available in the draft history.');
        return;
      }
    }
    if (decision === 'stash') {
      setMessage('This conflict has no changed script to stash.');
    }
    if (decision === 'server') {
      void persist({ head: latest, verifiedAt: Date.now() });
      setServerStatus('synced');
      setMessage(undefined);
    }
  }, [persist]);

  return { state, localStatus, serverStatus, message, open, resume, close, forget, edit, acceptServer, resolve, flush, setPace };
}
