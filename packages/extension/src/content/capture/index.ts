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

export async function buildAnnotation(
  input: PinInput,
  settings: Settings,
): Promise<AnnotationPayload> {
  const page = capturePage();
  const dpr = page.viewport.devicePixelRatio;
  let elementCtx = null;
  let regionCtx = null;
  let zonedRect: RectInfo | null = null;

  if (input.kind === 'element') {
    elementCtx = captureElement(input.element, {
      enableReactFiber: settings.flags.enableReactFiber,
    });
    zonedRect = elementCtx.boundingRect;
  } else {
    regionCtx = { rect: input.rect };
    zonedRect = input.rect;
  }

  const viewportPromise = sendRequest<{ dataUrl: string }>({ kind: 'capture-viewport' });
  const zonedPromise = zonedRect
    ? sendRequest<{ dataUrl: string }>({
        kind: 'capture-zoned',
        rect: zonedRect,
        dpr,
        padding: 16,
      })
    : Promise.resolve({ ok: false as const, error: 'no rect' });

  const [viewportResp, zonedResp] = await Promise.all([viewportPromise, zonedPromise]);
  const viewportShot = viewportResp.ok ? viewportResp.dataUrl : '';
  const zonedShot = zonedResp.ok ? zonedResp.dataUrl : null;

  const payload: AnnotationPayload = {
    id: newId(),
    createdAt: Date.now(),
    page,
    element: elementCtx,
    region: regionCtx,
    comment: input.comment.trim(),
    screenshots: { viewport: viewportShot, zoned: zonedShot },
    console: snapshotConsole(),
  };
  if (input.voiceTranscript && input.voiceTranscript.trim().length > 0) {
    payload.voiceTranscript = input.voiceTranscript.trim();
  }
  return payload;
}
