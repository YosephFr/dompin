import { createLogger } from '../common/logger.js';

/**
 * Microphone capture orchestration.
 *
 * Recording happens in an offscreen document at the extension origin so it works
 * on any site (see `src/offscreen/offscreen.ts`). The offscreen document can't
 * prompt for permission, so the first time the user records — or any time access
 * is blocked — we open a small window that surfaces Chrome's microphone prompt,
 * then retry. Audio never touches the page: offscreen → background → provider.
 */

const log = createLogger('audio-recorder');

const OFFSCREEN_PATH = 'src/offscreen/offscreen.html';
const MIC_PERMISSION_PATH = 'src/offscreen/mic.html';

export type RecordStartResult = { ok: true } | { ok: false; error: string };
export type RecordStopResult =
  | { ok: true; audioDataUrl: string; mimeType: string; fileName: string }
  | { ok: true; discarded: true }
  | { ok: false; error: string };

interface OffscreenStartResponse {
  ok: boolean;
  kind?: 'permission' | 'nomic' | 'other';
  error?: string;
}

let creating: Promise<void> | null = null;

export async function startRecording(): Promise<RecordStartResult> {
  try {
    await ensureOffscreen();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'OFFSCREEN_UNAVAILABLE' };
  }

  let res = await sendToOffscreen<OffscreenStartResponse>('start');
  if (res === undefined) {
    // The offscreen document may not have registered its listener yet right
    // after creation; give it a beat and try once more.
    await delay(200);
    res = await sendToOffscreen<OffscreenStartResponse>('start');
  }
  if (res?.ok) return { ok: true };

  if (res?.kind === 'permission') {
    const granted = await requestMicPermission();
    if (!granted) return { ok: false, error: 'MIC_PERMISSION_DENIED' };
    await ensureOffscreen();
    res = await sendToOffscreen<OffscreenStartResponse>('start');
    if (res?.ok) return { ok: true };
    if (res?.kind === 'permission') return { ok: false, error: 'MIC_PERMISSION_DENIED' };
  }

  if (res?.kind === 'nomic') return { ok: false, error: 'MIC_NOT_FOUND' };
  return { ok: false, error: res?.error || 'Could not start recording.' };
}

export async function stopRecording(): Promise<RecordStopResult> {
  const res = await sendToOffscreen<RecordStopResult>('stop');
  return res ?? { ok: false, error: 'Recorder is not available.' };
}

export async function cancelRecording(): Promise<void> {
  await sendToOffscreen('cancel');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendToOffscreen<T>(cmd: 'start' | 'stop' | 'cancel'): Promise<T | undefined> {
  return chrome.runtime
    .sendMessage({ target: 'dompin-offscreen', cmd })
    .then((r) => r as T)
    .catch((e: unknown) => {
      log.debug('offscreen message failed', cmd, e);
      return undefined;
    });
}

async function ensureOffscreen(): Promise<void> {
  if (!chrome.offscreen) throw new Error('OFFSCREEN_UNAVAILABLE');
  if (await hasOffscreenDocument()) return;
  if (!creating) {
    creating = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_PATH,
        reasons: [chrome.offscreen.Reason.USER_MEDIA],
        justification: 'Record microphone audio for voice-to-text transcription.',
      })
      .catch((e: unknown) => {
        // A concurrent caller may have created it first; that's fine.
        const msg = e instanceof Error ? e.message : String(e);
        if (!/single offscreen/i.test(msg)) throw e;
      })
      .finally(() => {
        creating = null;
      });
  }
  await creating;
}

async function hasOffscreenDocument(): Promise<boolean> {
  const runtime = chrome.runtime as typeof chrome.runtime & {
    getContexts?: (filter: { contextTypes: string[] }) => Promise<unknown[]>;
  };
  if (typeof runtime.getContexts !== 'function') return false;
  try {
    const contexts = await runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    return contexts.length > 0;
  } catch {
    return false;
  }
}

/**
 * Open the permission window and resolve true once the user grants access, or
 * false if they close the window without granting. The window stays open on
 * failure so the user can retry; closing it is how they decline.
 */
function requestMicPermission(): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let windowId: number | null = null;

    const finish = (granted: boolean): void => {
      if (settled) return;
      settled = true;
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.windows.onRemoved.removeListener(onRemoved);
      if (granted && windowId != null) {
        void chrome.windows.remove(windowId).catch(() => undefined);
      }
      resolve(granted);
    };

    const onMessage = (msg: unknown): void => {
      if (
        typeof msg === 'object' &&
        msg !== null &&
        (msg as { target?: unknown }).target === 'dompin-mic' &&
        (msg as { ok?: unknown }).ok === true
      ) {
        finish(true);
      }
    };
    const onRemoved = (id: number): void => {
      if (id === windowId) finish(false);
    };

    chrome.runtime.onMessage.addListener(onMessage);
    chrome.windows.onRemoved.addListener(onRemoved);

    chrome.windows
      .create({
        url: chrome.runtime.getURL(MIC_PERMISSION_PATH),
        type: 'popup',
        focused: true,
        width: 480,
        height: 360,
      })
      .then((win) => {
        windowId = win?.id ?? null;
        if (windowId == null) finish(false);
      })
      .catch(() => finish(false));
  });
}
