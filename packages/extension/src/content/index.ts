import type { RectInfo, PinForPage } from '../common/types.js';
import type { TabCommand } from '../common/messaging.js';
import { sendRequest } from '../common/messaging.js';
import { isOriginAllowed, type Settings } from '../common/settings.js';
import { loadSettings, onSettingsChange } from '../common/storage.js';
import { createLogger } from '../common/logger.js';
import { sameView } from '../common/view-url.js';
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
import { showPulse } from './overlay/pulse.js';
import { Picker } from './picker/element-picker.js';
import {
  capturePin,
  assembleAnnotation,
  type CaptureOverlay,
  type PinCapture,
  type PinTarget,
} from './capture/index.js';
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
  private pins: PinForPage[] = [];
  private active = true;
  private lastRightClickedEl: Element | null = null;
  private urlPollId: number | null = null;
  private stopping = false;

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
      onPickRegion: (rect) => this.handlePickRegion(rect),
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
    // Stopping mid-note submits it if it has content, otherwise cancels it.
    this.stopping = true;
    if (this.popup.isOpen()) this.popup.flush();
    this.picker.stop();
    this.broadcastPickerState(false);
    this.stopping = false;
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
    if (r.ok) {
      this.pins = r.pins;
      this.markers.update(r.pins);
    }
  }

  private captureOverlay(): CaptureOverlay {
    return {
      showHighlight: (el) => this.highlight.show(el),
      hideHighlight: () => this.highlight.hide(),
      showProvisional: (ord, rect, kind) => this.markers.showProvisional(ord, rect, kind),
      hideProvisional: () => this.markers.hideProvisional(),
      withOverlayHidden: (fn) => withOverlayHidden(fn),
    };
  }

  private handlePickElement(el: Element): void {
    const wasOneShot = this.picker.getMode() === 'oneShot';
    this.picker.pause();
    const r = el.getBoundingClientRect();
    const anchorRect: RectInfo = { x: r.x, y: r.y, width: r.width, height: r.height };
    void this.startNote(
      { kind: 'element', element: el },
      anchorRect,
      previewSelector(el),
      wasOneShot,
    );
  }

  private handlePickRegion(rect: RectInfo): void {
    const wasOneShot = this.picker.getMode() === 'oneShot';
    this.picker.pause();
    const preview = `region · ${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    void this.startNote({ kind: 'region', rect }, rect, preview, wasOneShot);
  }

  private handleAnnotateContext(): void {
    if (!this.lastRightClickedEl) return;
    const el = this.lastRightClickedEl;
    if (!el.isConnected) return;
    if (this.isOurDom(el)) return;
    const r = el.getBoundingClientRect();
    const anchorRect: RectInfo = { x: r.x, y: r.y, width: r.width, height: r.height };
    // Right-click context-menu path: independent of the picker (no follow-up).
    void this.startNote({ kind: 'element', element: el }, anchorRect, previewSelector(el), null);
  }

  /**
   * Capture the pin right now — the screenshots freeze the page at this moment,
   * not at submit — then open the note popup. `pickerFollowup` is the one-shot
   * flag for picker-driven pins, or null for the context-menu path.
   */
  private async startNote(
    target: PinTarget,
    anchorRect: RectInfo,
    selectorPreview: string,
    pickerFollowup: boolean | null,
  ): Promise<void> {
    const provisionalOrd = this.markers.count() + 1;
    // Immediate feedback while the (async) capture runs.
    if (target.kind === 'element') this.highlight.show(target.element);
    this.markers.showProvisional(provisionalOrd, anchorRect, target.kind);

    let capture: PinCapture | null = null;
    try {
      capture = await capturePin(target, this.settings, this.captureOverlay(), provisionalOrd);
    } catch (e) {
      log.error('capture failed', e);
    }

    const finish = () => {
      this.markers.hideProvisional();
      this.highlight.hide();
      if (pickerFollowup === null) return; // context-menu path: leave picker alone
      if (this.stopping || !this.picker.isActive()) return; // stopPicker owns the teardown
      if (pickerFollowup) this.stopPicker();
      else this.picker.resume();
    };

    this.popup.open({
      anchorRect,
      selectorPreview,
      enableSpeech: this.settings.flags.enableWebSpeech,
      onConfirm: async (note) => {
        if (capture) {
          const payload = assembleAnnotation(capture, note);
          const resp = await sendRequest({ kind: 'annotation:add', payload });
          if (!resp.ok) log.warn('annotation add failed', resp.error);
          await this.refreshMarkers();
        }
        finish();
      },
      onCancel: () => finish(),
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

  private async handlePinFocus(annotationId: string, edit: boolean): Promise<void> {
    let pin = this.pins.find((p) => p.id === annotationId);
    if (!pin) {
      await this.refreshMarkers();
      pin = this.pins.find((p) => p.id === annotationId);
    }
    if (!pin || !sameView(pin.url, location.href)) return;
    this.scrollPinIntoView(pin);
    window.setTimeout(() => {
      const target = this.resolvePinTarget(pin);
      if (!target) return;
      if (target.element) {
        this.highlight.show(target.element);
        if (!edit) window.setTimeout(() => this.highlight.hide(), 1800);
      } else {
        this.regionRect.show(target.rect);
        if (!edit) window.setTimeout(() => this.regionRect.hide(), 1800);
      }
      showPulse(this.overlay.layer, target.rect, 1500);
      if (edit) this.openEditPopup(pin, target);
    }, 240);
  }

  private openEditPopup(
    pin: PinForPage,
    target: { rect: RectInfo; selectorPreview: string; element: Element | null },
  ): void {
    this.popup.close();
    const finish = () => {
      this.highlight.hide();
      this.regionRect.hide();
    };
    this.popup.open({
      anchorRect: target.rect,
      selectorPreview: target.selectorPreview,
      enableSpeech: this.settings.flags.enableWebSpeech,
      initialComment: pin.comment,
      initialVoiceTranscript: pin.voiceTranscript ?? '',
      initialAttachments: pin.attachments ?? [],
      submitLabel: 'Save',
      onConfirm: async (note) => {
        const resp = await sendRequest({
          kind: 'annotation:update',
          annotationId: pin.id,
          comment: note.comment,
          voiceTranscript: note.voiceTranscript,
          attachments: note.attachments,
        });
        if (!resp.ok) log.warn('annotation update failed', resp.error);
        await this.refreshMarkers();
        finish();
      },
      onCancel: () => finish(),
    });
  }

  private scrollPinIntoView(pin: PinForPage): void {
    if (pin.region) {
      window.scrollTo({
        left: Math.max(0, pin.region.x + pin.region.width / 2 - window.innerWidth / 2),
        top: Math.max(0, pin.region.y + pin.region.height / 2 - window.innerHeight / 2),
        behavior: 'smooth',
      });
      return;
    }
    const el = this.resolvePinElement(pin);
    el?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }

  private resolvePinTarget(
    pin: PinForPage,
  ): { rect: RectInfo; selectorPreview: string; element: Element | null } | null {
    if (pin.region) {
      return {
        rect: {
          x: pin.region.x - window.scrollX,
          y: pin.region.y - window.scrollY,
          width: pin.region.width,
          height: pin.region.height,
        },
        selectorPreview: `region · ${Math.round(pin.region.width)} × ${Math.round(pin.region.height)}`,
        element: null,
      };
    }
    const el = this.resolvePinElement(pin);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;
    return {
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      selectorPreview: pin.selector ?? previewSelector(el),
      element: el,
    };
  }

  private resolvePinElement(pin: PinForPage): Element | null {
    if (!pin.selector) return null;
    try {
      return document.querySelector(pin.selector);
    } catch {
      return null;
    }
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
        case 'pin:focus':
          void this.handlePinFocus(cmd.annotationId, false).then(() => sendResponse({ ok: true }));
          return true;
        case 'pin:edit':
          void this.handlePinFocus(cmd.annotationId, true).then(() => sendResponse({ ok: true }));
          return true;
        case 'picker:query-state':
          sendResponse({
            ok: true,
            active: this.picker.isActive(),
            mode: this.picker.getMode(),
            markersVisible: this.markers.isVisible(),
          });
          return false;
        case 'pins:set-visible':
          this.markers.setVisible(cmd.visible);
          sendResponse({ ok: true, visible: cmd.visible });
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
    addEventListener('hashchange', checkUrl);
    // Safety net for SPAs whose view changes our history patch and the events
    // above don't catch — e.g. a router that grabbed pushState before we patched
    // it, or query-only navigations. Cheap string compare; only does work when
    // the URL actually changed, so stale pins from another view can't linger.
    this.urlPollId = window.setInterval(checkUrl, 400);
  }

  private shutdown(): void {
    if (!this.active) return;
    this.active = false;
    if (this.urlPollId != null) {
      clearInterval(this.urlPollId);
      this.urlPollId = null;
    }
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
