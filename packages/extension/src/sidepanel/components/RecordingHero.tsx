import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import { useT } from '../../common/i18n/index.js';
import { sendRequest } from '../../common/messaging.js';
import type { RecordingFrameMark, Session } from '../../common/types.js';
import { loadRootHandle, requestRootPermission } from '../../common/vault-handle.js';

type RecordingState = 'idle' | 'recording' | 'paused' | 'stopping' | 'saving';
type TranscribeResp = { text: string; provider: string; model: string };
type PendingRecording = {
  startedAt: number;
  stoppedAt: number;
  durationMs: number;
  videoName: string;
  audioName: string;
  audioMimeType: string;
  frameMarks: RecordingFrameMark[];
};
type TranscriptCue = {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
};
type ExtractedFrame = {
  index: number;
  atMs: number;
  image: string;
  mark: RecordingFrameMark;
};

export function RecordingHero({
  session,
  tabId,
  onError,
  onRecordingActiveChange,
}: {
  session: Session;
  tabId: number | null;
  onError: (message: string) => void;
  onRecordingActiveChange?: (active: boolean) => void;
}): JSX.Element {
  const t = useT();
  const [state, setState] = useState<RecordingState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [audioIssue, setAudioIssue] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingRecording | null>(null);
  const [level, setLevel] = useState(0);
  const [frameMarkCount, setFrameMarkCount] = useState(0);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const displayRecorderRef = useRef<MediaRecorder | null>(null);
  const micRecorderRef = useRef<MediaRecorder | null>(null);
  const videoDoneRef = useRef<Promise<Blob> | null>(null);
  const audioDoneRef = useRef<Promise<Blob> | null>(null);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const stateRef = useRef<RecordingState>('idle');

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    void refreshPendingRecording();
    return () => {
      if (stateRef.current === 'recording' || stateRef.current === 'paused') {
        void stop();
        return;
      }
      if (stateRef.current === 'stopping' || stateRef.current === 'saving') return;
      releaseLocalResources();
      void stopFrameCaptureForTab();
      void sendRequest({ kind: 'recording:session-stop', sessionId: session.id });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  useEffect(() => {
    if (state !== 'recording') return undefined;
    const timer = window.setInterval(() => void refreshFrameMarkCount(), 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, session.id]);

  async function start(): Promise<void> {
    if (stateRef.current !== 'idle') return;
    setAudioIssue(null);
    setLastSaved(null);
    setPending(null);
    try {
      if (!navigator.mediaDevices?.getDisplayMedia || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Screen or microphone capture is not available.');
      }
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      let micStream: MediaStream;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        stopTracks(displayStream);
        throw e;
      }

      const video = prepareRecorder(displayStream, preferredVideoMimeType(), 'video/webm');
      const audio = prepareRecorder(micStream, preferredAudioMimeType(), 'audio/webm');
      const startedAt = Date.now();
      displayStreamRef.current = displayStream;
      micStreamRef.current = micStream;
      displayRecorderRef.current = video.recorder;
      micRecorderRef.current = audio.recorder;
      videoDoneRef.current = video.done;
      audioDoneRef.current = audio.done;
      startedAtRef.current = startedAt;
      displayStream.getVideoTracks()[0]?.addEventListener('ended', () => {
        void stop();
      });

      video.recorder.start(1000);
      audio.recorder.start(1000);
      startMeter(micStream);
      await sendRequest({ kind: 'recording:session-start', sessionId: session.id, startedAt });
      await startFrameCaptureForTab(startedAt);
      onRecordingActiveChange?.(true);
      setElapsedMs(0);
      setFrameMarkCount(0);
      setState('recording');
      startTimer(timerRef, startedAt, setElapsedMs);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        onError(e instanceof Error ? e.message : String(e));
      }
      cleanupLocalRecording();
    }
  }

  function pause(): void {
    if (stateRef.current !== 'recording') return;
    pauseRecorder(displayRecorderRef.current);
    pauseRecorder(micRecorderRef.current);
    void sendRequest({ kind: 'recording:session-pause', sessionId: session.id });
    void stopFrameCaptureForTab();
    clearTimer(timerRef);
    setLevel(0);
    setState('paused');
  }

  function resume(): void {
    if (stateRef.current !== 'paused') return;
    resumeRecorder(displayRecorderRef.current);
    resumeRecorder(micRecorderRef.current);
    void sendRequest({ kind: 'recording:session-resume', sessionId: session.id });
    void startFrameCaptureForTab(startedAtRef.current);
    setState('recording');
    startTimer(timerRef, startedAtRef.current, setElapsedMs);
  }

  async function stop(): Promise<void> {
    const currentState = stateRef.current;
    if (currentState === 'idle' || currentState === 'stopping' || currentState === 'saving') return;
    const displayRecorder = displayRecorderRef.current;
    const micRecorder = micRecorderRef.current;
    if (!displayRecorder || !micRecorder) return;

    clearTimer(timerRef);
    setLevel(0);
    setState('stopping');
    const stoppedAt = Date.now();
    const durationMs = Math.max(0, stoppedAt - startedAtRef.current);
    await stopFrameCaptureForTab();
    await sendRequest({ kind: 'recording:session-stop', sessionId: session.id });
    stopRecorder(displayRecorder);
    stopRecorder(micRecorder);
    stopTracks(displayStreamRef.current);
    stopTracks(micStreamRef.current);
    stopMeter();

    const [videoBlob, audioBlob, frameMarks] = await Promise.all([
      videoDoneRef.current,
      audioDoneRef.current,
      loadRecordingFrameMarks(),
    ]);
    if (!videoBlob || !audioBlob) {
      cleanupLocalRecording();
      onError('Recording media was not captured.');
      return;
    }

    setState('saving');
    let recordingDir: FileSystemDirectoryHandle;
    let nextPending: PendingRecording;
    try {
      const media = await writeRecordingMedia(
        session,
        videoBlob,
        audioBlob,
        stoppedAt,
        durationMs,
        frameMarks,
      );
      recordingDir = media.dir;
      nextPending = media.pending;
      setPending(nextPending);
    } catch (e) {
      cleanupLocalRecording();
      onError(e instanceof Error ? e.message : String(e));
      return;
    }
    try {
      await processPendingRecording(recordingDir, nextPending);
      setLastSaved(t.recording.saved);
      setPending(null);
    } catch (e) {
      setAudioIssue(e instanceof Error ? e.message : String(e));
    }
    cleanupLocalRecording();
  }

  async function writeRecordingMedia(
    currentSession: Session,
    videoBlob: Blob,
    audioBlob: Blob,
    stoppedAt: number,
    durationMs: number,
    frameMarks: RecordingFrameMark[],
  ): Promise<{ dir: FileSystemDirectoryHandle; pending: PendingRecording }> {
    const dir = await getRecordingDir(currentSession);
    const videoName = `session.${extensionForMime(videoBlob.type, 'webm')}`;
    const audioName = `narration.${extensionForMime(audioBlob.type, 'webm')}`;
    await writeBlobFile(dir, videoName, videoBlob);
    await writeBlobFile(dir, audioName, audioBlob);
    await writeTextFile(dir, 'transcript.txt', '');
    await writeTextFile(dir, 'transcript.srt', '');
    await writeTextFile(
      dir,
      'recording.json',
      JSON.stringify(
        {
          schemaVersion: 1,
          sessionId: currentSession.id,
          sessionName: currentSession.name,
          startedAt: startedAtRef.current,
          stoppedAt,
          durationMs,
          assets: {
            video: `./${videoName}`,
            audio: `./${audioName}`,
            transcript: './transcript.txt',
            subtitles: './transcript.srt',
          },
          transcription: {
            provider: null,
            model: null,
            timing: 'estimated-from-recording-duration',
          },
          frames: frameMarks.map((mark, index) => ({
            index: index + 1,
            source: mark.source,
            atMs: mark.elapsedMs,
            timestamp: mark.timestamp,
            page: mark.page,
            target: mark.target,
          })),
        },
        null,
        2,
      ),
    );
    const pendingRecording = {
      startedAt: startedAtRef.current,
      stoppedAt,
      durationMs,
      videoName,
      audioName,
      audioMimeType: audioBlob.type || 'audio/webm',
      frameMarks,
    };
    await writeTextFile(dir, 'pending.json', JSON.stringify(pendingRecording, null, 2));
    return { dir, pending: pendingRecording };
  }

  async function retryPending(): Promise<void> {
    if (!pending || stateRef.current !== 'idle') return;
    setState('saving');
    setAudioIssue(null);
    try {
      const dir = await getRecordingDir(session);
      await processPendingRecording(dir, pending);
      setPending(null);
      setLastSaved(t.recording.saved);
    } catch (e) {
      setAudioIssue(e instanceof Error ? e.message : String(e));
    } finally {
      setState('idle');
    }
  }

  async function processPendingRecording(
    dir: FileSystemDirectoryHandle,
    item: PendingRecording,
  ): Promise<void> {
    const audioHandle = await dir.getFileHandle(item.audioName);
    const audioFile = await audioHandle.getFile();
    const audioDataUrl = await blobToDataUrl(audioFile);
    const transcript = await transcribeAudio(audioDataUrl, item.audioMimeType || audioFile.type);
    await writeRecordingText(dir, {
      session,
      startedAt: item.startedAt,
      stoppedAt: item.stoppedAt,
      durationMs: item.durationMs,
      videoName: item.videoName,
      audioName: item.audioName,
      transcript: transcript.text,
      provider: transcript.provider,
      model: transcript.model,
      frameMarks: item.frameMarks,
    });
    const finalize = await sendRequest({ kind: 'recording:finalize', sessionId: session.id });
    if (!finalize.ok) throw new Error(finalize.error);
    await removeFile(dir, 'pending.json');
  }

  async function refreshPendingRecording(): Promise<void> {
    try {
      const dir = await getExistingRecordingDir(session);
      if (!dir) {
        setPending(null);
        return;
      }
      const file = await dir.getFileHandle('pending.json');
      const text = await (await file.getFile()).text();
      setPending(parsePendingRecording(text));
    } catch {
      setPending(null);
    }
  }

  async function writeRecordingText(
    dir: FileSystemDirectoryHandle,
    input: {
      session: Session;
      startedAt: number;
      stoppedAt: number;
      durationMs: number;
      videoName: string;
      audioName: string;
      transcript: string;
      provider: string;
      model: string;
      frameMarks: RecordingFrameMark[];
    },
  ): Promise<void> {
    const cues = buildTranscriptCues(input.transcript, input.durationMs);
    const srt = renderEstimatedSrt(cues);
    const frames = await extractMarkedFrames(dir, input.videoName, input.frameMarks);
    await writeTextFile(dir, 'transcript.txt', input.transcript);
    await writeTextFile(dir, 'transcript.srt', srt);
    await writeTextFile(
      dir,
      'recording.json',
      JSON.stringify(
        {
          schemaVersion: 1,
          sessionId: input.session.id,
          sessionName: input.session.name,
          startedAt: input.startedAt,
          stoppedAt: input.stoppedAt,
          durationMs: input.durationMs,
          assets: {
            video: `./${input.videoName}`,
            audio: `./${input.audioName}`,
            transcript: './transcript.txt',
            subtitles: './transcript.srt',
          },
          transcription: {
            provider: input.provider || null,
            model: input.model || null,
            timing: 'estimated-from-recording-duration',
          },
          frames: frames.map((frame) => ({
            index: frame.index,
            atMs: frame.atMs,
            source: frame.mark.source,
            timestamp: frame.mark.timestamp,
            page: frame.mark.page,
            target: frame.mark.target,
            image: `./frames/${frame.image}`,
          })),
        },
        null,
        2,
      ),
    );
    await writeTextFile(
      dir,
      'README.md',
      renderRecordingReadme({
        session: input.session,
        startedAt: input.startedAt,
        stoppedAt: input.stoppedAt,
        durationMs: input.durationMs,
        videoName: input.videoName,
        audioName: input.audioName,
        transcript: input.transcript,
        provider: input.provider,
        model: input.model,
        frames,
      }),
    );
  }

  async function transcribeAudio(audioDataUrl: string, mimeType: string): Promise<TranscribeResp> {
    const resp = await sendRequest<TranscribeResp>({
      kind: 'audio:transcribe',
      audioDataUrl,
      mimeType,
      fileName: fileNameForAudio(mimeType),
    });
    if (resp.ok) return { text: resp.text, provider: resp.provider, model: resp.model };
    throw new Error(resp.error);
  }

  function cleanupLocalRecording(): void {
    releaseLocalResources();
    void stopFrameCaptureForTab();
    onRecordingActiveChange?.(false);
    setElapsedMs(0);
    setLevel(0);
    setFrameMarkCount(0);
    setState('idle');
  }

  function releaseLocalResources(): void {
    clearTimer(timerRef);
    stopTracks(displayStreamRef.current);
    stopTracks(micStreamRef.current);
    stopMeter();
    displayStreamRef.current = null;
    micStreamRef.current = null;
    displayRecorderRef.current = null;
    micRecorderRef.current = null;
    videoDoneRef.current = null;
    audioDoneRef.current = null;
    startedAtRef.current = 0;
  }

  function startMeter(stream: MediaStream): void {
    stopMeter();
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    context.createMediaStreamSource(stream).connect(analyser);
    audioContextRef.current = context;
    const data = new Uint8Array(analyser.fftSize);
    const tick = () => {
      if (stateRef.current === 'recording') {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const sample of data) {
          const v = (sample - 128) / 128;
          sum += v * v;
        }
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 5));
      } else {
        setLevel(0);
      }
      meterFrameRef.current = window.requestAnimationFrame(tick);
    };
    meterFrameRef.current = window.requestAnimationFrame(tick);
  }

  function stopMeter(): void {
    if (meterFrameRef.current != null) window.cancelAnimationFrame(meterFrameRef.current);
    meterFrameRef.current = null;
    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
  }

  async function startFrameCaptureForTab(startedAt: number): Promise<void> {
    if (tabId == null) return;
    try {
      await chrome.tabs.sendMessage(tabId, {
        kind: 'recording:frame-capture-start',
        startedAt,
        sessionId: session.id,
      });
    } catch {}
  }

  async function stopFrameCaptureForTab(): Promise<void> {
    if (tabId == null) return;
    try {
      await chrome.tabs.sendMessage(tabId, { kind: 'recording:frame-capture-stop' });
    } catch {}
  }

  async function loadRecordingFrameMarks(): Promise<RecordingFrameMark[]> {
    const resp = await sendRequest<{ marks: RecordingFrameMark[] }>({
      kind: 'recording:frame-marks',
      sessionId: session.id,
    });
    return resp.ok && Array.isArray(resp.marks) ? resp.marks : [];
  }

  async function refreshFrameMarkCount(): Promise<void> {
    setFrameMarkCount((await loadRecordingFrameMarks()).length);
  }

  const isBusy = state === 'stopping' || state === 'saving';
  const label =
    state === 'recording'
      ? t.recording.recording
      : state === 'paused'
        ? t.recording.paused
        : isBusy
          ? t.recording.saving
          : t.recording.idle;
  const bars = meterBars(level);

  return (
    <section className={`hero hero-recording is-${state}`}>
      <div className="hero-row">
        <span className="recording-status">
          <span className="recording-dot" aria-hidden="true" />
          <span className="hero-label">{label}</span>
        </span>
        <span className="recording-time">{formatElapsed(elapsedMs)}</span>
      </div>
      <div
        className={`recording-meter ${state === 'recording' ? 'is-live' : ''}`}
        aria-hidden="true"
      >
        {bars.map((height, index) => (
          <span key={index} style={{ '--bar-height': `${height}px` } as CSSProperties} />
        ))}
      </div>
      <div className="recording-controls">
        {state === 'idle' ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void start()}
            disabled={Boolean(pending)}
          >
            {t.recording.start}
          </button>
        ) : (
          <>
            {state === 'recording' ? (
              <button type="button" className="btn btn-secondary" onClick={pause}>
                {t.recording.pause}
              </button>
            ) : null}
            {state === 'paused' ? (
              <button type="button" className="btn btn-secondary" onClick={resume}>
                {t.recording.resume}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-danger-solid"
              onClick={() => void stop()}
              disabled={isBusy}
            >
              {isBusy ? t.recording.saving : t.recording.stop}
            </button>
          </>
        )}
      </div>
      {pending && state === 'idle' ? (
        <div className="recording-recovery">
          <span>{t.recording.pending}</span>
          <button type="button" className="btn btn-secondary" onClick={() => void retryPending()}>
            {t.recording.retry}
          </button>
        </div>
      ) : null}
      <p className="hero-hint">
        {audioIssue
          ? t.recording.audioIssue(audioIssue)
          : frameMarkCount > 0
            ? t.recording.frameMarks(frameMarkCount)
            : t.recording.hint}
      </p>
      {lastSaved ? <p className="recording-saved">{lastSaved}</p> : null}
    </section>
  );
}

