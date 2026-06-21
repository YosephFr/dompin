import type { NetworkEntry } from '../common/types.js';

const BUFFER_WINDOW_MS = 60_000;
const MAX_ENTRIES_PER_TAB = 100;

const byTab = new Map<number, NetworkEntry[]>();

export function setupNetworkFailures(): void {
  if (!chrome.webRequest?.onErrorOccurred) return;
  chrome.webRequest.onErrorOccurred.addListener(
    (details) => {
      if (details.tabId < 0) return;
      const entry: NetworkEntry = {
        url: details.url,
        method: details.method || 'GET',
        status: 0,
        durationMs: 0,
        timestamp: details.timeStamp || Date.now(),
        error: details.error,
      };
      const list = byTab.get(details.tabId) ?? [];
      list.push(entry);
      if (list.length > MAX_ENTRIES_PER_TAB) list.splice(0, list.length - MAX_ENTRIES_PER_TAB);
      byTab.set(details.tabId, prune(list));
    },
    { urls: ['<all_urls>'] },
  );
  chrome.tabs.onRemoved.addListener((tabId) => {
    byTab.delete(tabId);
  });
}

export function snapshotNetworkFailures(tabId: number): NetworkEntry[] {
  const list = byTab.get(tabId);
  if (!list?.length) return [];
  const next = prune(list);
  byTab.set(tabId, next);
  return next.slice();
}

function prune(entries: NetworkEntry[]): NetworkEntry[] {
  const cutoff = Date.now() - BUFFER_WINDOW_MS;
  return entries.filter((entry) => entry.timestamp >= cutoff);
}
