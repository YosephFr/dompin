import type { VaultStatus } from '../common/types.js';
import { clearRootHandle, loadRootHandle, queryRootPermission } from '../common/vault-handle.js';
import { createLogger } from '../common/logger.js';

const log = createLogger('vault');

const SESSIONS_KEY = 'dompin:sessions:v1';

async function readCounters(): Promise<{ sessions: number; annotations: number }> {
  try {
    const result = await chrome.storage.local.get(SESSIONS_KEY);
    const map =
      (result[SESSIONS_KEY] as Record<string, { annotationCount?: number }> | undefined) ?? {};
    const list = Object.values(map);
    const annotations = list.reduce((sum, r) => sum + (r.annotationCount ?? 0), 0);
    return { sessions: list.length, annotations };
  } catch {
    return { sessions: 0, annotations: 0 };
  }
}

let cachedHandle: FileSystemDirectoryHandle | null = null;
let resolvedFromIdb = false;

async function resolveHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (cachedHandle) return cachedHandle;
  if (resolvedFromIdb) return null;
  cachedHandle = await loadRootHandle();
  resolvedFromIdb = true;
  return cachedHandle;
}

export function invalidateHandleCache(): void {
  cachedHandle = null;
  resolvedFromIdb = false;
}

export async function getStatus(): Promise<VaultStatus> {
  const handle = await resolveHandle();
  const counters = await readCounters();
  if (!handle) {
    return {
      configured: false,
      rootName: null,
      hasPermission: false,
      needsReconnect: false,
      totalSessions: counters.sessions,
      totalAnnotations: counters.annotations,
    };
  }
  const perm = await queryRootPermission();
  const hasPermission = perm === 'granted';
  return {
    configured: true,
    rootName: handle.name,
    hasPermission,
    needsReconnect: !hasPermission,
    totalSessions: counters.sessions,
    totalAnnotations: counters.annotations,
  };
}

export async function ensureWritable(): Promise<FileSystemDirectoryHandle> {
  const handle = await resolveHandle();
  if (!handle) {
    throw new Error('Vault is not configured. Open the DOMPin popup and pick a folder.');
  }
  const perm = await queryRootPermission();
  if (perm !== 'granted') {
    throw new Error('Vault permission lost. Click the DOMPin icon and reconnect to grant access.');
  }
  return handle;
}

export async function clearVault(): Promise<void> {
  await clearRootHandle();
  invalidateHandleCache();
  log.info('vault cleared');
}
