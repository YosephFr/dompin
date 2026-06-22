import type { AnnotationRecordingContext, RecordingFrameMark } from '../common/types.js';

interface SessionRecordingState {
  startedAt: number;
  active: boolean;
  marks: RecordingFrameMark[];
}

const sessions = new Map<string, SessionRecordingState>();

export function startSessionRecording(sessionId: string, startedAt: number): void {
  sessions.set(sessionId, { startedAt, active: true, marks: [] });
}

export function stopSessionRecording(sessionId: string): void {
  const state = sessions.get(sessionId);
  if (state) state.active = false;
}

export function clearSessionRecording(sessionId: string): void {
  sessions.delete(sessionId);
}

export function addRecordingFrameMark(mark: RecordingFrameMark): RecordingFrameMark[] {
  const state = sessions.get(mark.sessionId);
  if (!state || !state.active) return [];
  const previous = state.marks[state.marks.length - 1];
  if (
    previous &&
    Math.abs(previous.elapsedMs - mark.elapsedMs) < 250 &&
    previous.page.url === mark.page.url &&
    previous.target?.selector === mark.target?.selector
  ) {
    return [...state.marks];
  }
  state.marks.push(mark);
  return [...state.marks];
}

export function recordingFrameMarks(sessionId: string): RecordingFrameMark[] {
  return [...(sessions.get(sessionId)?.marks ?? [])];
}

export function annotationRecordingContext(sessionId: string): AnnotationRecordingContext | null {
  const state = sessions.get(sessionId);
  if (!state?.active) return null;
  const capturedAt = Date.now();
  return {
    startedAt: state.startedAt,
    capturedAt,
    elapsedMs: Math.max(0, capturedAt - state.startedAt),
  };
}
