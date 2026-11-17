import type { Block, DocumentModel, Project } from '../model';

const DATABASE = 'swdr-workspace';
const PROJECT_STORE = 'projects';
const CACHE_STORE = 'cache';
const JOURNAL = 'swdr:journal:';

export interface ProjectRecord {
  id: string;
  stamp: string;
  project: Project | null;
}

type ProjectFields = Partial<Omit<Project, 'documents'>>;
type DocumentFields = Partial<Omit<DocumentModel, 'blocks'>>;
type Change =
  | { type: 'replace'; project: Project | null }
  | { type: 'patch'; fields: ProjectFields; documents?: DocumentModel[]; documentPatches?: DocumentPatch[] };
interface DocumentPatch {
  id: string;
  fields: DocumentFields;
  blocks?: Block[];
  blockPatches?: Array<[index: number, block: Block]>;
}

export interface JournalEntry {
  id: string;
  base: string | null;
  stamp: string;
  at: number;
  change: Change;
}

let database: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(PROJECT_STORE, { keyPath: 'id' });
      request.result.createObjectStore(CACHE_STORE);
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        database = undefined;
      };
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other SWDR tabs to finish opening the workspace.'));
  }).catch((error: unknown) => {
    database = undefined;
    throw error;
  }) as Promise<IDBDatabase>;
  return database;
}

function transact<T>(
  db: IDBDatabase,
  name: string,
  mode: IDBTransactionMode,
  execute: (store: IDBObjectStore, completeWith: (result: T) => void, failWith: (error: Error) => void) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = mode === 'readwrite'
      ? db.transaction(name, mode, { durability: 'strict' })
      : db.transaction(name, mode);
    let value: T;
    let failure: Error | undefined;
    transaction.oncomplete = () => resolve(value);
    transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('The local write was interrupted.'));
    transaction.onerror = () => reject(failure ?? transaction.error ?? new Error('The local workspace could not be accessed.'));
    execute(
      transaction.objectStore(name),
      result => { value = result; },
      error => { failure = error; transaction.abort(); }
    );
  });
}

async function allRecords(): Promise<ProjectRecord[]> {
  const db = await openDatabase();
  return transact(db, PROJECT_STORE, 'readonly', (store, finish) => {
    const read = store.getAll();
    read.onsuccess = () => finish(read.result);
  });
}

export async function writeProject(record: ProjectRecord, base: string | null): Promise<void> {
  const db = await openDatabase();
  return transact(db, PROJECT_STORE, 'readwrite', (store, finish, fail) => {
    const read = store.get(record.id);
    read.onsuccess = () => {
      const saved = read.result as ProjectRecord | undefined;
      if ((saved?.stamp ?? null) !== base) {
        fail(new Error('Another tab saved this project. Close other SWDR tabs and reopen before resuming this draft.'));
        return;
      }
      store.put(record);
      finish(undefined);
    };
  });
}

export async function readWorkspaceCache<T>(key: string): Promise<T | undefined> {
  const db = await openDatabase();
  return transact(db, CACHE_STORE, 'readonly', (store, finish) => {
    const read = store.get(key);
    read.onsuccess = () => finish(read.result);
  });
}

export async function writeWorkspaceCache<T>(key: string, value: T): Promise<void> {
  const db = await openDatabase();
  return transact(db, CACHE_STORE, 'readwrite', (store, finish) => {
    store.put(value, key);
    finish(undefined);
  });
}

export async function removeWorkspaceCache(key: string): Promise<void> {
  const db = await openDatabase();
  return transact(db, CACHE_STORE, 'readwrite', (store, finish) => {
    store.delete(key);
    finish(undefined);
  });
}

function documentPatch(previous: DocumentModel, next: DocumentModel): DocumentPatch {
  const fields: DocumentFields = {};
  const removed = new Set(Object.keys(previous).filter(key => !Object.hasOwn(next, key)));
  for (const key of Object.keys(next) as Array<keyof DocumentFields>) {
    if (key !== ('blocks' as keyof DocumentFields) && previous[key] !== next[key]) {
      Object.assign(fields, { [key]: next[key] });
    }
  }
  // Optional fields can be cleared. Retain the complete non-block fields in that case.
  if (removed.size) {
    const { blocks, ...nextFields } = next;
    return { id: previous.id, fields: nextFields, blocks };
  }
  if (previous.blocks === next.blocks) return { id: previous.id, fields };
  if (previous.blocks.length !== next.blocks.length) return { id: previous.id, fields, blocks: next.blocks };
  const blockPatches: DocumentPatch['blockPatches'] = [];
  for (const [index, block] of next.blocks.entries()) {
    if (previous.blocks[index].id !== block.id) return { id: previous.id, fields, blocks: next.blocks };
    if (previous.blocks[index] !== block) blockPatches.push([index, block]);
  }
  return { id: previous.id, fields, blockPatches };
}

