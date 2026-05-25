import type {
  AnnotationAttachment,
  AnnotationPayload,
  ElementContext,
  RectInfo,
  RegionCorner,
} from '../../common/types.js';
import { sendRequest } from '../../common/messaging.js';
import { newId } from '../../common/id.js';
import type { Settings } from '../../common/settings.js';
import { snapshotConsole } from '../console-buffer.js';
import { captureElement } from './element.js';
import { capturePage } from './page.js';

export interface PinInputElement {
  kind: 'element';
  element: Element;
  comment: string;
  voiceTranscript: string | null;
  attachments: AnnotationAttachment[];
}

export interface PinInputRegion {
  kind: 'region';
  rect: RectInfo;
  corner: RegionCorner;
  comment: string;
  voiceTranscript: string | null;
  attachments: AnnotationAttachment[];
}

export type PinInput = PinInputElement | PinInputRegion;

export interface CaptureOverlay {
  showHighlight(el: Element): void;
  hideHighlight(): void;
  showProvisional(ord: number, rect: RectInfo, corner?: RegionCorner): void;
  hideProvisional(): void;
  withOverlayHidden<T>(fn: () => Promise<T>): Promise<T>;
}

export async function buildAnnotation(
  input: PinInput,
  settings: Settings,
  overlay: CaptureOverlay,
  provisionalOrdinal: number,
): Promise<AnnotationPayload> {
  const page = capturePage();
  const dpr = page.viewport.devicePixelRatio;
  let elementCtx = null;
  let regionCtx = null;
  let rect: RectInfo | null = null;

  if (input.kind === 'element') {
    elementCtx = captureElement(input.element, {
      enableReactFiber: settings.flags.enableReactFiber,
    });
    rect = elementCtx.boundingRect;
    overlay.showHighlight(input.element);
  } else {
    regionCtx = {
      rect: input.rect,
      corner: input.corner,
      elements: captureElementsInRegion(input.rect, settings),
    };
    rect = input.rect;
  }

  if (rect) overlay.showProvisional(provisionalOrdinal, rect, regionCtx?.corner);

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

  overlay.hideProvisional();

  const payload: AnnotationPayload = {
    id: newId(),
    createdAt: Date.now(),
    page,
    element: elementCtx,
    region: regionCtx,
    comment: input.comment.trim(),
    attachments: input.attachments.length ? input.attachments : undefined,
    screenshots: { viewport: viewportShot, element: elementShot },
    console: snapshotConsole(),
  };
  if (input.voiceTranscript && input.voiceTranscript.trim().length > 0) {
    payload.voiceTranscript = input.voiceTranscript.trim();
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
