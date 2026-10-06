/*
 * The files behind each project's sources, kept in this browser's IndexedDB.
 * localStorage (where boards live) holds only a few MB in total, while one PDF
 * or audio recording can be larger than that, so files go here instead.
 *
 * Records are keyed "<projectId>/<docId>" so duplicated projects get their own
 * copies and deleting one project never removes another's files.
 */

const DB_NAME = 'corkline-files';
const STORE = 'documents';

export interface StoredFile {
  key: string;
  projectId: string;
  docId: string;
  blob: Blob;
  /** Text pulled out of the file (plain text, Markdown, Word), cached so it's only extracted once. */
  text?: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: 'key' });
        store.createIndex('projectId', 'projectId');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(new Error('Browser file storage (IndexedDB) is unavailable.'));
      };
    });
  }
  return dbPromise;
}

function fileKey(projectId: string, docId: string): string {
  return `${projectId}/${docId}`;
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = work(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(request ? request.result : undefined);
        tx.onerror = () =>
          reject(
            tx.error?.name === 'QuotaExceededError'
              ? new Error('Browser storage is full.')
              : new Error(`Could not access stored files (${tx.error?.message ?? 'unknown error'}).`),
          );
      }),
  );
}

export async function putFile(projectId: string, docId: string, blob: Blob, text?: string): Promise<void> {
  const record: StoredFile = { key: fileKey(projectId, docId), projectId, docId, blob, text };
  await run('readwrite', (store) => store.put(record));
}

export async function getFile(projectId: string, docId: string): Promise<StoredFile | null> {
  const record = await run<StoredFile>('readonly', (store) => store.get(fileKey(projectId, docId)));
  return record ?? null;
}

export async function saveExtractedText(projectId: string, docId: string, text: string): Promise<void> {
  const record = await getFile(projectId, docId);
  if (record) await putFile(projectId, docId, record.blob, text);
}

export async function deleteFile(projectId: string, docId: string): Promise<void> {
  await run('readwrite', (store) => store.delete(fileKey(projectId, docId)));
}

async function projectFiles(projectId: string): Promise<StoredFile[]> {
  const records = await run<StoredFile[]>('readonly', (store) => store.index('projectId').getAll(projectId));
  return records ?? [];
}

export async function deleteProjectFiles(projectId: string): Promise<void> {
  const records = await projectFiles(projectId);
  await run('readwrite', (store) => {
    for (const r of records) store.delete(r.key);
  });
}

/** Copies every file of one project to another (used by Duplicate). */
export async function copyProjectFiles(fromProjectId: string, toProjectId: string): Promise<void> {
  const records = await projectFiles(fromProjectId);
  await run('readwrite', (store) => {
    for (const r of records) store.put({ ...r, key: fileKey(toProjectId, r.docId), projectId: toProjectId });
  });
}
