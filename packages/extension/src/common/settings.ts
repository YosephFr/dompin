export interface Settings {
  schemaVersion: 2;
  allowlist: string[];
  flags: {
    captureNetworkFailures: boolean;
    enableWebSpeech: boolean;
    enableReactFiber: boolean;
    promptSessionName: boolean;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 2,
  allowlist: ['*'],
  flags: {
    captureNetworkFailures: false,
    enableWebSpeech: true,
    enableReactFiber: true,
    promptSessionName: false,
  },
};

export function mergeSettings(partial: Partial<Settings> | undefined): Settings {
  const p = partial ?? {};
  const flags = { ...DEFAULT_SETTINGS.flags, ...(p.flags ?? {}) };
  const allowlist =
    Array.isArray(p.allowlist) && p.allowlist.length > 0 ? p.allowlist : DEFAULT_SETTINGS.allowlist;
  return { schemaVersion: 2, allowlist, flags };
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
