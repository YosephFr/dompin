import type { Settings } from './settings.js';
import { DEFAULT_SETTINGS, mergeSettings } from './settings.js';

export const STORAGE_KEYS = {
  settings: 'dompin:settings:v2',
} as const;

export async function loadSettings(): Promise<Settings> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.settings);
    return mergeSettings(result[STORAGE_KEYS.settings] as Partial<Settings> | undefined);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
}

export function onSettingsChange(handler: (next: Settings) => void): () => void {
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
    if (area !== 'local') return;
    const c = changes[STORAGE_KEYS.settings];
    if (!c) return;
    handler(mergeSettings(c.newValue as Partial<Settings> | undefined));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
