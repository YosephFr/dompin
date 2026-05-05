import type { PageContext } from '@dompin/shared';

export function capturePage(): PageContext {
  const colorScheme: 'light' | 'dark' = matchesDark() ? 'dark' : 'light';
  return {
    url: location.href,
    title: document.title,
    userAgent: navigator.userAgent,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
    },
    scroll: { x: window.scrollX, y: window.scrollY },
    colorScheme,
    documentReadyState: document.readyState,
  };
}

function matchesDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}