function prepareRecorder(
  stream: MediaStream,
  mimeType: string,
  fallbackType: string,
): { recorder: MediaRecorder; done: Promise<Blob> } {
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      const type = recorder.mimeType || mimeType || fallbackType;
      resolve(new Blob(chunks, { type }));
    };
  });
  return { recorder, done };
}

function pauseRecorder(recorder: MediaRecorder | null): void {
  if (recorder?.state === 'recording') recorder.pause();
}

function resumeRecorder(recorder: MediaRecorder | null): void {
  if (recorder?.state === 'paused') recorder.resume();
}

function stopRecorder(recorder: MediaRecorder): void {
  if (recorder.state !== 'inactive') recorder.stop();
}

function preferredVideoMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const type of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

function preferredAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read recording.'));
    reader.readAsDataURL(blob);
  });
}

function startTimer(
  ref: MutableRefObject<number | null>,
  startedAt: number,
  setElapsedMs: (value: number) => void,
): void {
  clearTimer(ref);
  ref.current = window.setInterval(() => {
    setElapsedMs(Math.max(0, Date.now() - startedAt));
  }, 500);
}

function clearTimer(ref: MutableRefObject<number | null>): void {
  if (ref.current != null) window.clearInterval(ref.current);
  ref.current = null;
}

function stopTracks(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function meterBars(level: number): number[] {
  const base = Math.max(0.08, level);
  return [8 + base * 12, 10 + base * 20, 8 + base * 16, 7 + base * 10].map((v) => Math.round(v));
}

function fileNameForAudio(mimeType: string): string {
  if (mimeType.includes('mp4')) return 'dompin-session.m4a';
  if (mimeType.includes('mpeg')) return 'dompin-session.mp3';
  if (mimeType.includes('wav')) return 'dompin-session.wav';
  return 'dompin-session.webm';
}

async function getRecordingDir(session: Session): Promise<FileSystemDirectoryHandle> {
  const root = await getWritableVaultRoot();
  const domain = await root.getDirectoryHandle(session.domainFolder);
  const sessionDir = await domain.getDirectoryHandle(session.folder);
  return sessionDir.getDirectoryHandle('recording', { create: true });
}

async function getExistingRecordingDir(
  session: Session,
): Promise<FileSystemDirectoryHandle | null> {
  const root = await loadRootHandle();
  if (!root) return null;
  const permission = await root.queryPermission({ mode: 'readwrite' });
  if (permission !== 'granted') return null;
  try {
    const domain = await root.getDirectoryHandle(session.domainFolder);
    const sessionDir = await domain.getDirectoryHandle(session.folder);
    return await sessionDir.getDirectoryHandle('recording');
  } catch {
    return null;
  }
}

async function getWritableVaultRoot(): Promise<FileSystemDirectoryHandle> {
  const root = await loadRootHandle();
  if (!root) throw new Error('Vault is not configured.');
  let permission = await root.queryPermission({ mode: 'readwrite' });
  if (permission !== 'granted') {
    permission = await requestRootPermission();
  }
  if (permission !== 'granted') throw new Error('Vault permission is not granted.');
  return root;
}

async function writeBlobFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  blob: Blob,
): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(blob);
  } finally {
    await writable.close();
  }
}

