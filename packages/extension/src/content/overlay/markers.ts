import type { PinForPage } from '../../common/types.js';
import { sameView } from '../../common/view-url.js';

export interface MarkerCallbacks {
  onMarkerClick: (id: string, ev: MouseEvent) => void;
}

interface MarkerEntry {
  el: HTMLElement;
  /** Region rectangle or element bounds; shown only while the dot is hovered. */
  box: HTMLElement;
}

export class MarkerManager {
  private markers = new Map<string, MarkerEntry>();
  private rafId: number | null = null;
  private pending: PinForPage[] = [];
  private provisional: HTMLElement | null = null;
  private provisionalBox: HTMLElement | null = null;
  private provisionalRect: { x: number; y: number; width: number; height: number } | null = null;
  private provisionalKind: 'element' | 'region' = 'element';
  private currentView = location.href;
  private hoveredId: string | null = null;

  constructor(
    private layer: HTMLElement,
    private cb: MarkerCallbacks,
  ) {
    addEventListener('scroll', this.onScrollResize, true);
    addEventListener('resize', this.onScrollResize);
  }

  count(): number {
    return this.markers.size;
  }

  /**
   * Tell the manager which view (URL) is on screen. Markers for pins captured on
   * other views are kept in the map (so ordinals stay session-global) but hidden
   * until the user navigates back to their view.
   */
  setView(url: string): void {
    if (url === this.currentView) return;
    this.currentView = url;
    this.scheduleRender();
  }

  private setHovered(id: string | null): void {
    if (this.hoveredId === id) return;
    this.hoveredId = id;
    this.scheduleRender();
  }

  showProvisional(
    ord: number,
    rect: { x: number; y: number; width: number; height: number },
    kind: 'element' | 'region' = 'element',
  ): void {
    if (!this.provisional) {
      const el = document.createElement('div');
      el.className = 'dp-marker is-provisional';
      this.layer.appendChild(el);
      this.provisional = el;
    }
    if (!this.provisionalBox) {
      const box = document.createElement('div');
      box.className = 'dp-pinned-region';
      box.style.display = 'none';
      this.layer.appendChild(box);
      this.provisionalBox = box;
    }
    this.provisional.textContent = String(ord);
    this.provisionalRect = rect;
    this.provisionalKind = kind;
    this.renderProvisional();
  }

  hideProvisional(): void {
    if (this.provisional) {
      this.provisional.remove();
      this.provisional = null;
    }
    if (this.provisionalBox) {
      this.provisionalBox.remove();
      this.provisionalBox = null;
    }
    this.provisionalRect = null;
  }

  private renderProvisional(): void {
    if (!this.provisional || !this.provisionalRect) return;
    const r = this.provisionalRect;
    const isRegion = this.provisionalKind === 'region';
    const { x, y } = isRegion ? dotCenter(r) : dotTopRight(r);
    this.provisional.style.left = '0';
    this.provisional.style.top = '0';
    this.provisional.style.transform = `translate(${x}px, ${y}px)`;
    this.provisional.style.display = 'flex';
    // A region's box stays visible while the note is written — parity with the
    // element highlight shown for element pins.
    if (this.provisionalBox) {
      if (isRegion) {
        this.provisionalBox.style.display = 'block';
        this.provisionalBox.style.left = '0';
        this.provisionalBox.style.top = '0';
        this.provisionalBox.style.transform = `translate(${r.x}px, ${r.y}px)`;
        this.provisionalBox.style.width = `${r.width}px`;
        this.provisionalBox.style.height = `${r.height}px`;
      } else {
        this.provisionalBox.style.display = 'none';
      }
    }
  }

  update(pins: PinForPage[]): void {
    this.pending = pins;
    const incomingIds = new Set(pins.map((p) => p.id));
    for (const [id, entry] of this.markers) {
      if (!incomingIds.has(id)) {
        entry.el.remove();
        entry.box.remove();
        this.markers.delete(id);
      }
    }
    for (const p of pins) {
      if (!this.markers.has(p.id)) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'dp-marker';
        el.title = p.commentPreview || 'Pinned annotation';
        el.textContent = String(p.ordinal);
        el.dataset.id = p.id;
        el.addEventListener('click', (ev) => this.cb.onMarkerClick(p.id, ev));
        el.addEventListener('mouseenter', () => this.setHovered(p.id));
        el.addEventListener('mouseleave', () => this.setHovered(null));
        this.layer.appendChild(el);
        const box = document.createElement('div');
        box.className = 'dp-pinned-region';
        box.style.display = 'none';
        this.layer.appendChild(box);
        this.markers.set(p.id, { el, box });
      } else {
        const entry = this.markers.get(p.id);
        if (entry) {
          entry.el.textContent = String(p.ordinal);
          entry.el.title = p.commentPreview || 'Pinned annotation';
        }
      }
    }
    this.scheduleRender();
  }

  destroy(): void {
    removeEventListener('scroll', this.onScrollResize, true);
    removeEventListener('resize', this.onScrollResize);
    for (const entry of this.markers.values()) {
      entry.el.remove();
      entry.box.remove();
    }
    this.markers.clear();
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
  }

  private onScrollResize = (): void => {
    this.scheduleRender();
  };

  private scheduleRender(): void {
    if (this.rafId != null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.render();
    });
  }

  private render(): void {
    for (const p of this.pending) {
      const entry = this.markers.get(p.id);
      if (!entry) continue;
      const rect = sameView(p.url, this.currentView) ? this.resolveRect(p) : null;
      if (!rect) {
        entry.el.style.display = 'none';
        entry.box.style.display = 'none';
        continue;
      }
      entry.el.style.display = 'flex';
      entry.el.style.left = '0';
      entry.el.style.top = '0';
      const m = p.region ? dotCenter(rect) : dotTopRight(rect);
      entry.el.style.transform = `translate(${m.x}px, ${m.y}px)`;
      // A pin's box — the region rectangle or the element's bounds — shows only
      // while its numbered dot is hovered; otherwise the page stays clean.
      if (this.hoveredId === p.id) {
        entry.box.style.display = 'block';
        entry.box.style.left = '0';
        entry.box.style.top = '0';
        entry.box.style.transform = `translate(${rect.x}px, ${rect.y}px)`;
        entry.box.style.width = `${rect.width}px`;
        entry.box.style.height = `${rect.height}px`;
      } else {
        entry.box.style.display = 'none';
      }
    }
  }

  private resolveRect(
    p: PinForPage,
  ): { x: number; y: number; width: number; height: number } | null {
    if (p.region) {
      // Region rect is stored in page/document space; convert to viewport coords
      // so the box and its number badge track the content as the page scrolls.
      return {
        x: p.region.x - window.scrollX,
        y: p.region.y - window.scrollY,
        width: p.region.width,
        height: p.region.height,
      };
    }
    if (!p.selector) return null;
    try {
      const el = document.querySelector(p.selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null;
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    } catch {
      return null;
    }
  }
}

type Box = { x: number; y: number; width: number; height: number };

/** Element pins: the 22px dot straddles the top-right corner of the bounds. */
function dotTopRight(rect: Box): { x: number; y: number } {
  return { x: rect.x + rect.width - 14, y: rect.y - 8 };
}

/** Region pins: the 22px dot is centered in the drawn box. */
function dotCenter(rect: Box): { x: number; y: number } {
  return { x: rect.x + rect.width / 2 - 11, y: rect.y + rect.height / 2 - 11 };
}
