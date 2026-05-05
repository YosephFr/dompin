export interface OriginTab {
  tabId: number | null;
  url: string | null;
  domain: string | null;
}

export const EMPTY_ORIGIN: OriginTab = { tabId: null, url: null, domain: null };

export async function readOriginTab(): Promise<OriginTab> {
  try {
    const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
    if (typeof win.id !== 'number') return EMPTY_ORIGIN;
    const tabs = await chrome.tabs.query({ active: true, windowId: win.id });
    const tab = tabs[0];
    if (!tab || typeof tab.id !== 'number') return EMPTY_ORIGIN;
    const url = tab.url ?? null;
    return { tabId: tab.id, url, domain: deriveDomain(url) };
  } catch {
    return EMPTY_ORIGIN;
  }
}

function deriveDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

import type { Strings } from '../common/i18n/strings.en.js';

export function relativeTime(ts: number, t?: Strings): string {
  const diff = Date.now() - ts;
  const r = t?.recent.relative;
  if (diff < 30_000) return r?.now ?? 'just now';
  const m = Math.floor(diff / 60_000);
  if (m < 60) return r ? r.mAgo(m) : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return r ? r.hAgo(h) : `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return r ? r.dAgo(d) : `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

export type Busy =
  | null
  | 'reconnect'
  | 'pick'
  | 'toggle'
  | 'new'
  | 'rename'
  | 'archive'
  | { kind: 'edit'; id: string }
  | { kind: 'delete'; id: string };

export function busyEditId(busy: Busy): string | null {
  if (typeof busy === 'object' && busy !== null && busy.kind === 'edit') return busy.id;
  return null;
}

export function busyDeleteId(busy: Busy): string | null {
  if (typeof busy === 'object' && busy !== null && busy.kind === 'delete') return busy.id;
  return null;
}