async function writeTextFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  text: string,
): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(text);
  } finally {
    await writable.close();
  }
}

async function removeFile(dir: FileSystemDirectoryHandle, name: string): Promise<void> {
  try {
    await dir.removeEntry(name);
  } catch {}
}

function parsePendingRecording(text: string): PendingRecording {
  const raw = JSON.parse(text) as Partial<PendingRecording>;
  const pending = {
    startedAt: Number(raw.startedAt),
    stoppedAt: Number(raw.stoppedAt),
    durationMs: Number(raw.durationMs),
    videoName: String(raw.videoName ?? ''),
    audioName: String(raw.audioName ?? ''),
    audioMimeType: String(raw.audioMimeType ?? 'audio/webm'),
    frameMarks: sanitizeFrameMarks(raw.frameMarks),
  };
  if (
    !Number.isFinite(pending.startedAt) ||
    !Number.isFinite(pending.stoppedAt) ||
    !Number.isFinite(pending.durationMs) ||
    !pending.videoName ||
    !pending.audioName
  ) {
    throw new Error('Pending recording is invalid.');
  }
  return pending;
}

function sanitizeFrameMarks(value: unknown): RecordingFrameMark[] {
  if (!Array.isArray(value)) return [];
  const marks: RecordingFrameMark[] = [];
  for (const mark of value) {
    if (!mark || typeof mark !== 'object') continue;
    const m = mark as Partial<RecordingFrameMark>;
    if (
      typeof m.id === 'string' &&
      typeof m.sessionId === 'string' &&
      Number.isFinite(Number(m.timestamp)) &&
      Number.isFinite(Number(m.startedAt)) &&
      Number.isFinite(Number(m.elapsedMs))
    ) {
      const source = m.source === 'global-command' ? 'global-command' : 'page-click';
      marks.push({
        id: m.id,
        sessionId: m.sessionId,
        source,
        timestamp: Number(m.timestamp),
        startedAt: Number(m.startedAt),
        elapsedMs: Number(m.elapsedMs),
        page: m.page ?? null,
        pointer: m.pointer ?? null,
        target: m.target ?? null,
      });
    }
  }
  return marks;
}

