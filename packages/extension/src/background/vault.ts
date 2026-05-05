import type { VaultStatus } from '../common/types.js';
import { clearRootHandle, loadRootHandle, queryRootPermission } from '../common/vault-handle.js';
import { createLogger } from '../common/logger.js';

const log = createLogger('vault');

const SESSIONS_KEY = 'dompin:sessions:v1';
const HEALTH_FILE = '.dompin-health';

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
let cachedHealth: { ts: number; ok: boolean; reason: string | null } = {
  ts: 0,
  ok: true,
  reason: null,
};

const HEALTH_TTL_MS = 30_000;

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
  cachedHealth = { ts: 0, ok: true, reason: null };
}

export async function getStatus(force = false): Promise<VaultStatus> {
  const handle = await resolveHandle();
  const counters = await readCounters();
  if (!handle) {
    return {
      configured: false,
      rootName: null,
      hasPermission: false,
      needsReconnect: false,
      unreachable: false,
      unreachableReason: null,
      totalSessions: counters.sessions,
      totalAnnotations: counters.annotations,
    };
  }
  const perm = await queryRootPermission();
  const hasPermission = perm === 'granted';
  const needsReconnect = !hasPermission;
  let unreachable = false;
  let unreachableReason: string | null = null;
  if (hasPermission) {
    const fresh = force || Date.now() - cachedHealth.ts > HEALTH_TTL_MS;
    if (fresh) {
      const h = await runHealthCheck(handle);
      cachedHealth = { ts: Date.now(), ok: h.ok, reason: h.ok ? null : h.reason };
    }
    unreachable = !cachedHealth.ok;
    unreachableReason = cachedHealth.reason;
  }
  return {
    configured: true,
    rootName: handle.name,
    hasPermission,
    needsReconnect,
    unreachable,
    unreachableReason,
    totalSessions: counters.sessions,
    totalAnnotations: counters.annotations,
  };
}

export async function ensureWritable(): Promise<FileSystemDirectoryHandle> {
  const handle = await resolveHandle();
  if (!handle) {
    throw new Error('Vault is not configured. Open the DOMPin side panel and pick a folder.');
  }
  const perm = await queryRootPermission();
  if (perm !== 'granted') {
    throw new Error('Vault permission lost. Click the DOMPin icon and reconnect to grant access.');
  }
  const h = await runHealthCheck(handle);
  cachedHealth = { ts: Date.now(), ok: h.ok, reason: h.ok ? null : h.reason };
  if (!h.ok) {
    throw new Error(`Vault folder unreachable: ${h.reason}`);
  }
  return handle;
}

export async function clearVault(): Promise<void> {
  await clearRootHandle();
  invalidateHandleCache();
  log.info('vault cleared');
}

async function runHealthCheck(
  handle: FileSystemDirectoryHandle,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const file = await handle.getFileHandle(HEALTH_FILE, { create: true });
    const writable = await file.createWritable();
    try {
      await writable.write(new Date().toISOString());
    } finally {
      await writable.close();
    }
    return { ok: true };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    log.warn('health check failed', reason);
    return { ok: false, reason };
  }
}
