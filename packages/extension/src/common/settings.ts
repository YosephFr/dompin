export type ThemePreference = 'auto' | 'light' | 'dark';
export type LocalePreference = 'auto' | 'en' | 'es';
export type TranscriptionProvider = 'elevenlabs' | 'openai';

export interface GitSettings {
  enabled: boolean;
  helperName: string;
  vaultPath: string;
}

export interface Settings {
  schemaVersion: 2;
  allowlist: string[];
  flags: {
    captureNetworkFailures: boolean;
    enableWebSpeech: boolean;
    enableReactFiber: boolean;
  };
  preferences: {
    theme: ThemePreference;
    locale: LocalePreference;
  };
  transcription: {
    provider: TranscriptionProvider;
    elevenLabsApiKey: string;
    elevenLabsModel: string;
    openAiApiKey: string;
    openAiModel: string;
    languageCode: string;
  };
  git: GitSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 2,
  allowlist: ['*'],
  flags: {
    captureNetworkFailures: false,
    enableWebSpeech: true,
    enableReactFiber: true,
  },
  preferences: {
    theme: 'auto',
    locale: 'auto',
  },
  transcription: {
    provider: 'elevenlabs',
    elevenLabsApiKey: '',
    elevenLabsModel: 'scribe_v2',
    openAiApiKey: '',
    openAiModel: 'gpt-4o-transcribe',
    languageCode: '',
  },
  git: {
    enabled: false,
    helperName: 'com.yosephfr.dompin_git',
    vaultPath: '',
  },
};

export function mergeSettings(partial: Partial<Settings> | undefined): Settings {
  const p = partial ?? {};
  const flags = { ...DEFAULT_SETTINGS.flags, ...(p.flags ?? {}) };
  const preferences = { ...DEFAULT_SETTINGS.preferences, ...(p.preferences ?? {}) };
  const transcription = { ...DEFAULT_SETTINGS.transcription, ...(p.transcription ?? {}) };
  const git = { ...DEFAULT_SETTINGS.git, ...(p.git ?? {}) };
  const allowlist =
    Array.isArray(p.allowlist) && p.allowlist.length > 0 ? p.allowlist : DEFAULT_SETTINGS.allowlist;
  return { schemaVersion: 2, allowlist, flags, preferences, transcription, git };
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