function renderRecordingReadme(input: {
  session: Session;
  startedAt: number;
  stoppedAt: number;
  durationMs: number;
  videoName: string;
  audioName: string;
  transcript: string;
  provider: string;
  model: string;
  frames: ExtractedFrame[];
}): string {
  const lines: string[] = [];
  lines.push(`# Recorded session - ${input.session.name}`);
  lines.push('');
  lines.push(`- Started: ${new Date(input.startedAt).toISOString()}`);
  lines.push(`- Stopped: ${new Date(input.stoppedAt).toISOString()}`);
  lines.push(`- Duration: ${formatDuration(input.durationMs)}`);
  lines.push(`- Video: [${input.videoName}](./${input.videoName})`);
  lines.push(`- Narration: [${input.audioName}](./${input.audioName})`);
  lines.push('- Transcript: [transcript.txt](./transcript.txt)');
  lines.push('- Subtitles: [transcript.srt](./transcript.srt)');
  if (input.provider && input.model)
    lines.push(`- Transcription: ${input.provider} / ${input.model}`);
  lines.push(`- Manual frame marks: ${input.frames.length}`);
  if (input.frames.length) {
    lines.push('');
    lines.push('## Manual frame marks');
    lines.push('');
    for (const frame of input.frames) {
      lines.push(
        `- ${formatSrtTime(frame.atMs)} (${Math.round(frame.atMs / 1000)}s) · [frame](./frames/${frame.image})`,
      );
      lines.push(`  Source: ${sourceLabel(frame.mark)}`);
      if (frame.mark.page) {
        lines.push(`  Page: ${frame.mark.page.title || '(untitled)'} · ${frame.mark.page.url}`);
      } else {
        lines.push('  Page: outside browser context');
      }
      lines.push(`  Target: ${targetLabel(frame.mark)}`);
    }
  }
  lines.push('');
  lines.push('## Transcript');
  lines.push('');
  lines.push(input.transcript || '_(no transcript)_');
  lines.push('');
  return lines.join('\n');
}

