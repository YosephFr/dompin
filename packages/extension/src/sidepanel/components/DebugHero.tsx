import { useCallback, useEffect, useState } from 'react';
import { useT } from '../../common/i18n/index.js';
import { sendRequest } from '../../common/messaging.js';
import type { DebugCaptureStatus, Session } from '../../common/types.js';

const EMPTY_STATUS: DebugCaptureStatus = {
  active: false,
  sessionId: null,
  startedAt: null,
  elapsedMs: 0,
  eventCount: 0,
  networkCount: 0,
  consoleCount: 0,
  lastError: null,
};

export function DebugHero({
  session,
  tabId,
  onError,
}: {
  session: Session;
  tabId: number | null;
  onError: (message: string) => void;
}): JSX.Element {
  const t = useT();
  const [status, setStatus] = useState<DebugCaptureStatus>(EMPTY_STATUS);
  const [busy, setBusy] = useState(false);

  const sameSession = status.sessionId === session.id;
  const active = status.active && sameSession;
  const label = active ? t.debug.active : t.debug.idle;

  const refresh = useCallback(async (): Promise<void> => {
    if (tabId == null) {
      setStatus(EMPTY_STATUS);
      return;
    }
    const resp = await sendRequest<{ status: DebugCaptureStatus }>({
      kind: 'debug:status',
      tabId,
    });
    if (resp.ok) setStatus(resp.status);
  }, [tabId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1000);
    return () => window.clearInterval(timer);
  }, [refresh, session.id]);

  async function toggle(): Promise<void> {
    if (tabId == null || busy) return;
    setBusy(true);
    try {
      const resp = active
        ? await sendRequest<{ status: DebugCaptureStatus }>({
            kind: 'debug:stop',
            tabId,
            sessionId: session.id,
          })
        : await sendRequest<{ status: DebugCaptureStatus }>({
            kind: 'debug:start',
            tabId,
            sessionId: session.id,
          });
      if (resp.ok) {
        setStatus(resp.status);
      } else {
        onError(resp.error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`hero hero-debug ${active ? 'is-on' : 'is-off'}`}>
      <div className="hero-row">
        <span className="debug-status">
          <span className="debug-dot" aria-hidden="true" />
          <span className="hero-label">{label}</span>
        </span>
        <span className="recording-time">{formatElapsed(sameSession ? status.elapsedMs : 0)}</span>
      </div>
      <div className="debug-stats" aria-label={t.debug.statsLabel}>
        <span>
          <strong>{sameSession ? status.eventCount : 0}</strong>
          {t.debug.events}
        </span>
        <span>
          <strong>{sameSession ? status.networkCount : 0}</strong>
          {t.debug.network}
        </span>
        <span>
          <strong>{sameSession ? status.consoleCount : 0}</strong>
          {t.debug.console}
        </span>
      </div>
      <button
        type="button"
        className={`hero-btn ${active ? 'btn btn-danger-solid' : 'btn btn-primary'}`}
        onClick={() => void toggle()}
        disabled={busy || tabId == null}
      >
        {busy ? t.debug.working : active ? t.debug.stop : t.debug.start}
      </button>
      <p className="hero-hint">
        {status.lastError ? t.debug.lastError(status.lastError) : t.debug.hint}
      </p>
    </section>
  );
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
