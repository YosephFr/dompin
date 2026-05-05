import { DEFAULT_WS_HOST, DEFAULT_WS_PORT, DEFAULT_WS_PATH } from '@dompin/shared';

export interface Settings {
  schemaVersion: 1;
  ws: { host: string; port: number; path: string };
  allowlist: string[];
  flags: {
    captureNetworkFailures: boolean;
    enableWebSpeech: boolean;
    enableReactFiber: boolean;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  ws: { host: DEFAULT_WS_HOST, port: DEFAULT_WS_PORT, path: DEFAULT_WS_PATH },
  allowlist: ['*'],
  flags: {
    captureNetworkFailures: false,
    enableWebSpeech: true,
    enableReactFiber: true,
  },
};

export function mergeSettings(partial: Partial<Settings> | undefined): Settings {
  const p = partial ?? {};
  const ws = { ...DEFAULT_SETTINGS.ws, ...(p.ws ?? {}) };
  const flags = { ...DEFAULT_SETTINGS.flags, ...(p.flags ?? {}) };
  const allowlist =
    Array.isArray(p.allowlist) && p.allowlist.length > 0 ? p.allowlist : DEFAULT_SETTINGS.allowlist;
  return { schemaVersion: 1, ws, flags, allowlist };
}

export function isOriginAllowed(url: string, allowlist: string[]): boolean {
  if (!allowlist.length) return false;
  if (allowlist.includes('*')) return true;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return allowlist.some((raw) => matchHost(host, raw.trim().toLowerCase()));
}

function matchHost(host: string, pattern: string): boolean {
  if (!pattern) return false;
  if (pattern === '*') return true;
  if (pattern === host) return true;
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2);
    return host === suffix || host.endsWith('.' + suffix);
  }
  return false;
}

export function validateHost(host: string): string | null {
  const trimmed = host.trim();
  if (!trimmed) return 'Host is required';
  if (!/^[a-zA-Z0-9.\-_]+$/.test(trimmed)) return 'Host contains invalid characters';
  return null;
}

export function validatePort(port: number): string | null {
  if (!Number.isFinite(port) || !Number.isInteger(port)) return 'Port must be an integer';
  if (port < 1 || port > 65535) return 'Port must be between 1 and 65535';
  return null;
}

export function validatePath(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed) return 'Path is required';
  if (!trimmed.startsWith('/')) return 'Path must start with /';
  return null;
}
