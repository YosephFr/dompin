import type { RectInfo, PinForPage, RegionCorner } from '../common/types.js';
import type { TabCommand } from '../common/messaging.js';
import { sendRequest } from '../common/messaging.js';
import { isOriginAllowed, type Settings } from '../common/settings.js';
import { loadSettings, onSettingsChange } from '../common/storage.js';
import { createLogger } from '../common/logger.js';
import { installConsoleBuffer } from './console-buffer.js';
import {
  ensureOverlay,
  teardownOverlay,
  withOverlayHidden,
  type OverlayHandles,
} from './overlay/host.js';
import { Highlight } from './overlay/highlight.js';
import { RegionRect } from './overlay/region-rect.js';
import { MarkerManager } from './overlay/markers.js';
import { CommentPopup } from './overlay/comment-popup.js';
import { Picker } from './picker/element-picker.js';
import { buildAnnotation, type CaptureOverlay } from './capture/index.js';
import { uniqueSelector } from './capture/selector.js';

const log = createLogger('content');

class ContentApp {
  private settings: Settings;
  private overlay: OverlayHandles;
  private highlight: Highlight;
  private regionRect: RegionRect;
  private markers: MarkerManager;
  private popup: CommentPopup;
  private picker: Picker;
  private currentUrl: string;
  private active = true;
  private lastRightClickedEl: Element | null = null;

  constructor(settings: Settings) {
    this.settings = settings;
    this.overlay = ensureOverlay();
    this.highlight = new Highlight(this.overlay.layer);
    this.regionRect = new RegionRect(this.overlay.layer);
    this.markers = new MarkerManager(this.overlay.layer, {
      onMarkerClick: (id, ev) => this.handleMarkerClick(id, ev),
    });
    this.popup = new CommentPopup(this.overlay.layer);
    this.picker = new Picker(this.highlight, this.regionRect, {
      onPickElement: (el) => this.handlePickElement(el),
      onPickRegion: (rect, corner) => this.handlePickRegion(rect, corner),
      onCancel: () => this.handleCancel(),
      isOurDom: (el) => this.isOurDom(el),
    });
    this.currentUrl = location.href;
    this.setupTabMessageListener();
    this.setupSettingsListener();
    this.setupUrlChangeListener();
    this.setupContextMenuTracker();
    void this.refreshMarkers();
  }

  togglePicker(mode: 'sticky' | 'oneShot' = 'sticky'): void {
    if (this.popup.isOpen()) {
      this.popup.close();
      return;
    }
    if (this.picker.isActive()) {
      if (mode === 'oneShot' && this.picker.getMode() === 'sticky') return;
      this.picker.stop();
      this.broadcastPickerState(false);
    } else {
      this.picker.start(mode);
      this.broadcastPickerState(true, mode);
    }
  }

  startPicker(mode: 'sticky' | 'oneShot'): void {
    if (this.picker.isActive()) {
      if (mode === 'oneShot' && this.picker.getMode() === 'sticky') return;
      this.picker.stop();
    }
    this.picker.start(mode);
    this.broadcastPickerState(true, mode);
  }

  stopPicker(): void {
    if (!this.picker.isActive()) return;
    this.picker.stop();
    this.broadcastPickerState(false);
  }

  private broadcastPickerState(active: boolean, mode?: 'sticky' | 'oneShot'): void {
    void sendRequest({
      kind: 'picker:state-broadcast',
      active,
      ...(active && mode ? { mode } : {}),
    });
  }

  private isOurDom(el: Element): boolean {
    return el === this.overlay.shadowRoot.host || this.overlay.shadowRoot.host.contains(el);
  }

  private async refreshMarkers(): Promise<void> {
    this.markers.setView(location.href);
    const r = await sendRequest<{ pins: PinForPage[] }>({ kind: 'pins:for-tab' });
    if (r.ok) this.markers.update(r.pins);
  }

  private captureOverlay(): CaptureOverlay {
    return {
      showHighlight: (el) => this.highlight.show(el),
      hideHighlight: () => this.highlight.hide(),
      showProvisional: (ord, rect, corner) => this.markers.showProvisional(ord, rect, corner),
      hideProvisional: () => this.markers.hideProvisional(),
      withOverlayHidden: (fn) => withOverlayHidden(fn),
    };
  }

