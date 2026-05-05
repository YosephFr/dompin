import { useEffect, useState, type FormEvent } from 'react';
import type { Session, SessionListItem, VaultStatus } from '../common/types.js';
import type { ExtensionState } from '../common/messaging.js';
import { sendRequest } from '../common/messaging.js';
import { requestRootPermission, saveRootHandle } from '../common/vault-handle.js';

type Busy = null | 'reconnect' | 'toggle' | 'new' | 'rename';

interface OriginTab {
  tabId: number | null;
  url: string | null;
  domain: string | null;
}

const EMPTY_ORIGIN: OriginTab = { tabId: null, url: null, domain: null };

export function App(): JSX.Element {
  const [state, setState] = useState<ExtensionState | null>(null);
  const [origin, setOrigin] = useState<OriginTab>(EMPTY_ORIGIN);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [recent, setRecent] = useState<SessionListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [renameDraft, setRenameDraft] = useState<string | null>(null);
  const [newSessionDraft, setNewSessionDraft] = useState<string | null>(null);

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll(): Promise<void> {
    const tab = await readOriginTab();
    setOrigin(tab);
    const resp = await sendRequest<{ state: ExtensionState }>({ kind: 'state:get' });
    if (!resp.ok) {
      setError(resp.error);
      return;
    }
    setState(resp.state);
    if (resp.state.vault.configured && !resp.state.vault.needsReconnect) {
      await loadSessions(resp.state.vault, tab);
    }
  }

  async function loadSessions(vault: VaultStatus, tab: OriginTab): Promise<void> {
    if (!vault.configured || vault.needsReconnect) return;
    if (tab.tabId !== null) {
      const activeR = await sendRequest<{ session: Session | null }>({
        kind: 'session:active',
        tabId: tab.tabId,
      });
      if (activeR.ok) setActiveSession(activeR.session);
      else setActiveSession(null);
    } else {
      setActiveSession(null);
    }
    const listR = await sendRequest<{ sessions: SessionListItem[] }>({
      kind: 'session:list',
      domain: tab.domain ?? undefined,
      limit: 6,
    });
    if (listR.ok) setRecent(listR.sessions);
    else setRecent([]);
  }

  async function refreshState(): Promise<void> {
    const resp = await sendRequest<{ state: ExtensionState }>({ kind: 'state:get' });
    if (resp.ok) {
      setState(resp.state);
      await loadSessions(resp.state.vault, origin);
    }
  }

  async function handleReconnect(): Promise<void> {
    setError(null);
    setBusy('reconnect');
    try {
      const granted = await requestRootPermission();
      if (granted === 'granted') {
        const r = await sendRequest<{ vault: VaultStatus }>({ kind: 'vault:request-permission' });
        if (!r.ok) throw new Error(r.error);
        setState((prev) => (prev ? { ...prev, vault: r.vault } : prev));
        await loadSessions(r.vault, origin);
        return;
      }
      const handle = await window.showDirectoryPicker({ id: 'dompin-vault', mode: 'readwrite' });
      await saveRootHandle(handle);
      const r = await sendRequest<{ vault: VaultStatus }>({
        kind: 'vault:pickRoot',
        rootName: handle.name,
      });
      if (!r.ok) throw new Error(r.error);
      setState((prev) => (prev ? { ...prev, vault: r.vault } : prev));
      await loadSessions(r.vault, origin);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (err.name !== 'AbortError') setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function handleTogglePicker(): Promise<void> {
    setBusy('toggle');
    try {
      const resp = await sendRequest({ kind: 'toggle-picker' });
      if (!resp.ok) setError(resp.error);
      else window.close();
    } finally {
      setBusy(null);
    }
  }

  function openSettings(): void {
    chrome.runtime.openOptionsPage();
  }

  function startNewSession(): void {
    if (state?.settings.flags.promptSessionName) {
      setNewSessionDraft('');
    } else {
      void commitNewSession(null);
    }
  }

  async function commitNewSession(name: string | null): Promise<void> {
    if (origin.tabId === null || origin.url === null) return;
    setBusy('new');
    setError(null);
    try {
      const resp = await sendRequest<{ session: Session }>({
        kind: 'session:new',
        tabId: origin.tabId,
        pageUrl: origin.url,
        ...(name ? { name } : {}),
      });
      if (resp.ok) {
        setActiveSession(resp.session);
        await refreshState();
      } else {
        setError(resp.error);
      }
    } finally {
      setBusy(null);
      setNewSessionDraft(null);
    }
  }

  function startRename(): void {
    if (!activeSession) return;
    setRenameDraft(activeSession.name);
  }

  async function commitRename(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!activeSession || renameDraft === null) return;
    const name = renameDraft.trim();
    if (!name || name === activeSession.name) {
      setRenameDraft(null);
      return;
    }
    setBusy('rename');
    setError(null);
    try {
      const resp = await sendRequest<{ session: Session }>({
        kind: 'session:rename',
        sessionId: activeSession.id,
        newName: name,
      });
      if (resp.ok) {
        setActiveSession(resp.session);
        await refreshState();
      } else {
        setError(resp.error);
      }
    } finally {
      setBusy(null);
      setRenameDraft(null);
    }
  }

  if (!state) {
    return (
      <div className="popup-shell">
        <Header onSettings={openSettings} />
        <div className="loading">Loading…</div>
      </div>
    );
  }

  const vault = state.vault;

  return (
    <div className="popup-shell">
      <Header onSettings={openSettings} />
      {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}

      {!vault.configured ? (
        <SetupCard onOpenSetup={openSettings} />
      ) : vault.needsReconnect ? (
        <ReconnectCard
          rootName={vault.rootName}
          busy={busy === 'reconnect'}
          onReconnect={handleReconnect}
          onChangeFolder={openSettings}
        />
      ) : (
        <>
          <ActiveSessionCard
            session={activeSession}
            domain={origin.domain}
            renameDraft={renameDraft}
            newSessionDraft={newSessionDraft}
            onRenameDraftChange={setRenameDraft}
            onNewSessionDraftChange={setNewSessionDraft}
            onStartRename={startRename}
            onCommitRename={commitRename}
            onCancelRename={() => setRenameDraft(null)}
            onStartNew={startNewSession}
            onCommitNew={(name) => void commitNewSession(name)}
            onCancelNew={() => setNewSessionDraft(null)}
            onTogglePicker={() => void handleTogglePicker()}
            busy={busy}
          />
          <RecentSessionsCard items={recent} activeId={activeSession?.id ?? null} />
        </>
      )}

      <Footer
        rootName={vault.rootName}
        configured={vault.configured && !vault.needsReconnect}
        onSettings={openSettings}
      />
    </div>
  );
}

function Header({ onSettings }: { onSettings: () => void }): JSX.Element {
  return (
    <header className="popup-header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">DOMPin</span>
      </div>
      <button
        type="button"
        className="icon-btn"
        onClick={onSettings}
        aria-label="Open settings"
        title="Settings"
      >
        <SettingsIcon />
      </button>
    </header>
  );
}

function SetupCard({ onOpenSetup }: { onOpenSetup: () => void }): JSX.Element {
  return (
    <section className="card setup-card">
      <h2 className="card-title">Set up your vault folder</h2>
      <p className="card-text">
        DOMPin saves annotations as Markdown and PNG files inside a folder you choose.
      </p>
      <button type="button" className="btn btn-primary" onClick={onOpenSetup}>
        Open setup
      </button>
    </section>
  );
}

function ReconnectCard({
  rootName,
  busy,
  onReconnect,
  onChangeFolder,
}: {
  rootName: string | null;
  busy: boolean;
  onReconnect: () => void;
  onChangeFolder: () => void;
}): JSX.Element {
  return (
    <section className="card reconnect-card">
      <div className="banner banner-pending">
        <span className="dot" aria-hidden="true" />
        <span className="banner-text">Folder access expired. Reconnect to continue.</span>
      </div>
      {rootName ? <p className="card-text">Last folder: {rootName}</p> : null}
      <div className="card-actions">
        <button type="button" className="btn btn-primary" onClick={onReconnect} disabled={busy}>
          {busy ? 'Reconnecting…' : 'Reconnect folder'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onChangeFolder}>
          Change folder…
        </button>
      </div>
    </section>
  );
}

function ActiveSessionCard({
  session,
  domain,
  renameDraft,
  newSessionDraft,
  onRenameDraftChange,
  onNewSessionDraftChange,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onStartNew,
  onCommitNew,
  onCancelNew,
  onTogglePicker,
  busy,
}: {
  session: Session | null;
  domain: string | null;
  renameDraft: string | null;
  newSessionDraft: string | null;
  onRenameDraftChange: (v: string) => void;
  onNewSessionDraftChange: (v: string) => void;
  onStartRename: () => void;
  onCommitRename: (e: FormEvent) => void;
  onCancelRename: () => void;
  onStartNew: () => void;
  onCommitNew: (name: string | null) => void;
  onCancelNew: () => void;
  onTogglePicker: () => void;
  busy: Busy;
}): JSX.Element {
  return (
    <section className="card session-card">
      <div className="card-header">
        <span className="card-eyebrow">Active session</span>
        {session ? (
          <span className="session-meta">
            {relativeTime(session.lastWriteAt ?? session.startedAt)}
          </span>
        ) : null}
      </div>

      {newSessionDraft !== null ? (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const v = newSessionDraft.trim();
            onCommitNew(v.length ? v : null);
          }}
        >
          <input
            autoFocus
            className="inline-input"
            value={newSessionDraft}
            placeholder="Session name (optional)"
            onChange={(e) => onNewSessionDraftChange(e.target.value)}
          />
          <div className="card-actions inline">
            <button type="submit" className="btn btn-primary" disabled={busy === 'new'}>
              {busy === 'new' ? 'Creating…' : 'Create'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onCancelNew}>
              Cancel
            </button>
          </div>
        </form>
      ) : renameDraft !== null ? (
        <form className="inline-form" onSubmit={onCommitRename}>
          <input
            autoFocus
            className="inline-input"
            value={renameDraft}
            onChange={(e) => onRenameDraftChange(e.target.value)}
          />
          <div className="card-actions inline">
            <button type="submit" className="btn btn-primary" disabled={busy === 'rename'}>
              {busy === 'rename' ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onCancelRename}>
              Cancel
            </button>
          </div>
        </form>
      ) : session ? (
        <>
          <div className="session-name">{session.name}</div>
          <div className="session-sub">
            <span className="session-domain">{session.domain || domain || 'unknown host'}</span>
            <span className="session-dot" aria-hidden="true">
              ·
            </span>
            <span>
              {session.annotationCount} annotation{session.annotationCount === 1 ? '' : 's'}
            </span>
          </div>
          <div className="card-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={onTogglePicker}
              disabled={busy === 'toggle'}
            >
              {busy === 'toggle' ? 'Working…' : 'Toggle picker'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onStartNew}>
              New session
            </button>
            <button type="button" className="btn btn-ghost" onClick={onStartRename}>
              Rename
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="session-name session-name-empty">No session yet</div>
          <p className="card-text">
            {domain
              ? `Pin an element on ${domain} to start a session here.`
              : 'Open a regular tab to start a session.'}
          </p>
          <div className="card-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={onTogglePicker}
              disabled={busy === 'toggle'}
            >
              {busy === 'toggle' ? 'Working…' : 'Toggle picker'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onStartNew}>
              New session
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function RecentSessionsCard({
  items,
  activeId,
}: {
  items: SessionListItem[];
  activeId: string | null;
}): JSX.Element {
  const filtered = items.filter((s) => s.id !== activeId).slice(0, 6);
  return (
    <section className="card recent-card">
      <div className="card-header">
        <span className="card-eyebrow">Recent sessions</span>
      </div>
      {filtered.length === 0 ? (
        <p className="card-text muted">No other sessions yet for this site.</p>
      ) : (
        <ul className="recent-list">
          {filtered.map((s) => (
            <li key={s.id} className="recent-item">
              <span className="recent-name">{s.name}</span>
              <span className="recent-meta">
                {s.annotationCount} · {relativeTime(s.lastWriteAt ?? s.startedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Footer({
  rootName,
  configured,
  onSettings,
}: {
  rootName: string | null;
  configured: boolean;
  onSettings: () => void;
}): JSX.Element {
  return (
    <footer className="popup-footer">
      <button type="button" className="link-btn" onClick={onSettings}>
        Open settings
      </button>
      <span className="footer-meta">
        {configured && rootName ? `Vault: ${rootName}` : 'Vault not configured'}
      </span>
    </footer>
  );
}

function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}): JSX.Element {
  return (
    <div className="banner banner-error">
      <span className="dot" aria-hidden="true" />
      <span className="banner-text">{message}</span>
      <button type="button" className="banner-action" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}

function SettingsIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="2.2" />
      <path d="M13.4 9.6l1.3.7-1.4 2.4-1.4-.5a5.7 5.7 0 0 1-1.4.8l-.2 1.5h-2.6l-.2-1.5a5.7 5.7 0 0 1-1.4-.8l-1.4.5-1.4-2.4 1.3-.7a5.6 5.6 0 0 1 0-1.6l-1.3-.7 1.4-2.4 1.4.5a5.7 5.7 0 0 1 1.4-.8l.2-1.5h2.6l.2 1.5c.5.2.9.5 1.4.8l1.4-.5 1.4 2.4-1.3.7a5.6 5.6 0 0 1 0 1.6z" />
    </svg>
  );
}

async function readOriginTab(): Promise<OriginTab> {
  try {
    const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
    if (typeof win.id !== 'number') return EMPTY_ORIGIN;
    const tabs = await chrome.tabs.query({ active: true, windowId: win.id });
    const tab = tabs[0];
    if (!tab || typeof tab.id !== 'number') return EMPTY_ORIGIN;
    const url = tab.url ?? null;
    return { tabId: tab.id, url, domain: deriveDomain(url) };
  } catch {
    return EMPTY_ORIGIN;
  }
}

function deriveDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    return host || null;
  } catch {
    return null;
  }
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 30_000) return 'just now';
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}