function changeFor(previous: Project | null, next: Project | null): Change {
  if (!previous || !next || Object.keys(previous).some(key => !Object.hasOwn(next, key))) {
    return { type: 'replace', project: next };
  }
  const fields: ProjectFields = {};
  for (const key of Object.keys(next) as Array<keyof ProjectFields>) {
    if (key !== ('documents' as keyof ProjectFields) && previous[key] !== next[key]) {
      Object.assign(fields, { [key]: next[key] });
    }
  }
  if (previous.documents === next.documents) return { type: 'patch', fields };
  if (previous.documents.length !== next.documents.length || next.documents.some((document, index) => document.id !== previous.documents[index].id)) {
    return { type: 'patch', fields, documents: next.documents };
  }
  const documentPatches = next.documents.flatMap((document, index) => document === previous.documents[index]
    ? []
    : [documentPatch(previous.documents[index], document)]);
  return { type: 'patch', fields, documentPatches };
}

function applyChange(previous: Project | null, change: Change): Project | null {
  if (change.type === 'replace') return change.project;
  if (!previous) throw new Error('The recovery record is missing its project.');
  let documents = change.documents ?? previous.documents;
  if (change.documentPatches?.length) {
    const patches = new Map(change.documentPatches.map(patch => [patch.id, patch]));
    documents = documents.map(document => {
      const patch = patches.get(document.id);
      if (!patch) return document;
      if (patch.blocks) {
        // An ordinary replacement preserves every unrelated document field.
        return { ...document, ...patch.fields, blocks: patch.blocks };
      }
      const blocks = patch.blockPatches?.length ? [...document.blocks] : document.blocks;
      patch.blockPatches?.forEach(([index, block]) => { blocks[index] = block; });
      return { ...document, ...patch.fields, blocks };
    });
  }
  return { ...previous, ...change.fields, documents };
}

export function journalProject(previous: ProjectRecord | undefined, next: ProjectRecord): string | undefined {
  const entry: JournalEntry = {
    id: next.id, base: previous?.stamp ?? null, stamp: next.stamp, at: Date.now(),
    change: changeFor(previous?.project ?? null, next.project)
  };
  const key = JOURNAL + next.stamp;
  try {
    localStorage.setItem(key, JSON.stringify(entry));
    return key;
  } catch {
    // IDB may still have space for this write, particularly for large assets.
    return undefined;
  }
}

export function clearJournal(keys: readonly string[]): void {
  try {
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // Recovery is idempotent as soon as the stamped IDB record has committed.
  }
}

function readJournal(): Array<[string, JournalEntry]> {
  const result: Array<[string, JournalEntry]> = [];
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith(JOURNAL)) continue;
      const value = localStorage.getItem(key);
      if (!value) continue;
      try {
        const entry = JSON.parse(value) as JournalEntry;
        if (entry.stamp === key.slice(JOURNAL.length) && typeof entry.id === 'string' && entry.change) {
          result.push([key, entry]);
        }
      } catch {
        // One malformed entry does not prevent other drafts from reopening.
      }
    }
  } catch {
    // Storage can be disabled independently of IndexedDB.
  }
  return result.sort((left, right) => left[1].at - right[1].at);
}

export async function loadWorkspace(): Promise<Map<string, ProjectRecord>> {
  const records = new Map((await allRecords()).map(record => [record.id, record]));
  const journal = readJournal();
  const committed = new Map(records);
  const applied = new Set<string>();
  let progress = true;
  while (progress) {
    progress = false;
    for (const [key, entry] of journal) {
      if (applied.has(key)) continue;
      const previous = records.get(entry.id);
      if (previous?.stamp === entry.stamp) {
        applied.add(key);
        progress = true;
        continue;
      }
      if ((previous?.stamp ?? null) !== entry.base) continue;
      records.set(entry.id, {
        id: entry.id, stamp: entry.stamp,
        project: applyChange(previous?.project ?? null, entry.change)
      });
      applied.add(key);
      progress = true;
    }
  }
  for (const record of records.values()) {
    const saved = committed.get(record.id);
    if (record.stamp !== saved?.stamp) await writeProject(record, saved?.stamp ?? null);
  }
  // An intermediate record can have reached IDB just before a hard restart.
  // Its already-superseded predecessors can be discarded.
  const byStamp = new Map(journal.map(([key, entry]) => [entry.stamp, [key, entry] as const]));
  for (const [key, entry] of journal) {
    if (!applied.has(key)) continue;
    let previous = entry.base ? byStamp.get(entry.base) : undefined;
    while (previous && !applied.has(previous[0])) {
      applied.add(previous[0]);
      previous = previous[1].base ? byStamp.get(previous[1].base) : undefined;
    }
  }
  clearJournal([...applied]);
  return records;
}