function buildTranscriptCues(transcript: string, durationMs: number): TranscriptCue[] {
  const text = transcript.replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const parts = splitTranscript(text);
  const duration = Math.max(durationMs, parts.length * 1200);
  return parts.map((part, idx) => {
    const start = Math.round((duration / parts.length) * idx);
    const end = Math.round((duration / parts.length) * (idx + 1));
    return {
      index: idx + 1,
      startMs: start,
      endMs: Math.max(start + 800, end),
      text: part,
    };
  });
}

function renderEstimatedSrt(cues: TranscriptCue[]): string {
  return cues
    .map((cue) => {
      return `${cue.index}\n${formatSrtTime(cue.startMs)} --> ${formatSrtTime(cue.endMs)}\n${cue.text}\n`;
    })
    .join('\n');
}

async function extractMarkedFrames(
  dir: FileSystemDirectoryHandle,
  videoName: string,
  frameMarks: RecordingFrameMark[],
): Promise<ExtractedFrame[]> {
  const marks = dedupeFrameMarks(frameMarks);
  const framesDir = await dir.getDirectoryHandle('frames', { create: true });
  await clearDirectory(framesDir);
  if (!marks.length) {
    await writeTextFile(framesDir, 'frames.json', '[]');
    return [];
  }

  const videoHandle = await dir.getFileHandle(videoName);
  const videoFile = await videoHandle.getFile();
  const video = await loadVideo(videoFile);
  const frames: ExtractedFrame[] = [];

  try {
    for (const [index, mark] of marks.entries()) {
      const atMs = clampMs(mark.elapsedMs, videoDurationMs(video));
      const image = `frame-${String(index + 1).padStart(2, '0')}-${String(
        Math.round(atMs / 1000),
      ).padStart(4, '0')}s.png`;
      await seekVideo(video, atMs);
      await writeBlobFile(framesDir, image, await captureVideoFrame(video));
      frames.push({
        index: index + 1,
        atMs,
        image,
        mark,
      });
    }
  } finally {
    video.pause();
    URL.revokeObjectURL(video.src);
    video.removeAttribute('src');
    video.load();
  }

  await writeTextFile(framesDir, 'frames.json', JSON.stringify(frames, null, 2));
  return frames;
}

