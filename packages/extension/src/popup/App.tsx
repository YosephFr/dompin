import { useEffect, useMemo, useState } from 'react';
import type { AnnotationSummary } from '@dompin/shared';
import type { ConnectionStatus, ExtensionState } from '../common/messaging.js';
import { sendRequest } from '../common/messaging.js';

const POLL_MS = 2000;

export function App(): JSX.Element {
  const [state, setState] = useState<ExtensionState | null>(null);
  const [busy, setBusy] = useState<'send' | 'clear' | 'toggle' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const r = await sendRequest<{ state: ExtensionState }>({ kind: 'state:get' });
      if (cancelled) return;
      if (r.ok) setState(r.state);
    };
    void refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const handleSendAll = async () => {
    if (!state) return;
    setBusy('send');
    setError(null);
    const r = await sendRequest<{ sent: number }>({ kind: 'send-all' });
    setBusy(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    const fresh = await sendRequest<{ state: ExtensionState }>({ kind: 'state:get' });
    if (fresh.ok) setState(fresh.state);
  };

  const handleClear = async () => {
    if (!state || state.queue.length === 0) return;
    if (!window.confirm('Clear all pending annotations?')) return;
    setBusy('clear');
    setError(null);
    const r = await sendRequest({ kind: 'clear' });
    setBusy(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    const fresh = await sendRequest<{ state: ExtensionState }>({ kind: 'state:get' });
    if (fresh.ok) setState(fresh.state);
  };

  const handleToggle = async () => {
    setBusy('toggle');
    setError(null);
    const r = await sendRequest({ kind: 'toggle-picker' });
    setBusy(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    window.close();
  };

  const handleCancel = async (id: string) => {
    const r = await sendRequest({ kind: 'cancel', id });
    if (!r.ok) {
      setError(r.error);
      return;
    }
    const fresh = await sendRequest<{ state: ExtensionState }>({ kind: 'state:get' });
    if (fresh.ok) setState(fresh.state);
  };

  const handleOptions = () => {
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
    else window.open(chrome.runtime.getURL('src/options/options.html'));
  };

  if (!state) {
    return (
      <div className="popup-shell">
        <div className="loading">Loading…</div>
      </div>
    );
  }

  return (
    <div className="popup-shell">
      <header className="popup-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">DOMPin</span>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={handleOptions}
          aria-label="Open settings"
          title="Settings"
        >
          <SettingsIcon />
        </button>
      </header>

      <ConnectionBanner status={state.connection} onReconnect={async () => {
        await sendRequest({ kind: 'reconnect' });
      }} />

      <section className="queue">
        <div className="queue-summary">
          <span className="queue-count">{state.queue.length}</span>
          <span className="queue-label">
            {state.queue.length === 1 ? 'annotation pending' : 'annotations pending'}
          </span>
        </div>
        <QueueList queue={state.queue} onCancel={handleCancel} />
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      <footer className="popup-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSendAll}
          disabled={state.queue.length === 0 || busy != null}
        >
          {busy === 'send' ? 'Sending…' : 'Send to agent'}
        </button>
        <div className="row">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleToggle}
            disabled={busy != null}
          >
            {busy === 'toggle' ? '…' : 'Toggle picker'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleClear}
            disabled={state.queue.length === 0 || busy != null}
          >
            Clear queue
          </button>
        </div>
      </footer>
    </div>
  );
}

function ConnectionBanner({
  status,
  onReconnect,
}: {
  status: ConnectionStatus;
  onReconnect: () => void;
}): JSX.Element {
  const cls = useMemo(() => {
    switch (status.state) {
      case 'connected':
        return 'banner banner-ok';
      case 'connecting':
        return 'banner banner-pending';
      case 'error':
        return 'banner banner-error';
      default:
        return 'banner banner-error';
    }
  }, [status.state]);
  const label = useMemo(() => {
    switch (status.state) {
      case 'connected':
        return status.serverVersion ? `Server · v${status.serverVersion}` : 'Connected';
      case 'connecting':
        return status.reconnectAttempt > 0
          ? `Reconnecting (attempt ${status.reconnectAttempt})`
          : 'Connecting…';
      case 'error':
        return status.lastError ?? 'Connection error';
      default:
        return 'Disconnected';
    }
  }, [status]);
  return (
    <div className={cls}>
      <span className="dot" aria-hidden="true" />
      <span className="banner-text">{label}</span>
      {status.state !== 'connected' ? (
        <button type="button" className="banner-action" onClick={onReconnect}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

function QueueList({
  queue,
  onCancel,
}: {
  queue: AnnotationSummary[];
  onCancel: (id: string) => void;
}): JSX.Element {
  if (queue.length === 0) {
    return (
      <div className="empty">
        <p className="empty-title">No annotations yet</p>
        <p className="empty-hint">
          Press <kbd>⌘ ⇧ .</kbd> on any page to start pinning.
        </p>
      </div>
    );
  }
  return (
    <ul className="queue-list">
      {queue.map((item) => (
        <li key={item.id} className="queue-item">
          <div className="queue-item-main">
            <div className="queue-selector" title={item.selector ?? ''}>
              {item.selector ?? 'region'}
            </div>
            <div className="queue-comment">{item.commentPreview || '(no comment)'}</div>
            <div className="queue-host">{hostOf(item.pageUrl)}</div>
          </div>
          <button
            type="button"
            className="icon-btn small"
            onClick={() => onCancel(item.id)}
            aria-label="Remove"
            title="Remove"
          >
            <TrashIcon />
          </button>
        </li>
      ))}
    </ul>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function SettingsIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.6 3.4l-1.13 1.13M4.53 11.47L3.4 12.6M12.6 12.6l-1.13-1.13M4.53 4.53L3.4 3.4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TrashIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M3 4h8M5.5 4V2.5h3V4M4 4l.5 7.5h5L10 4M6 6.5v3M8 6.5v3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
