import type { PinForPage, Session, SessionListItem } from '../common/types.js';
import {
  buildSessionFolder,
  defaultSessionName,
  domainFolderFromUrl,
  sanitizeSegment,
} from '../common/path-sanitize.js';
import { newId } from '../common/id.js';
import { createLogger } from '../common/logger.js';
import { readSessionPins } from './vault-writer.js';

const log = createLogger('session');

const SESSIONS_KEY = 'dompin:sessions:v1';
const ACTIVE_KEY = 'dompin:active:v1';

interface SessionRecord extends Session {
  pageUrl: string | null;
  pageTitle: string | null;
}

interface SessionStore {
  sessions: Record<string, SessionRecord>;
  active: Record<string, string>;
}

let memoryStore: SessionStore | null = null;
let loadPromise: Promise<SessionStore> | null = null;

async function loadStore(): Promise<SessionStore> {
  if (memoryStore) return memoryStore;
  if (!loadPromise) {
    loadPromise = (async () => {
      const result = await chrome.storage.local.get([SESSIONS_KEY, ACTIVE_KEY]);
      const sessions = (result[SESSIONS_KEY] as Record<string, SessionRecord> | undefined) ?? {};
      const active = (result[ACTIVE_KEY] as Record<string, string> | undefined) ?? {};
      memoryStore = { sessions, active };
      return memoryStore;
    })();
  }
  return loadPromise;
}

async function persist(): Promise<void> {
  if (!memoryStore) return;
  await chrome.storage.local.set({
    [SESSIONS_KEY]: memoryStore.sessions,
    [ACTIVE_KEY]: memoryStore.active,
  });
}

const listeners: Array<(tabId: number | null) => void> = [];

