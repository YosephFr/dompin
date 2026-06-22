/**
 * DOMPin offscreen recorder.
 *
 * Runs at the extension origin (chrome-extension://…) — a secure context we
 * fully control. That's what lets microphone capture work on *any* site: the
 * page's Permissions-Policy (e.g. `microphone=()`) and insecure-context (http)
 * limitations apply to the page's own document, not to ours. The background
 * worker drives this document with `start` / `stop` / `cancel` messages and gets
 * the recorded audio back as a data URL.
 */

type OffscreenCommand = 'start' | 'stop' | 'pause' | 'resume' | 'cancel';

interface OffscreenMessage {
  target: 'dompin-offscreen';
  cmd: OffscreenCommand;
}

type StartResult =
  | { ok: true }
  | { ok: false; kind: 'permission' | 'nomic' | 'other'; error: string };

type StopResult =
  | { ok: true; audioDataUrl: string; mimeType: string; fileName: string }
  | { ok: true; discarded: true }
  | { ok: false; error: string };

let stream: MediaStream | null = null;
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let pendingStop: { respond: (r: StopResult) => void; discard: boolean } | null = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isOffscreenMessage(message)) return false;
  switch (message.cmd) {
    case 'start':
      void startRecording().then((r) => sendResponse(r));
      return true;
    case 'stop':
      finishRecording(false, sendResponse);
      return true;
    case 'pause':
      sendResponse(pauseRecording());
      return false;
    case 'resume':
      sendResponse(resumeRecording());
      return false;
    case 'cancel':
      finishRecording(true, sendResponse);
      return true;
    default:
      return false;
  }
});

function isOffscreenMessage(m: unknown): m is OffscreenMessage {
  return (
    typeof m === 'object' &&
    m !== null &&
    (m as { target?: unknown }).target === 'dompin-offscreen' &&
    typeof (m as { cmd?: unknown }).cmd === 'string'
  );
}

async function startRecording(): Promise<StartResult> {
  teardown();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    return { ok: false, kind: classifyError(e), error: errorMessage(e) };
  }
  const mimeType = preferredMimeType();
  try {
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch (e) {
    teardown();
    return { ok: false, kind: 'other', error: errorMessage(e) };
  }
  chunks = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data.size > 0) chunks.push(ev.data);
  };
  recorder.onstop = handleRecorderStop;
  recorder.start();
  return { ok: true };
}

function finishRecording(discard: boolean, respond: (r: StopResult) => void): void {
  if (!recorder || recorder.state === 'inactive') {
    teardown();
    respond(discard ? { ok: true, discarded: true } : { ok: false, error: 'Not recording.' });
    return;
  }
  pendingStop = { respond, discard };
  recorder.stop();
}

function pauseRecording(): { ok: true } | { ok: false; error: string } {
  if (!recorder || recorder.state !== 'recording') {
    return { ok: false, error: 'Recorder is not recording.' };
  }
  recorder.pause();
  return { ok: true };
}

function resumeRecording(): { ok: true } | { ok: false; error: string } {
  if (!recorder || recorder.state !== 'paused') {
    return { ok: false, error: 'Recorder is not paused.' };
  }
  recorder.resume();
  return { ok: true };
}

function handleRecorderStop(): void {
  const type = recorder?.mimeType || preferredMimeType() || 'audio/webm';
  const pending = pendingStop;
  const collected = chunks;
  pendingStop = null;
  teardown();
  if (!pending) return;
  if (pending.discard) {
    pending.respond({ ok: true, discarded: true });
    return;
  }
  if (!collected.length) {
    pending.respond({ ok: false, error: 'No audio captured.' });
    return;
  }
  const blob = new Blob(collected, { type });
  blobToDataUrl(blob)
    .then((audioDataUrl) =>
      pending.respond({ ok: true, audioDataUrl, mimeType: type, fileName: fileNameFor(type) }),
    )
    .catch((e) => pending.respond({ ok: false, error: errorMessage(e) }));
}

function teardown(): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
  stream = null;
  recorder = null;
  chunks = [];
}

function classifyError(e: unknown): 'permission' | 'nomic' | 'other' {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'permission';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'nomic';
  return 'other';
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message || e.name;
  return String(e);
}

function preferredMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

function fileNameFor(mimeType: string): string {
  if (mimeType.includes('mp4')) return 'dompin-voice.m4a';
  if (mimeType.includes('mpeg')) return 'dompin-voice.mp3';
  if (mimeType.includes('wav')) return 'dompin-voice.wav';
  return 'dompin-voice.webm';
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read audio.'));
    reader.readAsDataURL(blob);
  });
}
