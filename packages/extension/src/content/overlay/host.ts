import { OVERLAY_CSS } from './styles.js';

const HOST_ID = 'dompin-overlay-host';

export interface OverlayHandles {
  shadowRoot: ShadowRoot;
  layer: HTMLDivElement;
  cursorCover: HTMLDivElement;
}

let cached: OverlayHandles | null = null;

export function ensureOverlay(): OverlayHandles {
  if (cached) {
    if (document.contains(cached.shadowRoot.host)) return cached;
    cached = null;
  }
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText =
    'all:initial; position:fixed; inset:0; pointer-events:none; z-index:2147483647;';

  const attach = () => {
    if (document.body && !document.body.contains(host)) {
      document.body.appendChild(host);
    }
  };
  attach();
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', attach, { once: true });
  }

  const shadow = host.attachShadow({ mode: 'open' });
  const styleEl = document.createElement('style');
  styleEl.textContent = OVERLAY_CSS;
  shadow.appendChild(styleEl);

  const layer = document.createElement('div');
  layer.className = 'dp-layer';
  shadow.appendChild(layer);

  const cursorCover = document.createElement('div');
  cursorCover.className = 'dp-cursor-cover';
  cursorCover.dataset.active = 'false';
  layer.appendChild(cursorCover);

  cached = { shadowRoot: shadow, layer, cursorCover };
  return cached;
}

export function teardownOverlay(): void {
  if (!cached) return;
  cached.shadowRoot.host.remove();
  cached = null;
}

export async function withOverlayHidden<T>(fn: () => Promise<T>): Promise<T> {
  if (!cached) return fn();
  const host = cached.shadowRoot.host as HTMLElement;
  const prev = host.style.visibility;
  host.style.visibility = 'hidden';
  try {
    await waitTwoFrames();
    return await fn();
  } finally {
    host.style.visibility = prev;
  }
}

function waitTwoFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