function dedupeFrameMarks(marks: RecordingFrameMark[]): RecordingFrameMark[] {
  const out: RecordingFrameMark[] = [];
  for (const mark of [...marks].sort((a, b) => a.elapsedMs - b.elapsedMs)) {
    const previous = out[out.length - 1];
    if (
      previous &&
      Math.abs(previous.elapsedMs - mark.elapsedMs) < 250 &&
      previous.source === mark.source &&
      previous.page?.url === mark.page?.url &&
      previous.target?.selector === mark.target?.selector
    ) {
      continue;
    }
    out.push(mark);
  }
  return out;
}

function targetLabel(mark: RecordingFrameMark): string {
  const target = mark.target;
  if (!target) return '(no element target)';
  const bits = [
    target.selector,
    target.textPreview ? `"${target.textPreview}"` : null,
    target.role ? `role=${target.role}` : null,
    target.ariaLabel ? `aria=${target.ariaLabel}` : null,
  ].filter(Boolean);
  return bits.join(' · ') || target.tag;
}

function sourceLabel(mark: RecordingFrameMark): string {
  return mark.source === 'global-command' ? 'global shortcut' : 'page click';
}

async function loadVideo(file: File): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = URL.createObjectURL(file);
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Could not load recorded video.'));
    }, 8000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener('loadedmetadata', onLoad);
      video.removeEventListener('error', onError);
    };
    const onLoad = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Recorded video could not be decoded.'));
    };
    video.addEventListener('loadedmetadata', onLoad);
    video.addEventListener('error', onError);
  });
  return video;
}

