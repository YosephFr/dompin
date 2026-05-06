export type PageAccessCode =
  | 'no-tab'
  | 'chrome-internal'
  | 'extension-page'
  | 'about-page'
  | 'view-source'
  | 'webstore'
  | 'data-url'
  | 'file-url'
  | 'unsupported-scheme';

export type PageAccessResult = { ok: true } | { ok: false; code: PageAccessCode };

export function checkPageAccess(url: string | null | undefined): PageAccessResult {
  if (!url) return { ok: false, code: 'no-tab' };
  const lower = url.toLowerCase();

  if (lower.startsWith('chrome://')) return { ok: false, code: 'chrome-internal' };
  if (lower.startsWith('chrome-extension://')) return { ok: false, code: 'extension-page' };
  if (lower.startsWith('edge://') || lower.startsWith('about:')) {
    return { ok: false, code: 'about-page' };
  }
  if (lower.startsWith('view-source:')) return { ok: false, code: 'view-source' };
  if (lower.startsWith('data:')) return { ok: false, code: 'data-url' };
  if (lower.startsWith('file://')) return { ok: false, code: 'file-url' };

  try {
    const u = new URL(url);
    if (u.hostname === 'chromewebstore.google.com') {
      return { ok: false, code: 'webstore' };
    }
    if (u.hostname === 'chrome.google.com' && u.pathname.startsWith('/webstore')) {
      return { ok: false, code: 'webstore' };
    }
  } catch {
    return { ok: false, code: 'unsupported-scheme' };
  }

  if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
    return { ok: false, code: 'unsupported-scheme' };
  }

  return { ok: true };
}
