import type {
  AnnotationRecordingContext,
  RecordingFrameMark,
  RecordingSessionStatus,
  Session,
} from '../common/types.js';

interface SessionRecordingState {
  sessionName: string;
  startedAt: number;
  active: boolean;
  paused: boolean;
  pauseStartedAt: number | null;
  pausedMs: number;
  marks: RecordingFrameMark[];
}

const sessions = new Map<string, SessionRecordingState>();

export function startSessionRecording(
  session: Session,
  startedAt: number,
):
  | { ok: true; status: RecordingSessionStatus }
  | { ok: false; error: string; status: RecordingSessionStatus } {
  const current = currentRecordingSession();
  if (current) {
    const status = statusFor(current.sessionId, current.state);
    return {
      ok: false,
      error: `Screen recording is already running for ${current.state.sessionName}.`,
      status,
    };
  }
  sessions.set(session.id, {
    sessionName: session.name,
    startedAt,
    active: true,
    paused: false,
    pauseStartedAt: null,
    pausedMs: 0,
    marks: [],
  });
  return { ok: true, status: getRecordingStatus() };
}

export function stopSessionRecording(sessionId: string): void {
  const state = sessions.get(sessionId);
  if (state) state.active = false;
}

export function pauseSessionRecording(sessionId: string): void {
  const state = sessions.get(sessionId);
  if (!state?.active || state.paused) return;
  state.paused = true;
  state.pauseStartedAt = Date.now();
}

export function resumeSessionRecording(sessionId: string): void {
  const state = sessions.get(sessionId);
  if (!state?.active || !state.paused || state.pauseStartedAt == null) return;
  state.pausedMs += Math.max(0, Date.now() - state.pauseStartedAt);
  state.paused = false;
  state.pauseStartedAt = null;
}

export function clearSessionRecording(sessionId: string): void {
  sessions.delete(sessionId);
}

export function addRecordingFrameMark(mark: RecordingFrameMark): RecordingFrameMark[] {
  const state = sessions.get(mark.sessionId);
  if (!state || !state.active || state.paused) return [];
  const previous = state.marks[state.marks.length - 1];
  if (
    previous &&
    Math.abs(previous.elapsedMs - mark.elapsedMs) < 250 &&
    previous.source === mark.source &&
    previous.page?.url === mark.page?.url &&
    previous.target?.selector === mark.target?.selector
  ) {
    return [...state.marks];
  }
  state.marks.push(mark);
  return [...state.marks];
}

export function addGlobalRecordingFrameMark(): RecordingFrameMark | null {
  const session = currentRecordingSession(false);
  if (!session) return null;
  const timestamp = Date.now();
  const mark: RecordingFrameMark = {
    id: randomId(),
    sessionId: session.sessionId,
    source: 'global-command',
    timestamp,
    startedAt: session.state.startedAt,
    elapsedMs: elapsedMsFor(session.state, timestamp),
    page: null,
    pointer: null,
    target: null,
  };
  addRecordingFrameMark(mark);
  return mark;
}

export function getRecordingStatus(): RecordingSessionStatus {
  const current = currentRecordingSession();
  return current ? statusFor(current.sessionId, current.state) : inactiveStatus();
}

export function recordingFrameMarks(sessionId: string): RecordingFrameMark[] {
  return [...(sessions.get(sessionId)?.marks ?? [])];
}

export function annotationRecordingContext(sessionId: string): AnnotationRecordingContext | null {
  const state = sessions.get(sessionId);
  if (!state?.active || state.paused) return null;
  const capturedAt = Date.now();
  return {
    startedAt: state.startedAt,
    capturedAt,
    elapsedMs: elapsedMsFor(state, capturedAt),
  };
}

function currentRecordingSession(
  includePaused = true,
): { sessionId: string; state: SessionRecordingState } | null {
  let current: { sessionId: string; state: SessionRecordingState } | null = null;
  for (const [sessionId, state] of sessions) {
    if (!state.active) continue;
    if (!includePaused && state.paused) continue;
    if (!current || state.startedAt > current.state.startedAt) {
      current = { sessionId, state };
    }
  }
  return current;
}

function statusFor(sessionId: string, state: SessionRecordingState): RecordingSessionStatus {
  const now = Date.now();
  return {
    active: state.active,
    sessionId,
    sessionName: state.sessionName,
    startedAt: state.startedAt,
    elapsedMs: elapsedMsFor(state, now),
    paused: state.paused,
    markCount: state.marks.length,
  };
}

function inactiveStatus(): RecordingSessionStatus {
  return {
    active: false,
    sessionId: null,
    sessionName: null,
    startedAt: null,
    elapsedMs: 0,
    paused: false,
    markCount: 0,
  };
}

function elapsedMsFor(state: SessionRecordingState, timestamp: number): number {
  const activePauseMs =
    state.paused && state.pauseStartedAt != null
      ? Math.max(0, timestamp - state.pauseStartedAt)
      : 0;
  return Math.max(0, timestamp - state.startedAt - state.pausedMs - activePauseMs);
}

function randomId(): string {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `mark-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
