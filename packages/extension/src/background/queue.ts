import type { AnnotationPayload, AnnotationSummary } from '@dompin/shared';
import { loadQueue, saveQueue } from '../common/storage.js';
import { createLogger } from '../common/logger.js';

const log = createLogger('queue');

let cache: AnnotationPayload[] = [];
let initPromise: Promise<void> | null = null;

type Listener = (queue: AnnotationPayload[]) => void;
const listeners = new Set<Listener>();

async function ensureInit(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    cache = await loadQueue();
    log.info('queue restored:', cache.length);
  })();
  return initPromise;
}

function notify(): void {
  const snapshot = cache.slice();
  for (const fn of listeners) {
    try {
      fn(snapshot);
    } catch (e) {
      log.error('listener error', e);
    }
  }
}

export function onQueueMutate(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function getQueue(): Promise<AnnotationPayload[]> {
  await ensureInit();
  return cache.slice();
}

export async function pushPin(payload: AnnotationPayload): Promise<void> {
  await ensureInit();
  cache = [...cache, payload];
  await saveQueue(cache);
  notify();
}

export async function removePin(id: string): Promise<void> {
  await ensureInit();
  const next = cache.filter((p) => p.id !== id);
  if (next.length === cache.length) return;
  cache = next;
  await saveQueue(cache);
  notify();
}

export async function clearQueue(): Promise<void> {
  await ensureInit();
  if (!cache.length) return;
  cache = [];
  await saveQueue(cache);
  notify();
}

export async function summarize(): Promise<AnnotationSummary[]> {
  await ensureInit();
  return cache.map(toSummary);
}

export function toSummary(p: AnnotationPayload): AnnotationSummary {
  return {
    id: p.id,
    createdAt: p.createdAt,
    pageUrl: p.page.url,
    pageTitle: p.page.title,
    selector: p.element?.selector ?? null,
    commentPreview: p.comment.length > 120 ? p.comment.slice(0, 117) + '...' : p.comment,
  };
}

export async function getPinsForUrl(url: string): Promise<AnnotationPayload[]> {
  await ensureInit();
  return cache.filter((p) => p.page.url === url);
}
