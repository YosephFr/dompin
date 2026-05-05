declare global {
  interface FileSystemHandlePermissionDescriptor {
    mode?: 'read' | 'readwrite';
  }

  interface FileSystemHandle {
    queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<
      'granted' | 'denied' | 'prompt'
    >;
    requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<
      'granted' | 'denied' | 'prompt'
    >;
  }

  interface ShowDirectoryPickerOptions {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?:
      | FileSystemHandle
      | 'desktop'
      | 'documents'
      | 'downloads'
      | 'music'
      | 'pictures'
      | 'videos';
  }

  interface Window {
    showDirectoryPicker(options?: ShowDirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
  }
}

const DB_NAME = 'dompin';
const STORE = 'handles';
const KEY = 'vault-root';

export type RootPermissionState = 'granted' | 'prompt' | 'denied' | 'none';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result: T;
    const out = fn(store);
    if (out instanceof IDBRequest) {
      out.onsuccess = () => {
        result = out.result;
      };
      out.onerror = () => reject(out.error ?? new Error('idb request failed'));
    } else {
      out.then((v) => {
        result = v;
      }, reject);
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error('idb tx failed'));
    tx.onabort = () => reject(tx.error ?? new Error('idb tx aborted'));
  });
}

export async function saveRootHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await withStore('readwrite', (store) => store.put(handle, KEY));
}

export async function loadRootHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const value = await withStore<FileSystemDirectoryHandle | undefined>('readonly', (store) =>
      store.get(KEY),
    );
    return value ?? null;
  } catch {
    return null;
  }
}

export async function clearRootHandle(): Promise<void> {
  await withStore('readwrite', (store) => store.delete(KEY));
}

export async function queryRootPermission(): Promise<RootPermissionState> {
  const handle = await loadRootHandle();
  if (!handle) return 'none';
  try {
    const state = await handle.queryPermission({ mode: 'readwrite' });
    return state;
  } catch {
    return 'denied';
  }
}

export async function requestRootPermission(): Promise<'granted' | 'denied'> {
  const handle = await loadRootHandle();
  if (!handle) return 'denied';
  try {
    const state = await handle.requestPermission({ mode: 'readwrite' });
    return state === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}
