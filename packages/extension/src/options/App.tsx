import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import type { Settings } from '../common/settings.js';
import type { VaultStatus } from '../common/types.js';
import type { ExtensionState } from '../common/messaging.js';
import { sendRequest } from '../common/messaging.js';
import { mergeSettings } from '../common/settings.js';
import { clearRootHandle, requestRootPermission, saveRootHandle } from '../common/vault-handle.js';

type Step = 'welcome' | 'pick' | 'done' | 'settings';

type FlagKey = keyof Settings['flags'];

const FLAGS: { key: FlagKey; label: string; description: string }[] = [
  {
    key: 'captureViewportScreenshot',
    label: 'Capture viewport screenshot per pin',
    description: 'Saves the visible page area as a PNG alongside each annotation.',
  },
  {
    key: 'captureZonedScreenshot',
    label: 'Capture zoomed element screenshot per pin',
    description: 'Saves a tighter PNG centered on the picked element with surrounding context.',
  },
  {
    key: 'captureNetworkFailures',
    label: 'Include recent network failures',
    description: 'Records failed network requests from the page in each annotation file.',
  },
  {
    key: 'enableWebSpeech',
    label: 'Voice memos (Web Speech API)',
    description: 'Lets you dictate the comment instead of typing. Voice input stays on-device.',
  },
  {
    key: 'enableReactFiber',
    label: 'React Fiber introspection',
    description: 'Adds component name, owner chain, and source location for React apps.',
  },
  {
    key: 'promptSessionName',
    label: 'Ask for a name when starting a session',
    description: 'Shows a name prompt instead of generating one from the page title.',
  },
];

