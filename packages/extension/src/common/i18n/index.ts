import { createContext, createElement, useContext, type ReactNode } from 'react';
import type { LocalePreference } from '../settings.js';
import { en, type Strings } from './strings.en.js';
import { es } from './strings.es.js';

export type Locale = 'en' | 'es';

const dictionaries: Record<Locale, Strings> = { en, es };

export function resolveLocale(pref: LocalePreference): Locale {
  if (pref === 'en' || pref === 'es') return pref;
  return detectBrowserLocale();
}

export function detectBrowserLocale(): Locale {
  const langs = (navigator.languages?.length ? navigator.languages : [navigator.language]) ?? [];
  for (const raw of langs) {
    const lc = raw.toLowerCase();
    if (lc.startsWith('es')) return 'es';
    if (lc.startsWith('en')) return 'en';
  }
  return 'en';
}

const I18nContext = createContext<Strings>(en);

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}): JSX.Element {
  return createElement(I18nContext.Provider, { value: dictionaries[locale] }, children);
}

export function useT(): Strings {
  return useContext(I18nContext);
}

const PAGE_ERROR_KEYS: Record<string, keyof Strings['errors']> = {
  'no-tab': 'noTab',
  'chrome-internal': 'chromeInternal',
  'extension-page': 'extensionPage',
  'about-page': 'aboutPage',
  'view-source': 'viewSource',
  webstore: 'webstore',
  'data-url': 'dataUrl',
  'file-url': 'fileUrl',
  'unsupported-scheme': 'unsupportedScheme',
  'needs-refresh': 'needsRefresh',
  'no-session': 'noSession',
};

export function localizeError(t: Strings, raw: string | null | undefined): string {
  if (!raw) return '';
  if (raw.startsWith('PAGE:')) {
    const code = raw.slice('PAGE:'.length);
    const key = PAGE_ERROR_KEYS[code];
    return key ? t.errors[key] : t.errors.unknown;
  }
  return raw;
}
