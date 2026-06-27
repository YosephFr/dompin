export type ThemePreference = 'auto' | 'light' | 'dark';
export type LocalePreference = 'auto' | 'en' | 'es';
export type TranscriptionProvider = 'elevenlabs' | 'openai';
export type DebugCaptureMode = 'soft' | 'aggressive';

export interface GitSettings {
  enabled: boolean;
  helperName: string;
  vaultPath: string;
}

export type RecordingSettings = Record<string, never>;

export interface DebugCaptureSettings {
  mode: DebugCaptureMode;
  captureConsole: boolean;
  captureScreenshots: boolean;
  dedupeRequests: boolean;
}

export interface Settings {
  schemaVersion: 5;
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
  recording: RecordingSettings;
  debug: DebugCaptureSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 5,
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
    enabled: true,
    helperName: 'com.yosephfr.dompin_git',
    vaultPath: '',
  },
  recording: {},
  debug: {
    mode: 'soft',
    captureConsole: false,
    captureScreenshots: false,
    dedupeRequests: true,
  },
};

export function mergeSettings(partial: Partial<Settings> | undefined): Settings {
  const p = partial ?? {};
  const incomingVersion = Number(p.schemaVersion ?? 0);
  const flags = { ...DEFAULT_SETTINGS.flags, ...(p.flags ?? {}) };
  const preferences = { ...DEFAULT_SETTINGS.preferences, ...(p.preferences ?? {}) };
  const transcription = { ...DEFAULT_SETTINGS.transcription, ...(p.transcription ?? {}) };
  const git = { ...DEFAULT_SETTINGS.git, ...(p.git ?? {}) };
  if (incomingVersion < 3 && p.git?.enabled === false) git.enabled = true;
  const recording = { ...DEFAULT_SETTINGS.recording };
  const rawDebug = { ...DEFAULT_SETTINGS.debug, ...(p.debug ?? {}) };
  const debug: DebugCaptureSettings = {
    mode: rawDebug.mode === 'aggressive' ? 'aggressive' : 'soft',
    captureConsole: Boolean(rawDebug.captureConsole),
    captureScreenshots:
      incomingVersion >= 5 && typeof rawDebug.captureScreenshots === 'boolean'
        ? rawDebug.captureScreenshots
        : DEFAULT_SETTINGS.debug.captureScreenshots,
    dedupeRequests:
      typeof rawDebug.dedupeRequests === 'boolean'
        ? rawDebug.dedupeRequests
        : DEFAULT_SETTINGS.debug.dedupeRequests,
  };
  const allowlist =
    Array.isArray(p.allowlist) && p.allowlist.length > 0 ? p.allowlist : DEFAULT_SETTINGS.allowlist;
  return { schemaVersion: 5, allowlist, flags, preferences, transcription, git, recording, debug };
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
