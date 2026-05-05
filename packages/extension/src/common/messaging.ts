import type { AnnotationPayload, AnnotationSummary, RectInfo } from '@dompin/shared';
import type { Settings } from './settings.js';

export interface ConnectionStatus {
  state: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastError: string | null;
  reconnectAttempt: number;
  serverVersion: string | null;
  serverProtocolVersion: string | null;
}

export interface PinForPage {
  id: string;
  ordinal: number;
  selector: string | null;
  region: RectInfo | null;
  commentPreview: string;
  createdAt: number;
}

export interface ExtensionState {
  connection: ConnectionStatus;
  pendingCount: number;
  queue: AnnotationSummary[];
  settings: Settings;
}

export type RequestMessage =
  | { kind: 'state:get' }
  | { kind: 'pin'; payload: AnnotationPayload }
  | { kind: 'cancel'; id: string }
  | { kind: 'send-all' }
  | { kind: 'clear' }
  | { kind: 'capture-viewport' }
  | { kind: 'capture-zoned'; rect: RectInfo; dpr: number; padding?: number }
  | { kind: 'pins:for-url'; url: string }
  | { kind: 'toggle-picker' }
  | { kind: 'test-connection'; settings: Settings }
  | { kind: 'reconnect' }
  | { kind: 'settings:save'; settings: Settings };

export type Response<T> = { ok: true } & T extends never
  ? { ok: false; error: string }
  : ({ ok: true } & T) | { ok: false; error: string };

export type StateResponse = Response<{ state: ExtensionState }>;
export type PinResponse = Response<{ id: string }>;
export type SendAllResponse = Response<{ sent: number }>;
export type CaptureResponse = Response<{ dataUrl: string }>;
export type PinsForUrlResponse = Response<{ pins: PinForPage[] }>;
export type TestConnectionResponse = Response<{ serverVersion: string; protocolVersion: string }>;
export type Ok = Response<Record<string, never>>;

export type TabCommand =
  | { kind: 'picker:toggle' }
  | { kind: 'picker:open' }
  | { kind: 'picker:close' }
  | { kind: 'highlight'; selector: string; durationMs?: number }
  | { kind: 'scrollTo'; selector: string; behavior?: ScrollBehavior }
  | { kind: 'pins:update' };

export function sendRequest<T = unknown>(
  req: RequestMessage,
): Promise<{ ok: true } & T | { ok: false; error: string }> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(req, (resp: { ok: true } & T | { ok: false; error: string }) => {
        const err = chrome.runtime.lastError;
        if (err) {
          resolve({ ok: false, error: err.message ?? 'runtime error' });
          return;
        }
        resolve(resp ?? { ok: false, error: 'no response' });
      });
    } catch (e) {
      resolve({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
}
