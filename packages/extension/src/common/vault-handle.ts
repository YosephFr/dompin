declare global {
  interface FileSystemHandlePermissionDescriptor {
    mode?: 'read' | 'readwrite';
  }

  interface FileSystemHandle {
    queryPermission(
      descriptor?: FileSystemHandlePermissionDescriptor,
    ): Promise<'granted' | 'denied' | 'prompt'>;
    requestPermission(
      descriptor?: FileSystemHandlePermissionDescriptor,
    ): Promise<'granted' | 'denied' | 'prompt'>;
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
const DB_VERSION = 1;
const STORE = 'kv';
const HANDLE_KEY = 'vaultRoot';

export type VaultPermissionState = 'granted' | 'prompt' | 'denied' | 'none';

async function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('idb open failed'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const req = fn(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('idb request failed'));
    });
  } finally {
    db.close();
  }
}

export async function saveRootHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await withStore<IDBValidKey>('readwrite', (store) => store.put(handle, HANDLE_KEY));
}

export async function loadRootHandle(): Promise<FileSystemDirectoryHandle | null> {
  const value = await withStore<FileSystemDirectoryHandle | undefined>('readonly', (store) =>
    store.get(HANDLE_KEY),
  );
  return value ?? null;
}

export async function clearRootHandle(): Promise<void> {
  await withStore<undefined>('readwrite', (store) => store.delete(HANDLE_KEY));
}

export async function queryRootPermission(): Promise<VaultPermissionState> {
  const handle = await loadRootHandle();
  if (!handle) return 'none';
  try {
    return await handle.queryPermission({ mode: 'readwrite' });
  } catch {
    return 'denied';
  }
}

export async function requestRootPermission(): Promise<'granted' | 'denied'> {
  const handle = await loadRootHandle();
  if (!handle) return 'denied';
  try {
    const result = await handle.requestPermission({ mode: 'readwrite' });
    return result === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}
