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