  private handlePickElement(el: Element): void {
    const wasOneShot = this.picker.getMode() === 'oneShot';
    this.picker.pause();
    this.highlight.show(el);
    const rect = el.getBoundingClientRect();
    const anchorRect: RectInfo = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    const provisionalOrd = this.markers.count() + 1;
    this.markers.showProvisional(provisionalOrd, anchorRect);
    const selectorPreview = previewSelector(el);
    this.popup.open({
      anchorRect,
      selectorPreview,
      enableSpeech: this.settings.flags.enableWebSpeech,
      onConfirm: async ({ comment, voiceTranscript, attachments }) => {
        await this.runCapture(
          { kind: 'element', element: el, comment, voiceTranscript, attachments },
          rect,
        );
        if (wasOneShot) this.stopPicker();
        else this.picker.resume();
      },
      onCancel: () => {
        this.markers.hideProvisional();
        this.highlight.hide();
        if (wasOneShot) this.stopPicker();
        else this.picker.resume();
      },
    });
  }

  private handlePickRegion(rect: RectInfo, corner: RegionCorner): void {
    const wasOneShot = this.picker.getMode() === 'oneShot';
    this.picker.pause();
    const provisionalOrd = this.markers.count() + 1;
    this.markers.showProvisional(provisionalOrd, rect, corner);
    this.popup.open({
      anchorRect: rect,
      selectorPreview: `region · ${Math.round(rect.width)} × ${Math.round(rect.height)}`,
      enableSpeech: this.settings.flags.enableWebSpeech,
      onConfirm: async ({ comment, voiceTranscript, attachments }) => {
        await this.runCapture(
          { kind: 'region', rect, corner, comment, voiceTranscript, attachments },
          rect,
        );
        if (wasOneShot) this.stopPicker();
        else this.picker.resume();
      },
      onCancel: () => {
        this.markers.hideProvisional();
        if (wasOneShot) this.stopPicker();
        else this.picker.resume();
      },
    });
  }

  private async runCapture(
    input: Parameters<typeof buildAnnotation>[0],
    targetRect: RectInfo | DOMRect,
  ): Promise<void> {
    const provisionalOrd = this.markers.count() + 1;
    const overlay = this.captureOverlay();
    if (input.kind === 'element') {
      overlay.showHighlight(input.element);
    }
    overlay.showProvisional(
      provisionalOrd,
      toRectInfo(targetRect),
      input.kind === 'region' ? input.corner : undefined,
    );
    try {
      const payload = await buildAnnotation(input, this.settings, overlay, provisionalOrd);
      const resp = await sendRequest({ kind: 'annotation:add', payload });
      if (!resp.ok) log.warn('annotation add failed', resp.error);
      await this.refreshMarkers();
    } catch (e) {
      log.error('capture failed', e);
    } finally {
      overlay.hideProvisional();
      this.highlight.hide();
    }
  }

  private handleAnnotateContext(): void {
    if (!this.lastRightClickedEl) return;
    const el = this.lastRightClickedEl;
    if (!el.isConnected) return;
    if (this.isOurDom(el)) return;
    const rect = el.getBoundingClientRect();
    const anchorRect: RectInfo = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    const selectorPreview = previewSelector(el);
    this.popup.open({
      anchorRect,
      selectorPreview,
      enableSpeech: this.settings.flags.enableWebSpeech,
      onConfirm: async ({ comment, voiceTranscript, attachments }) => {
        await this.runCapture(
          { kind: 'element', element: el, comment, voiceTranscript, attachments },
          rect,
        );
      },
      onCancel: () => {
        this.highlight.hide();
      },
    });
  }

  private handleCancel(): void {
    if (this.popup.isOpen()) {
      this.popup.close();
      return;
    }
    this.stopPicker();
  }

  private handleMarkerClick(id: string, ev: MouseEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    const remove = window.confirm('Remove this DOMPin annotation?');
    if (!remove) return;
    void sendRequest({ kind: 'annotation:cancel', annotationId: id }).then((r) => {
      if (r.ok) void this.refreshMarkers();
    });
  }

