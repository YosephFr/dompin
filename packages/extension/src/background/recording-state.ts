import type { AnnotationRecordingContext, RecordingFrameMark } from '../common/types.js';

interface SessionRecordingState {
  startedAt: number;
  active: boolean;
  paused: boolean;
  pauseStartedAt: number | null;
  pausedMs: number;
  marks: RecordingFrameMark[];
}

const sessions = new Map<string, SessionRecordingState>();

export function startSessionRecording(sessionId: string, startedAt: number): void {
  sessions.set(sessionId, {
    startedAt,
    active: true,
    paused: false,
    pauseStartedAt: null,
    pausedMs: 0,
    marks: [],
  });
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
  const session = activeRecordingSession();
  if (!session) return null;
  const timestamp = Date.now();
  const mark: RecordingFrameMark = {
    id: randomId(),
    sessionId: session.sessionId,
    source: 'global-command',
    timestamp,
    startedAt: session.startedAt,
    elapsedMs: elapsedMsFor(session, timestamp),
    page: null,
    pointer: null,
    target: null,
  };
  addRecordingFrameMark(mark);
  return mark;
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

function activeRecordingSession(): (SessionRecordingState & { sessionId: string }) | null {
  let active: (SessionRecordingState & { sessionId: string }) | null = null;
  for (const [sessionId, state] of sessions) {
    if (!state.active || state.paused) continue;
    if (!active || state.startedAt > active.startedAt) {
      active = { ...state, sessionId };
    }
  }
  return active;
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