export function App(): JSX.Element {
  const [state, setState] = useState<ExtensionState | null>(null);
  const [step, setStep] = useState<Step>('welcome');
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [savedFolderName, setSavedFolderName] = useState<string | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [allowlistText, setAllowlistText] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectError, setReconnectError] = useState<string | null>(null);

  useEffect(() => {
    void loadState();
  }, []);

  async function loadState(): Promise<void> {
    const resp = await sendRequest<{ state: ExtensionState }>({ kind: 'state:get' });
    if (!resp.ok) {
      setSaveError(resp.error);
      return;
    }
    setState(resp.state);
    setDraft(resp.state.settings);
    setAllowlistText(resp.state.settings.allowlist.join('\n'));
    if (resp.state.vault.configured) {
      setStep('settings');
      setSavedFolderName(resp.state.vault.rootName);
    } else {
      setStep('welcome');
    }
  }

  const dirty = useMemo(() => {
    if (!state || !draft) return false;
    if (!sameAllowlist(parseAllowlist(allowlistText), draft.allowlist)) return true;
    return !sameSettings(state.settings, {
      ...draft,
      allowlist: parseAllowlist(allowlistText),
    });
  }, [state, draft, allowlistText]);

  async function pickFolder(): Promise<void> {
    setPickError(null);
    setPicking(true);
    try {
      const handle = await window.showDirectoryPicker({
        id: 'dompin-vault',
        mode: 'readwrite',
      });
      await saveRootHandle(handle);
      const r = await sendRequest<{ vault: VaultStatus }>({
        kind: 'vault:pickRoot',
        rootName: handle.name,
      });
      if (!r.ok) throw new Error(r.error);
      setState((prev) => (prev ? { ...prev, vault: r.vault } : prev));
      setSavedFolderName(handle.name);
      setStep('done');
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (err.name === 'AbortError') {
        setPickError(null);
      } else {
        setPickError(err.message || 'Could not access the selected folder.');
      }
    } finally {
      setPicking(false);
    }
  }

  async function reconnectFolder(): Promise<void> {
    setReconnectError(null);
    setReconnecting(true);
    try {
      const granted = await requestRootPermission();
      if (granted === 'granted') {
        const r = await sendRequest<{ vault: VaultStatus }>({
          kind: 'vault:request-permission',
        });
        if (!r.ok) throw new Error(r.error);
        setState((prev) => (prev ? { ...prev, vault: r.vault } : prev));
        setSavedFolderName(r.vault.rootName);
        return;
      }
      const handle = await window.showDirectoryPicker({
        id: 'dompin-vault',
        mode: 'readwrite',
      });
      await saveRootHandle(handle);
      const r = await sendRequest<{ vault: VaultStatus }>({
        kind: 'vault:pickRoot',
        rootName: handle.name,
      });
      if (!r.ok) throw new Error(r.error);
      setState((prev) => (prev ? { ...prev, vault: r.vault } : prev));
      setSavedFolderName(handle.name);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (err.name !== 'AbortError') setReconnectError(err.message);
    } finally {
      setReconnecting(false);
    }
  }

  async function changeFolder(): Promise<void> {
    await clearRootHandle();
    const r = await sendRequest<{ vault: VaultStatus }>({ kind: 'vault:clear' });
    if (r.ok) {
      setState((prev) => (prev ? { ...prev, vault: r.vault } : prev));
      setSavedFolderName(null);
      setStep('pick');
    }
  }

  function setFlag(key: FlagKey, value: boolean): void {
    setDraft((d) =>
      d
        ? {
            ...d,
            flags: { ...d.flags, [key]: value },
          }
        : d,
    );
  }

  async function saveSettings(): Promise<void> {
    if (!draft) return;
    setSavingSettings(true);
    setSaveError(null);
    try {
      const next = mergeSettings({
        ...draft,
        allowlist: parseAllowlist(allowlistText),
      });
      const resp = await sendRequest({ kind: 'settings:save', settings: next });
      if (!resp.ok) {
        setSaveError(resp.error);
        return;
      }
      setState((prev) => (prev ? { ...prev, settings: next } : prev));
      setDraft(next);
      setAllowlistText(next.allowlist.join('\n'));
    } finally {
      setSavingSettings(false);
    }
  }

  if (!state) {
    return (
      <div className="page">
        <div className="loading">Loading…</div>
      </div>
    );
  }

  if (step === 'welcome') {
    return (
      <div className="page">
        <PageHeader title="Welcome to DOMPin" />
        <section className="section wizard">
          <ol className="wizard-list">
            <li>Pin elements on any web page with a click.</li>
            <li>
              Each pin becomes a Markdown file with your comment, the element data, and screenshots.
            </li>
            <li>
              Hand the folder to your AI coding agent — Claude Code, Cursor, or any tool that reads
              local files.
            </li>
          </ol>
          <div className="wizard-actions">
            <button type="button" className="btn btn-primary" onClick={() => setStep('pick')}>
              Continue
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (step === 'pick') {
    return (
      <div className="page">
        <PageHeader title="Choose your vault folder" />
        <section className="section wizard">
          <p className="section-hint">
            Choose a folder where DOMPin will write annotations. We recommend a dedicated folder you
            can later open in your editor.
          </p>
          {pickError ? <div className="status-error inline-error">{pickError}</div> : null}
          <div className="wizard-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={pickFolder}
              disabled={picking}
            >
              {picking ? 'Opening picker…' : 'Choose folder…'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep('welcome')}
              disabled={picking}
            >
              Back
            </button>
          </div>
          <p className="section-hint quiet">
            DOMPin only reads and writes inside this folder. It cannot access anything outside it.
          </p>
        </section>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="page">
        <PageHeader title="You're all set" />
        <section className="section wizard">
          <p>
            Vault folder: <code>{savedFolderName ?? 'selected folder'}</code>
          </p>
          <p className="section-hint">
            Click the DOMPin icon on any page to start pinning. Right-click the icon to open the
            session panel.
          </p>
          <div className="wizard-actions">
            <button type="button" className="btn btn-primary" onClick={() => setStep('settings')}>
              Open settings
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => window.close()}>
              Done
            </button>
          </div>
        </section>
      </div>
    );
  }

  // settings
  const vault = state.vault;
  const flags = draft?.flags ?? state.settings.flags;

  return (
    <div className="page">
      <PageHeader title="DOMPin settings" />

      <section className="section">
        <div className="section-head">
          <h2>Vault folder</h2>
          {vault.configured && !vault.needsReconnect ? (
            <span className="status-ok">Connected</span>
          ) : vault.needsReconnect ? (
            <span className="status-error">Needs reconnect</span>
          ) : (
            <span className="status-error">Not configured</span>
          )}
        </div>
        <p className="section-hint">
          Annotations are written here. Each domain becomes a subfolder; each session a folder
          inside that.
        </p>
        <div className="vault-row">
          <div className="vault-name">
            {savedFolderName ?? vault.rootName ?? 'No folder selected'}
          </div>
          <div className="vault-stats">
            {vault.totalSessions} sessions · {vault.totalAnnotations} annotations
          </div>
        </div>
        {reconnectError ? <div className="status-error inline-error">{reconnectError}</div> : null}
        <div className="row">
          {vault.needsReconnect ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={reconnectFolder}
              disabled={reconnecting}
            >
              {reconnecting ? 'Reconnecting…' : 'Reconnect'}
            </button>
          ) : null}
          <button type="button" className="btn btn-secondary" onClick={changeFolder}>
            Change folder…
          </button>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Allowed domains</h2>
        </div>
        <p className="section-hint">
          One domain per line. Use <code>*</code> to allow every site, or patterns like{' '}
          <code>*.example.com</code>.
        </p>
        <textarea
          className="textarea"
          value={allowlistText}
          spellCheck={false}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setAllowlistText(e.target.value)}
        />
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Capture options</h2>
        </div>
        {FLAGS.map((f) => (
          <label key={f.key} className="toggle">
            <span className="toggle-text">
              <span className="toggle-label">{f.label}</span>
              <span className="toggle-description">{f.description}</span>
            </span>
            <input
              type="checkbox"
              className="toggle-input"
              checked={flags[f.key]}
              onChange={(e) => setFlag(f.key, e.target.checked)}
            />
            <span className="toggle-track">
              <span className="toggle-thumb" />
            </span>
          </label>
        ))}
      </section>

      <footer className="page-footer">
        {saveError ? <span className="status-error">{saveError}</span> : null}
        <span className="footer-spacer" />
        <button
          type="button"
          className="btn btn-primary"
          disabled={!dirty || savingSettings}
          onClick={saveSettings}
        >
          {savingSettings ? 'Saving…' : 'Save changes'}
        </button>
      </footer>
    </div>
  );
}

function PageHeader({ title }: { title: string }): JSX.Element {
  return (
    <header className="page-header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <h1>{title}</h1>
      </div>
    </header>
  );
}

function parseAllowlist(text: string): string[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.length > 0 ? lines : ['*'];
}

function sameAllowlist(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function sameSettings(a: Settings, b: Settings): boolean {
  if (!sameAllowlist(a.allowlist, b.allowlist)) return false;
  for (const k of Object.keys(a.flags) as FlagKey[]) {
    if (a.flags[k] !== b.flags[k]) return false;
  }
  return true;
}
