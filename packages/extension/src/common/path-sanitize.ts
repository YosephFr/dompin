const ILLEGAL = /[\\/:*?"<>|\x00-\x1f]/g;
const TRIM = /^[\s.]+|[\s.]+$/g;

export function sanitizeSegment(input: string, fallback: string): string {
  const cleaned = input.replace(ILLEGAL, '_').replace(/\s+/g, ' ').replace(TRIM, '').slice(0, 80);
  return cleaned || fallback;
}

export function domainFolderFromUrl(rawUrl: string): string {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return 'unknown';
  }
  const host = u.hostname.toLowerCase() || 'unknown';
  const port = u.port ? `_${u.port}` : '';
  return sanitizeSegment(`${host}${port}`, 'unknown');
}

export function timestampSlug(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}`
  );
}

export function defaultSessionName(rawUrl: string, date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const hhmm = `${pad(date.getHours())}${pad(date.getMinutes())}`;
  let label = 'session';
  try {
    const u = new URL(rawUrl);
    label = u.hostname.split('.').slice(0, 1)[0] || u.hostname || 'session';
  } catch {
    /* keep default */
  }
  return sanitizeSegment(`${label}_${hhmm}`, `session_${hhmm}`);
}

export function buildSessionFolder(name: string, date: Date = new Date()): string {
  const slug = sanitizeSegment(name, 'session');
  return `${timestampSlug(date)}__${slug}`;
}

export function annotationFileBase(ordinal: number): string {
  return String(ordinal).padStart(2, '0');
}
