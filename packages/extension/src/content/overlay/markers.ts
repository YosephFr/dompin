import type { PinForPage } from '../../common/types.js';

export interface MarkerCallbacks {
  onMarkerClick: (id: string, ev: MouseEvent) => void;
}

interface MarkerEntry {
  el: HTMLElement;
  region: HTMLElement | null;
}

export class MarkerManager {
  private markers = new Map<string, MarkerEntry>();
  private rafId: number | null = null;
  private pending: PinForPage[] = [];

  constructor(
    private layer: HTMLElement,
    private cb: MarkerCallbacks,
  ) {
    addEventListener('scroll', this.onScrollResize, true);
    addEventListener('resize', this.onScrollResize);
  }

  update(pins: PinForPage[]): void {
    this.pending = pins;
    const incomingIds = new Set(pins.map((p) => p.id));
    for (const [id, entry] of this.markers) {
      if (!incomingIds.has(id)) {
        entry.el.remove();
        entry.region?.remove();
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
        this.layer.appendChild(el);
        let region: HTMLElement | null = null;
        if (p.region) {
          region = document.createElement('div');
          region.className = 'dp-pinned-region';
          this.layer.appendChild(region);
        }
        this.markers.set(p.id, { el, region });
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
      entry.region?.remove();
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
      const rect = this.resolveRect(p);
      if (!rect) {
        entry.el.style.display = 'none';
        if (entry.region) entry.region.style.display = 'none';
        continue;
      }
      entry.el.style.display = 'flex';
      entry.el.style.left = '0';
      entry.el.style.top = '0';
      const markerX = rect.x + rect.width - 14;
      const markerY = rect.y - 8;
      entry.el.style.transform = `translate(${markerX}px, ${markerY}px)`;
      if (entry.region && p.region) {
        entry.region.style.display = 'block';
        entry.region.style.left = '0';
        entry.region.style.top = '0';
        entry.region.style.transform = `translate(${rect.x}px, ${rect.y}px)`;
        entry.region.style.width = `${rect.width}px`;
        entry.region.style.height = `${rect.height}px`;
      }
    }
  }

  private resolveRect(
    p: PinForPage,
  ): { x: number; y: number; width: number; height: number } | null {
    if (p.region) return p.region;
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
