import type { AnnotationPayload } from '@dompin/shared';
import type { Settings } from './settings.js';
import { DEFAULT_SETTINGS, mergeSettings } from './settings.js';

export const STORAGE_KEYS = {
  settings: 'dompin:settings:v1',
  queue: 'dompin:queue:v1',
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

export async function loadQueue(): Promise<AnnotationPayload[]> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.queue);
    const raw = result[STORAGE_KEYS.queue];
    return Array.isArray(raw) ? (raw as AnnotationPayload[]) : [];
  } catch {
    return [];
  }
}

export async function saveQueue(queue: AnnotationPayload[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.queue]: queue });
}

export type StorageChangeHandler = (changes: chrome.storage.StorageChange) => void;

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

export function onQueueChange(handler: (next: AnnotationPayload[]) => void): () => void {
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
    if (area !== 'local') return;
    const c = changes[STORAGE_KEYS.queue];
    if (!c) return;
    handler(Array.isArray(c.newValue) ? (c.newValue as AnnotationPayload[]) : []);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
