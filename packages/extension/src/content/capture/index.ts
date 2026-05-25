import type {
  AnnotationAttachment,
  AnnotationPayload,
  ConsoleEntry,
  ElementContext,
  PageContext,
  RectInfo,
  RegionContext,
  ScreenshotSet,
} from '../../common/types.js';
import { sendRequest } from '../../common/messaging.js';
import { newId } from '../../common/id.js';
import type { Settings } from '../../common/settings.js';
import { snapshotConsole } from '../console-buffer.js';
import { captureElement } from './element.js';
import { capturePage } from './page.js';

/** What is being pinned — captured at click time, before the note is written. */
export type PinTarget = { kind: 'element'; element: Element } | { kind: 'region'; rect: RectInfo };

/** The note content, gathered from the popup when the user submits. */
export interface PinNote {
  comment: string;
  voiceTranscript: string | null;
  attachments: AnnotationAttachment[];
}

/**
 * The screenshots and DOM metadata captured the moment the pin is placed (a
 * click on an element or release of a drag-region). Held until the note is
 * submitted, so the saved images reflect the page at pick time, not at submit.
 */
export interface PinCapture {
  id: string;
  createdAt: number;
  page: PageContext;
  element: ElementContext | null;
  region: RegionContext | null;
  screenshots: ScreenshotSet;
  console: ConsoleEntry[];
}

export interface CaptureOverlay {
  showHighlight(el: Element): void;
  hideHighlight(): void;
  showProvisional(ord: number, rect: RectInfo, kind?: 'element' | 'region'): void;
  hideProvisional(): void;
  withOverlayHidden<T>(fn: () => Promise<T>): Promise<T>;
}

/**
 * Capture the page at the moment the pin is placed: viewport + element/region
 * screenshots and DOM metadata. Runs before the comment popup opens.
 */
export async function capturePin(
  target: PinTarget,
  settings: Settings,
  overlay: CaptureOverlay,
  provisionalOrdinal: number,
): Promise<PinCapture> {
  const page = capturePage();
  const dpr = page.viewport.devicePixelRatio;
  let elementCtx: ElementContext | null = null;
  let regionCtx: RegionContext | null = null;
  let rect: RectInfo | null = null;

  if (target.kind === 'element') {
    elementCtx = captureElement(target.element, {
      enableReactFiber: settings.flags.enableReactFiber,
    });
    rect = elementCtx.boundingRect;
    overlay.showHighlight(target.element);
  } else {
    regionCtx = {
      rect: target.rect,
      elements: captureElementsInRegion(target.rect, settings),
    };
    rect = target.rect;
  }

  if (rect) overlay.showProvisional(provisionalOrdinal, rect, regionCtx ? 'region' : 'element');

  await waitTwoFrames();

  const viewportResp = await sendRequest<{ dataUrl: string }>({ kind: 'capture-viewport' });
  const viewportShot = viewportResp.ok ? viewportResp.dataUrl : '';

  let elementShot: string | null = null;
  if (rect) {
    const targetRect = rect;
    const elemResp = await overlay.withOverlayHidden(() =>
      sendRequest<{ dataUrl: string }>({
        kind: 'capture-element',
        rect: targetRect,
        dpr,
        padding: 24,
      }),
    );
    elementShot = elemResp.ok ? elemResp.dataUrl : null;
  }

  return {
    id: newId(),
    createdAt: Date.now(),
    page,
    element: elementCtx,
    region: regionCtx,
    screenshots: { viewport: viewportShot, element: elementShot },
    console: snapshotConsole(),
  };
}

/** Combine a capture with the written note into the final payload to persist. */
export function assembleAnnotation(capture: PinCapture, note: PinNote): AnnotationPayload {
  const payload: AnnotationPayload = {
    id: capture.id,
    createdAt: capture.createdAt,
    page: capture.page,
    element: capture.element,
    region: capture.region,
    comment: note.comment.trim(),
    attachments: note.attachments.length ? note.attachments : undefined,
    screenshots: capture.screenshots,
    console: capture.console,
  };
  if (note.voiceTranscript && note.voiceTranscript.trim().length > 0) {
    payload.voiceTranscript = note.voiceTranscript.trim();
  }
  return payload;
}

function captureElementsInRegion(rect: RectInfo, settings: Settings): ElementContext[] {
  const candidates = Array.from(document.body.querySelectorAll('*')).filter((el) => {
    if (!(el instanceof HTMLElement || el instanceof SVGElement)) return false;
    if (el.id === 'dompin-overlay-host') return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const centerX = r.x + r.width / 2;
    const centerY = r.y + r.height / 2;
    return (
      centerX >= rect.x &&
      centerX <= rect.x + rect.width &&
      centerY >= rect.y &&
      centerY <= rect.y + rect.height
    );
  });

  return candidates
    .sort((a, b) => rectArea(a.getBoundingClientRect()) - rectArea(b.getBoundingClientRect()))
    .slice(0, 24)
    .map((el) =>
      captureElement(el, {
        enableReactFiber: settings.flags.enableReactFiber,
      }),
    );
}

function rectArea(rect: DOMRect): number {
  return rect.width * rect.height;
}

function waitTwoFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
