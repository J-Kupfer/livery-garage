/** Minimal key-value storage on IndexedDB (the template zip is too big for localStorage). */
const DB_NAME = 'otl-livery-creator';
const STORE = 'kv';

let db: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  db ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return db;
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const store = (await open()).transaction(STORE, mode).objectStore(STORE);
  return new Promise((resolve, reject) => {
    const request = action(store);
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  });
}

export const idbGet = <T>(key: string) => run<T | undefined>('readonly', (s) => s.get(key));
export const idbSet = (key: string, value: unknown) => run<void>('readwrite', (s) => s.put(value, key));
export const idbDelete = (key: string) => run<void>('readwrite', (s) => s.delete(key));
