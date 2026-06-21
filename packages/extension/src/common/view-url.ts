/**
 * View identity for annotations.
 *
 * Annotations belong to a session (the project folder), but within a session a
 * user moves between *views* — separate pages on a multi-page site, or routes in
 * a single-page app (hash routes, path routes, or `?page=` query routes). Markers
 * for one view must not leak onto another. We decide "same view" by comparing a
 * normalized URL: same origin, same path (trailing slash ignored), same route
 * hash, and same *meaningful* query — tracking/analytics params are dropped so a
 * stray `?utm_source=…` added on the way back doesn't hide a view's pins.
 */

const TRACKING_PARAMS = new Set([
  'gclid',
  'fbclid',
  'msclkid',
  'dclid',
  'gclsrc',
  'mc_cid',
  'mc_eid',
  'igshid',
  'ref',
  'ref_src',
  'ref_url',
  'referrer',
  'source',
  '_ga',
  '_gl',
  'yclid',
  'twclid',
  'wbraid',
  'gbraid',
  'spm',
]);

function isTrackingParam(key: string): boolean {
  const k = key.toLowerCase();
  return k.startsWith('utm_') || TRACKING_PARAMS.has(k);
}

/**
 * Reduce a URL to a stable view key, or `null` if it cannot be parsed.
 * Two URLs that produce the same key are treated as the same view.
 */
export function normalizeViewUrl(href: string): string | null {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  const origin = `${u.protocol}//${u.host.toLowerCase()}`;

  let path = u.pathname || '/';
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);

  const params = new URLSearchParams(u.search);
  for (const key of [...params.keys()]) {
    if (isTrackingParam(key)) params.delete(key);
  }
  params.sort();
  const search = params.toString();

  let hash = u.hash;
  if (hash === '#') hash = '';

  return `${origin}${path}${search ? `?${search}` : ''}${hash}`;
}

export function normalizeBaseUrl(href: string): string | null {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  return `${u.protocol}//${u.host.toLowerCase()}`;
}

/** True when both URLs resolve to the same view (see module docs). */
export function sameView(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const na = normalizeViewUrl(a);
  const nb = normalizeViewUrl(b);
  if (na === null || nb === null) return a === b;
  return na === nb;
}

export function sameBaseUrl(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const na = normalizeBaseUrl(a);
  const nb = normalizeBaseUrl(b);
  if (na === null || nb === null) return a === b;
  return na === nb;
}
