import type { PinForPage, RegionCorner } from '../../common/types.js';
import { sameView } from '../../common/view-url.js';

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
  private provisional: HTMLElement | null = null;
  private provisionalRect: { x: number; y: number; width: number; height: number } | null = null;
  private provisionalCorner: RegionCorner = 'tr';
  private currentView = location.href;
  private pickerActive = false;
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

  /**
   * Region boxes are drawn only while the picker is on. With the picker off the
   * page stays clean — just the numbered dots — and a pin's box appears only
   * while the pointer hovers its dot.
   */
  setPickerActive(active: boolean): void {
    if (this.pickerActive === active) return;
    this.pickerActive = active;
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
    corner: RegionCorner = 'tr',
  ): void {
    if (!this.provisional) {
      const el = document.createElement('div');
      el.className = 'dp-marker is-provisional';
      this.layer.appendChild(el);
      this.provisional = el;
    }
    this.provisional.textContent = String(ord);
    this.provisionalRect = rect;
    this.provisionalCorner = corner;
    this.renderProvisional();
  }

  hideProvisional(): void {
    if (this.provisional) {
      this.provisional.remove();
      this.provisional = null;
    }
    this.provisionalRect = null;
  }

  private renderProvisional(): void {
    if (!this.provisional || !this.provisionalRect) return;
    const { x, y } = markerPos(this.provisionalRect, this.provisionalCorner);
    this.provisional.style.left = '0';
    this.provisional.style.top = '0';
    this.provisional.style.transform = `translate(${x}px, ${y}px)`;
    this.provisional.style.display = 'flex';
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
        el.addEventListener('mouseenter', () => this.setHovered(p.id));
        el.addEventListener('mouseleave', () => this.setHovered(null));
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
      const rect = sameView(p.url, this.currentView) ? this.resolveRect(p) : null;
      if (!rect) {
        entry.el.style.display = 'none';
        if (entry.region) entry.region.style.display = 'none';
        continue;
      }
      entry.el.style.display = 'flex';
      entry.el.style.left = '0';
      entry.el.style.top = '0';
      const m = markerPos(rect, p.markerCorner ?? 'tr');
      entry.el.style.transform = `translate(${m.x}px, ${m.y}px)`;
      if (entry.region && p.region) {
        const showBox = this.pickerActive || this.hoveredId === p.id;
        entry.region.style.display = showBox ? 'block' : 'none';
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

/**
 * Where the 22px numbered marker sits relative to a rect, anchored to the given
 * corner so it straddles the edge (slightly outside) like the old top-right one.
 */
function markerPos(
  rect: { x: number; y: number; width: number; height: number },
  corner: RegionCorner,
): { x: number; y: number } {
  const left = corner === 'tl' || corner === 'bl';
  const top = corner === 'tl' || corner === 'tr';
  return {
    x: left ? rect.x - 8 : rect.x + rect.width - 14,
    y: top ? rect.y - 8 : rect.y + rect.height - 14,
  };
}