  private setupTabMessageListener(): void {
    chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      if (!message || typeof message !== 'object' || !('kind' in message)) return false;
      const cmd = message as TabCommand;
      switch (cmd.kind) {
        case 'picker:toggle':
          this.togglePicker(cmd.mode ?? 'sticky');
          sendResponse({ ok: true });
          return false;
        case 'picker:open':
          this.startPicker(cmd.mode ?? 'sticky');
          sendResponse({ ok: true });
          return false;
        case 'picker:close':
          this.stopPicker();
          sendResponse({ ok: true });
          return false;
        case 'annotate:context':
          this.handleAnnotateContext();
          sendResponse({ ok: true });
          return false;
        case 'picker:query-state':
          sendResponse({
            ok: true,
            active: this.picker.isActive(),
            mode: this.picker.getMode(),
          });
          return false;
        case 'picker:needs-session':
          sendResponse({ ok: true });
          return false;
        case 'pins:update':
          void this.refreshMarkers();
          sendResponse({ ok: true });
          return false;
      }
      return false;
    });
  }

  private setupSettingsListener(): void {
    onSettingsChange((next) => {
      const wasAllowed = isOriginAllowed(location.href, this.settings.allowlist);
      const isAllowedNow = isOriginAllowed(location.href, next.allowlist);
      this.settings = next;
      if (wasAllowed && !isAllowedNow) {
        this.shutdown();
      }
    });
  }

  private setupContextMenuTracker(): void {
    document.addEventListener(
      'contextmenu',
      (ev) => {
        const target = ev.target;
        if (target instanceof Element) {
          if (this.isOurDom(target)) return;
          this.lastRightClickedEl = target;
        }
      },
      true,
    );
  }

  private setupUrlChangeListener(): void {
    const checkUrl = () => {
      if (location.href !== this.currentUrl) {
        this.currentUrl = location.href;
        // Scope markers to the new view immediately, then refetch. A second
        // delayed refresh catches SPA views whose content mounts a beat later.
        this.markers.setView(this.currentUrl);
        void this.refreshMarkers();
        window.setTimeout(() => void this.refreshMarkers(), 450);
      }
    };
    addEventListener('popstate', checkUrl);
    const orig = history.pushState;
    if (orig && !(history as unknown as { __dompinPatched?: boolean }).__dompinPatched) {
      history.pushState = function (...args: Parameters<History['pushState']>) {
        const r = orig.apply(this, args);
        window.dispatchEvent(new Event('dompin:locationchange'));
        return r;
      };
      const origReplace = history.replaceState;
      history.replaceState = function (...args: Parameters<History['replaceState']>) {
        const r = origReplace.apply(this, args);
        window.dispatchEvent(new Event('dompin:locationchange'));
        return r;
      };
      (history as unknown as { __dompinPatched: boolean }).__dompinPatched = true;
    }
    addEventListener('dompin:locationchange', checkUrl);
  }

  private shutdown(): void {
    if (!this.active) return;
    this.active = false;
    this.picker.stop();
    this.popup.destroy();
    this.markers.destroy();
    this.regionRect.destroy();
    this.highlight.destroy();
    teardownOverlay();
  }
}

function previewSelector(el: Element): string {
  try {
    const sel = uniqueSelector(el);
    return sel.length > 80 ? sel.slice(0, 77) + '...' : sel;
  } catch {
    return el.tagName.toLowerCase();
  }
}

function toRectInfo(r: RectInfo | DOMRect): RectInfo {
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

async function bootstrap(): Promise<void> {
  if (window.top !== window.self) return;
  installConsoleBuffer();
  const settings = await loadSettings();
  if (!isOriginAllowed(location.href, settings.allowlist)) {
    log.info('origin not allowed, idle');
    onSettingsChange((next) => {
      if (isOriginAllowed(location.href, next.allowlist)) {
        new ContentApp(next);
      }
    });
    return;
  }
  new ContentApp(settings);
}

void bootstrap();