async function captureVideoFrame(video: HTMLVideoElement): Promise<Blob> {
  const { canvas, context } = createVideoCanvas(video);
  drawVideoFrame(video, context, canvas);
  return canvasToBlob(canvas, 'image/png');
}

function createVideoCanvas(video: HTMLVideoElement): {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
} {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, video.videoWidth || 1280);
  canvas.height = Math.max(1, video.videoHeight || 720);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare frame canvas.');
  return { canvas, context };
}

function drawVideoFrame(
  video: HTMLVideoElement,
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
): void {
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not encode frame.'));
    }, type);
  });
}

function seekVideo(video: HTMLVideoElement, atMs: number): Promise<void> {
  const duration = videoDurationMs(video);
  const target = clampMs(atMs, duration) / 1000;
  if (Math.abs(video.currentTime - target) < 0.02) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Could not seek recorded video.'));
    }, 5000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Recorded video seek failed.'));
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = target;
  });
}

function videoDurationMs(video: HTMLVideoElement): number {
  const duration = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0;
  return Math.max(1000, duration);
}

function clampMs(value: number, durationMs: number): number {
  return Math.min(Math.max(0, Math.round(value)), Math.max(0, durationMs - 50));
}

async function clearDirectory(dir: FileSystemDirectoryHandle): Promise<void> {
  const iterable = dir as FileSystemDirectoryHandle & {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  };
  for await (const [name] of iterable.entries()) {
    await dir.removeEntry(name, { recursive: true });
  }
}

function splitTranscript(text: string): string[] {
  const raw = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text];
  const out: string[] = [];
  let current = '';
  for (const part of raw.map((p) => p.trim()).filter(Boolean)) {
    if (!current) {
      current = part;
      continue;
    }
    if ((current + ' ' + part).length <= 140) {
      current += ' ' + part;
    } else {
      out.push(current);
      current = part;
    }
  }
  if (current) out.push(current);
  return out.length ? out : [text];
}

function formatSrtTime(ms: number): string {
  const total = Math.max(0, ms);
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)},${String(millis).padStart(3, '0')}`;
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

function extensionForMime(mimeType: string, fallback: string): string {
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('webm')) return 'webm';
  return fallback;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