export function onSessionChange(handler: (tabId: number | null) => void): () => void {
  listeners.push(handler);
  return () => {
    const idx = listeners.indexOf(handler);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

function notify(tabId: number | null): void {
  for (const h of listeners) {
    try {
      h(tabId);
    } catch (e) {
      log.warn('listener threw', e);
    }
  }
}

export async function getActiveSession(tabId: number): Promise<Session | null> {
  const store = await loadStore();
  const sid = store.active[String(tabId)];
  if (!sid) return null;
  const rec = store.sessions[sid];
  if (!rec) {
    delete store.active[String(tabId)];
    await persist();
    return null;
  }
  return toSession(rec);
}

export async function ensureSession(
  tabId: number,
  pageUrl: string,
  pageTitle?: string | null,
  name?: string,
): Promise<Session> {
  const existing = await getActiveSession(tabId);
  if (existing) {
    if (pageUrl || pageTitle) {
      await updatePageContext(existing.id, pageUrl, pageTitle);
    }
    return existing;
  }
  return createSession(tabId, pageUrl, pageTitle, name);
}

export async function newSession(
  tabId: number,
  pageUrl: string,
  pageTitle?: string | null,
  name?: string,
): Promise<Session> {
  return createSession(tabId, pageUrl, pageTitle, name);
}

async function createSession(
  tabId: number,
  pageUrl: string,
  pageTitle: string | null | undefined,
  name: string | undefined,
): Promise<Session> {
  const store = await loadStore();
  const prevId = store.active[String(tabId)];
  if (prevId && store.sessions[prevId]) {
    store.sessions[prevId].status = 'archived';
  }
  const sessionName = name?.trim() || defaultSessionName(pageUrl);
  const safeName = sanitizeSegment(sessionName, 'session');
  const domain = readDomain(pageUrl);
  const domainFolder = domainFolderFromUrl(pageUrl);
  const folder = buildSessionFolder(safeName);
  const now = Date.now();
  const id = newId();
  const record: SessionRecord = {
    id,
    domain,
    domainFolder,
    name: safeName,
    folder,
    startedAt: now,
    lastWriteAt: null,
    annotationCount: 0,
    status: 'active',
    pageUrl: pageUrl || null,
    pageTitle: pageTitle ?? null,
  };
  store.sessions[id] = record;
  store.active[String(tabId)] = id;
  await persist();
  notify(tabId);
  return toSession(record);
}

export async function renameSession(sessionId: string, newName: string): Promise<Session> {
  const store = await loadStore();
  const rec = store.sessions[sessionId];
  if (!rec) throw new Error(`Session ${sessionId} not found`);
  const trimmed = sanitizeSegment(newName, '').trim();
  if (!trimmed) throw new Error('Session name cannot be empty');
  rec.name = trimmed;
  await persist();
  notify(null);
  return toSession(rec);
}

export async function archiveSession(sessionId: string): Promise<void> {
  const store = await loadStore();
  const rec = store.sessions[sessionId];
  if (!rec) return;
  rec.status = 'archived';
  for (const [tabIdStr, sid] of Object.entries(store.active)) {
    if (sid === sessionId) delete store.active[tabIdStr];
  }
  await persist();
  notify(null);
}

export async function listSessions(domain?: string, limit?: number): Promise<SessionListItem[]> {
  const store = await loadStore();
  let items = Object.values(store.sessions);
  if (domain) {
    items = items.filter((r) => r.domain === domain || r.domainFolder === domain);
  }
  items.sort((a, b) => (b.lastWriteAt ?? b.startedAt) - (a.lastWriteAt ?? a.startedAt));
  if (typeof limit === 'number' && limit > 0) items = items.slice(0, limit);
  return items.map(toListItem);
}

export async function getSessionRecord(sessionId: string): Promise<Session | null> {
  const store = await loadStore();
  const rec = store.sessions[sessionId];
  return rec ? toSession(rec) : null;
}

export async function bumpSessionAnnotation(
  sessionId: string,
  delta: number,
  pageUrl?: string | null,
  pageTitle?: string | null,
): Promise<void> {
  const store = await loadStore();
  const rec = store.sessions[sessionId];
  if (!rec) return;
  rec.annotationCount = Math.max(0, rec.annotationCount + delta);
  if (delta > 0) rec.lastWriteAt = Date.now();
  if (pageUrl !== undefined && pageUrl !== null) rec.pageUrl = pageUrl;
  if (pageTitle !== undefined && pageTitle !== null) rec.pageTitle = pageTitle;
  await persist();
  notify(null);
}

async function updatePageContext(
  sessionId: string,
  pageUrl: string | null | undefined,
  pageTitle: string | null | undefined,
): Promise<void> {
  const store = await loadStore();
  const rec = store.sessions[sessionId];
  if (!rec) return;
  let touched = false;
  if (pageUrl && rec.pageUrl !== pageUrl) {
    rec.pageUrl = pageUrl;
    touched = true;
  }
  if (pageTitle && rec.pageTitle !== pageTitle) {
    rec.pageTitle = pageTitle;
    touched = true;
  }
  if (touched) await persist();
}

export async function getAnnotationsForTab(tabId: number): Promise<PinForPage[]> {
  const session = await getActiveSession(tabId);
  if (!session) return [];
  return readSessionPins(session);
}

export async function getSessionsCounters(): Promise<{ sessions: number; annotations: number }> {
  const store = await loadStore();
  const items = Object.values(store.sessions);
  const annotations = items.reduce((sum, s) => sum + s.annotationCount, 0);
  return { sessions: items.length, annotations };
}

export async function clearAllSessions(): Promise<void> {
  memoryStore = { sessions: {}, active: {} };
  await persist();
  notify(null);
}

export function setupSessionLifecycle(): void {
  chrome.tabs.onRemoved.addListener((tabId) => {
    void onTabRemoved(tabId);
  });
}

async function onTabRemoved(tabId: number): Promise<void> {
  const store = await loadStore();
  const sid = store.active[String(tabId)];
  if (!sid) return;
  delete store.active[String(tabId)];
  const rec = store.sessions[sid];
  if (rec) rec.status = 'archived';
  await persist();
  notify(tabId);
}

function readDomain(pageUrl: string): string {
  try {
    return new URL(pageUrl).hostname || 'unknown';
  } catch {
    return 'unknown';
  }
}

function toSession(rec: SessionRecord): Session {
  return {
    id: rec.id,
    domain: rec.domain,
    domainFolder: rec.domainFolder,
    name: rec.name,
    folder: rec.folder,
    startedAt: rec.startedAt,
    lastWriteAt: rec.lastWriteAt,
    annotationCount: rec.annotationCount,
    status: rec.status,
  };
}

function toListItem(rec: SessionRecord): SessionListItem {
  return { ...toSession(rec), pageUrl: rec.pageUrl, pageTitle: rec.pageTitle };
}
