import type {
  AnnotationPayload,
  PinForPage,
  RectInfo,
  Session,
  SessionListItem,
  VaultStatus,
} from './types.js';
import type { Settings } from './settings.js';

export interface ExtensionState {
  vault: VaultStatus;
  settings: Settings;
}

export type RequestMessage =
  | { kind: 'state:get' }
  | { kind: 'vault:status' }
  | { kind: 'vault:pickRoot'; rootName: string }
  | { kind: 'vault:reconnect' }
  | { kind: 'vault:clear' }
  | { kind: 'vault:request-permission' }
  | { kind: 'session:active'; tabId?: number }
  | { kind: 'session:list'; domain?: string; limit?: number }
  | { kind: 'session:rename'; sessionId: string; newName: string }
  | { kind: 'session:new'; tabId: number; name?: string; pageUrl: string }
  | { kind: 'session:archive'; sessionId: string }
  | { kind: 'annotation:add'; payload: AnnotationPayload }
  | { kind: 'annotation:cancel'; annotationId: string }
  | { kind: 'annotation:edit-comment'; annotationId: string; comment: string }
  | { kind: 'capture-viewport' }
  | { kind: 'capture-viewport-clean' }
  | { kind: 'capture-element'; rect: RectInfo; dpr: number; padding?: number }
  | { kind: 'audio:transcribe'; audioDataUrl: string; mimeType: string; fileName: string }
  | { kind: 'audio:record-start' }
  | { kind: 'audio:record-stop' }
  | { kind: 'audio:record-cancel' }
  | { kind: 'pins:for-tab'; tabId?: number }
  | { kind: 'toggle-picker'; mode?: 'sticky' | 'oneShot' }
  | { kind: 'picker:state-broadcast'; active: boolean; mode?: 'sticky' | 'oneShot' }
  | { kind: 'settings:save'; settings: Settings };

export type Resp<T extends object = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export type StateResp = Resp<{ state: ExtensionState }>;
export type VaultStatusResp = Resp<{ vault: VaultStatus }>;
export type SessionResp = Resp<{ session: Session }>;
export type SessionMaybeResp = Resp<{ session: Session | null }>;
export type SessionListResp = Resp<{ sessions: SessionListItem[] }>;
export type AnnotationAddResp = Resp<{
  annotationId: string;
  sessionId: string;
  ordinal: number;
  files: { relativePath: string; bytes: number }[];
}>;
export type CaptureResp = Resp<{ dataUrl: string }>;
export type TranscriptionResp = Resp<{ text: string; provider: string; model: string }>;
export type PinsForPageResp = Resp<{ pins: PinForPage[] }>;

export type TabCommand =
  | { kind: 'picker:toggle'; mode?: 'sticky' | 'oneShot' }
  | { kind: 'picker:open'; mode?: 'sticky' | 'oneShot' }
  | { kind: 'picker:close' }
  | { kind: 'picker:query-state' }
  | { kind: 'annotate:context' }
  | { kind: 'pins:update' }
  | { kind: 'picker:needs-session' };

export type BroadcastMessage =
  | { kind: 'picker:state-broadcast'; active: boolean; mode?: 'sticky' | 'oneShot' }
  | { kind: 'picker:needs-session'; tabId?: number }
  | { kind: 'picker:error'; message: string; tabId?: number };

export function sendRequest<T extends object = Record<string, never>>(
  req: RequestMessage,
): Promise<Resp<T>> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(req, (resp: Resp<T>) => {
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
