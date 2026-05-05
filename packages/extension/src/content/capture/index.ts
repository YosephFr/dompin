import type { AnnotationPayload, RectInfo } from '../../common/types.js';
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
}

export interface PinInputRegion {
  kind: 'region';
  rect: RectInfo;
  comment: string;
  voiceTranscript: string | null;
}

export type PinInput = PinInputElement | PinInputRegion;

export interface CaptureOverlay {
  showHighlight(el: Element): void;
  hideHighlight(): void;
  showProvisional(ord: number, rect: RectInfo): void;
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
    regionCtx = { rect: input.rect };
    rect = input.rect;
  }

  if (rect) overlay.showProvisional(provisionalOrdinal, rect);

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
    screenshots: { viewport: viewportShot, element: elementShot },
    console: snapshotConsole(),
  };
  if (input.voiceTranscript && input.voiceTranscript.trim().length > 0) {
    payload.voiceTranscript = input.voiceTranscript.trim();
  }
  return payload;
}

function waitTwoFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
