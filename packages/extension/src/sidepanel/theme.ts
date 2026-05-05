import type { ThemePreference } from '../common/settings.js';

export function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement;
  if (theme === 'auto') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}
