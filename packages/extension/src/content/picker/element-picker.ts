import type { RectInfo } from '../../common/types.js';
import type { Highlight } from '../overlay/highlight.js';
import type { RegionRect } from '../overlay/region-rect.js';
import { applyCrosshairCursor, removeCrosshairCursor } from './cursor-style.js';

const HOVER_DEBOUNCE_MS = 50;
const REGION_MIN_SIZE = 6;
const REGION_DRAG_THRESHOLD = 5;

export type PickerMode = 'sticky' | 'oneShot';

export interface PickerCallbacks {
  onPickElement: (el: Element) => void;
  onPickRegion: (rect: RectInfo) => void;
  onCancel: () => void;
  isOurDom: (el: Element) => boolean;
}

export class Picker {
  private active = false;
  private paused = false;
  private mode: PickerMode = 'sticky';
  private hoverTimer: number | null = null;
  private regionStart: { x: number; y: number } | null = null;
  private pointerDown: { x: number; y: number } | null = null;
  private didRegionDrag = false;

  constructor(
    private highlight: Highlight,
    private regionRect: RegionRect,
    private cb: PickerCallbacks,
  ) {}

  start(mode: PickerMode = 'sticky'): void {
    if (this.active) {
      if (mode === 'sticky') this.mode = 'sticky';
      return;
    }
    this.active = true;
    this.paused = false;
    this.mode = mode;
    applyCrosshairCursor();
    addEventListener('mousemove', this.onMouseMove, true);
    addEventListener('mousedown', this.onMouseDown, true);
    addEventListener('mouseup', this.onMouseUp, true);
    addEventListener('click', this.onClickCapture, true);
    addEventListener('keydown', this.onKeyDown, true);
    addEventListener('contextmenu', this.onContextMenu, true);
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.paused = false;
    this.mode = 'sticky';
    removeCrosshairCursor();
    removeEventListener('mousemove', this.onMouseMove, true);
    removeEventListener('mousedown', this.onMouseDown, true);
    removeEventListener('mouseup', this.onMouseUp, true);
    removeEventListener('click', this.onClickCapture, true);
    removeEventListener('keydown', this.onKeyDown, true);
    removeEventListener('contextmenu', this.onContextMenu, true);
    this.clearHoverTimer();
    this.regionStart = null;
    this.pointerDown = null;
    this.didRegionDrag = false;
    this.regionRect.hide();
    this.highlight.hide();
  }

  pause(): void {
    if (!this.active || this.paused) return;
    this.paused = true;
    this.clearHoverTimer();
    this.regionStart = null;
    this.pointerDown = null;
    this.didRegionDrag = false;
    this.regionRect.hide();
    this.highlight.hide();
    removeCrosshairCursor();
  }

  resume(): void {
    if (!this.active || !this.paused) return;
    this.paused = false;
    applyCrosshairCursor();
  }

  isActive(): boolean {
    return this.active;
  }

  isPaused(): boolean {
    return this.paused;
  }

  getMode(): PickerMode {
    return this.mode;
  }

  private isLive(): boolean {
    return this.active && !this.paused;
  }

  private onMouseMove = (ev: MouseEvent): void => {
    if (!this.isLive()) return;
    if (this.regionStart) {
      this.updateRegion(ev.clientX, ev.clientY);
      return;
    }
    if (this.pointerDown) {
      const dx = Math.abs(ev.clientX - this.pointerDown.x);
      const dy = Math.abs(ev.clientY - this.pointerDown.y);
      if (dx >= REGION_DRAG_THRESHOLD || dy >= REGION_DRAG_THRESHOLD) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        this.regionStart = this.pointerDown;
        this.didRegionDrag = true;
        // Cancel any pending hover so a queued highlight can't pop up mid-drag.
        this.clearHoverTimer();
        this.highlight.hide();
        this.updateRegion(ev.clientX, ev.clientY);
        return;
      }
    }
    this.scheduleHover(ev.clientX, ev.clientY);
  };

  private onMouseDown = (ev: MouseEvent): void => {
    if (!this.isLive()) return;
    if (ev.button !== 0 && ev.button !== 2) return;
    const target = this.targetElement(ev);
    if (!target) return;
    // Secondary (right) click picks just like the primary one. Swallowing it
    // keeps modals open — they close on a primary outside-click, not a secondary.
    if (ev.button === 2) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
    }
    this.pointerDown = { x: ev.clientX, y: ev.clientY };
    this.didRegionDrag = false;
  };

  private onMouseUp = (ev: MouseEvent): void => {
    if (!this.isLive()) return;
    if (ev.button !== 0 && ev.button !== 2) return;
    if (!this.regionStart) {
      if (ev.button === 2) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
      }
      this.pointerDown = null;
      return;
    }
    ev.preventDefault();
    ev.stopImmediatePropagation();
    const start = this.regionStart;
    this.regionStart = null;
    this.pointerDown = null;
    const x = Math.min(start.x, ev.clientX);
    const y = Math.min(start.y, ev.clientY);
    const w = Math.abs(ev.clientX - start.x);
    const h = Math.abs(ev.clientY - start.y);
    this.regionRect.hide();
    if (w < REGION_MIN_SIZE || h < REGION_MIN_SIZE) return;
    this.cb.onPickRegion({ x, y, width: w, height: h });
  };

  private onClickCapture = (ev: MouseEvent): void => {
    if (!this.isLive()) return;
    if (ev.button !== 0) return;
    if (this.didRegionDrag) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      this.didRegionDrag = false;
      return;
    }
    const target = this.targetElement(ev);
    if (!target) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      return;
    }
    ev.preventDefault();
    ev.stopImmediatePropagation();
    this.cb.onPickElement(target);
  };

  private onKeyDown = (ev: KeyboardEvent): void => {
    if (!this.isLive()) return;
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      this.cb.onCancel();
    }
  };

  private onContextMenu = (ev: MouseEvent): void => {
    if (!this.isLive()) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    // A right click is the secondary way to pick an element. (On macOS the
    // contextmenu fires on mousedown, so this is how the right click lands.)
    if (this.didRegionDrag) {
      this.didRegionDrag = false;
      return;
    }
    const target = this.targetElement(ev);
    if (target) this.cb.onPickElement(target);
  };

  private targetElement(ev: MouseEvent): Element | null {
    const list = document.elementsFromPoint(ev.clientX, ev.clientY);
    for (const el of list) {
      if (el === document.documentElement) continue;
      if (this.cb.isOurDom(el)) continue;
      if (el === document.body && list.length > 1) continue;
      return el;
    }
    return null;
  }

  private scheduleHover(x: number, y: number): void {
    this.clearHoverTimer();
    this.hoverTimer = window.setTimeout(() => {
      const list = document.elementsFromPoint(x, y);
      const target = list.find((el) => !this.cb.isOurDom(el) && el !== document.documentElement);
      if (target) this.highlight.show(target);
      else this.highlight.hide();
    }, HOVER_DEBOUNCE_MS);
  }

  private clearHoverTimer(): void {
    if (this.hoverTimer != null) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
  }

  private updateRegion(curX: number, curY: number): void {
    if (!this.regionStart) return;
    const x = Math.min(this.regionStart.x, curX);
    const y = Math.min(this.regionStart.y, curY);
    const w = Math.abs(curX - this.regionStart.x);
    const h = Math.abs(curY - this.regionStart.y);
    this.regionRect.show({ x, y, width: w, height: h });
  }
}
