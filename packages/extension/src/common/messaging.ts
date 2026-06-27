import type {
  AnnotationAttachment,
  DebugCaptureStatus,
  DebugContentEvent,
  RecordingSessionStatus,
  RecordingFrameMark,
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
  | {
      kind: 'session:resume';
      tabId: number;
      sessionId: string;
      pageUrl: string;
      pageTitle?: string | null;
    }
  | { kind: 'session:archive'; sessionId: string; tabId?: number }
  | { kind: 'annotation:add'; payload: AnnotationPayload }
  | { kind: 'annotation:cancel'; annotationId: string }
  | { kind: 'annotation:edit-comment'; annotationId: string; comment: string }
  | {
      kind: 'annotation:update';
      annotationId: string;
      comment: string;
      voiceTranscript?: string | null;
      attachments?: AnnotationAttachment[];
    }
  | { kind: 'capture-viewport' }
  | { kind: 'capture-viewport-clean' }
  | { kind: 'capture-element'; rect: RectInfo; dpr: number; padding?: number }
  | { kind: 'audio:transcribe'; audioDataUrl: string; mimeType: string; fileName: string }
  | { kind: 'audio:record-start' }
  | { kind: 'audio:record-stop' }
  | { kind: 'audio:record-stop-raw' }
  | { kind: 'audio:record-pause' }
  | { kind: 'audio:record-resume' }
  | { kind: 'audio:record-cancel' }
  | { kind: 'recording:session-start'; sessionId: string; startedAt: number }
  | { kind: 'recording:session-pause'; sessionId: string }
  | { kind: 'recording:session-resume'; sessionId: string }
  | { kind: 'recording:session-stop'; sessionId: string }
  | { kind: 'recording:status' }
  | { kind: 'recording:frame-mark'; mark: RecordingFrameMark }
  | { kind: 'recording:frame-marks'; sessionId: string }
  | { kind: 'recording:finalize'; sessionId: string }
  | { kind: 'debug:start'; tabId: number; sessionId: string }
  | { kind: 'debug:stop'; tabId: number; sessionId: string }
  | { kind: 'debug:status'; tabId?: number }
  | { kind: 'debug:event'; event: DebugContentEvent }
  | { kind: 'git:status' }
  | { kind: 'pins:for-tab'; tabId?: number }
  | { kind: 'pin:focus'; tabId: number; annotationId: string }
  | { kind: 'pin:edit'; tabId: number; annotationId: string }
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
export interface TranscriptResult {
  text: string;
  provider: string;
  model: string;
}

export interface RecordedAudioResult extends Partial<TranscriptResult> {
  audioDataUrl?: string;
  mimeType?: string;
  fileName?: string;
  discarded?: boolean;
  transcriptionError?: string;
}

export type TranscriptionResp = Resp<TranscriptResult | RecordedAudioResult>;
export type PinsForPageResp = Resp<{ pins: PinForPage[] }>;
export type RecordingSaveResp = Resp<{ files: { relativePath: string; bytes: number }[] }>;
export type RecordingStatusResp = Resp<{ status: RecordingSessionStatus }>;
export type RecordingFrameMarksResp = Resp<{ marks: RecordingFrameMark[] }>;
export type GitStatusResp = Resp<{ available: boolean; message: string }>;
export type DebugStatusResp = Resp<{ status: DebugCaptureStatus }>;

export type TabCommand =
  | { kind: 'picker:toggle'; mode?: 'sticky' | 'oneShot' }
  | { kind: 'picker:open'; mode?: 'sticky' | 'oneShot' }
  | { kind: 'picker:close' }
  | { kind: 'picker:query-state' }
  | { kind: 'annotate:context' }
  | { kind: 'pin:focus'; annotationId: string }
  | { kind: 'pin:edit'; annotationId: string }
  | { kind: 'pins:set-visible'; visible: boolean }
  | { kind: 'pins:update' }
  | { kind: 'debug:capture-start'; startedAt: number }
  | { kind: 'debug:capture-stop' }
  | { kind: 'recording:frame-capture-start'; startedAt: number; sessionId: string }
  | { kind: 'recording:frame-capture-stop' }
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
