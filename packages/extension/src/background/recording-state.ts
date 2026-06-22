import type { AnnotationRecordingContext } from '../common/types.js';

const active = new Map<string, number>();

export function startSessionRecording(sessionId: string, startedAt: number): void {
  active.set(sessionId, startedAt);
}

export function stopSessionRecording(sessionId: string): void {
  active.delete(sessionId);
}

export function annotationRecordingContext(sessionId: string): AnnotationRecordingContext | null {
  const startedAt = active.get(sessionId);
  if (!startedAt) return null;
  const capturedAt = Date.now();
  return {
    startedAt,
    capturedAt,
    elapsedMs: Math.max(0, capturedAt - startedAt),
  };
}
