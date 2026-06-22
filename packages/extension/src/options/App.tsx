import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import type { Settings, TranscriptionProvider } from '../common/settings.js';
import type { VaultStatus } from '../common/types.js';
import type { ExtensionState } from '../common/messaging.js';
import { sendRequest } from '../common/messaging.js';
import { mergeSettings } from '../common/settings.js';
import { clearRootHandle, requestRootPermission, saveRootHandle } from '../common/vault-handle.js';
import { BrandLogo } from '../common/icons/BrandLogo.js';

type Step = 'welcome' | 'pick' | 'done' | 'settings';

type FlagKey = keyof Settings['flags'];

const FLAGS: { key: FlagKey; label: string; description: string }[] = [
  {
    key: 'captureNetworkFailures',
    label: 'Include recent network failures',
    description: 'Records failed network requests from the page in each annotation file.',
  },
  {
    key: 'enableWebSpeech',
    label: 'Audio transcription',
    description: 'Lets you record a note and insert the provider transcript into the pin comment.',
  },
  {
    key: 'enableReactFiber',
    label: 'React Fiber introspection',
    description: 'Adds component name, owner chain, and source location for React apps.',
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
  const [frameKeywordsText, setFrameKeywordsText] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [gitCheck, setGitCheck] = useState<string | null>(null);
  const [checkingGit, setCheckingGit] = useState(false);
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
    setFrameKeywordsText(resp.state.settings.recording.frameKeywords.join('\n'));
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
    if (!sameStringArray(parseFrameKeywords(frameKeywordsText), draft.recording.frameKeywords))
      return true;
    return !sameSettings(state.settings, {
      ...draft,
      allowlist: parseAllowlist(allowlistText),
      recording: {
        ...draft.recording,
        frameKeywords: parseFrameKeywords(frameKeywordsText),
      },
    });
  }, [state, draft, allowlistText, frameKeywordsText]);

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

  function setTranscription<K extends keyof Settings['transcription']>(
    key: K,
    value: Settings['transcription'][K],
  ): void {
    setDraft((d) =>
      d
        ? {
            ...d,
            transcription: { ...d.transcription, [key]: value },
          }
        : d,
    );
  }

  function setGit<K extends keyof Settings['git']>(key: K, value: Settings['git'][K]): void {
    setDraft((d) =>
      d
        ? {
            ...d,
            git: { ...d.git, [key]: value },
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
        recording: {
          ...draft.recording,
          frameKeywords: parseFrameKeywords(frameKeywordsText),
        },
      });
      const resp = await sendRequest({ kind: 'settings:save', settings: next });
      if (!resp.ok) {
        setSaveError(resp.error);
        return;
      }
      setState((prev) => (prev ? { ...prev, settings: next } : prev));
      setDraft(next);
      setAllowlistText(next.allowlist.join('\n'));
      setFrameKeywordsText(next.recording.frameKeywords.join('\n'));
    } finally {
      setSavingSettings(false);
    }
  }

  async function checkGitCompanion(): Promise<void> {
    if (!draft) return;
    setCheckingGit(true);
    setGitCheck(null);
    try {
      const next = mergeSettings({
        ...draft,
        allowlist: parseAllowlist(allowlistText),
        recording: {
          ...draft.recording,
          frameKeywords: parseFrameKeywords(frameKeywordsText),
        },
      });
      await sendRequest({ kind: 'settings:save', settings: next });
      const resp = await sendRequest<{ available: boolean; message: string }>({
        kind: 'git:status',
      });
      if (resp.ok) {
        setGitCheck(resp.available ? resp.message : `Not connected: ${resp.message}`);
      } else {
        setGitCheck(`Not connected: ${resp.error}`);
      }
    } finally {
      setCheckingGit(false);
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
            Click the DOMPin icon on any page to open the side panel and start pinning. You can also
            right-click any element on a page and pick "Annotate element with DOMPin".
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
  const transcription = draft?.transcription ?? state.settings.transcription;
  const git = draft?.git ?? state.settings.git;

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
          <h2>Local Git history</h2>
        </div>
        <p className="section-hint">
          DOMPin creates a Git checkpoint inside each session folder after session starts, resumes,
          annotations, edits, deletes, and recorded-session processing.
        </p>
        <label className="toggle">
          <span className="toggle-text">
            <span className="toggle-label">Enable automatic Git checkpoints</span>
            <span className="toggle-description">
              Recommended. If the local companion is not connected, DOMPin still saves the files and
              the status check below explains what failed.
            </span>
          </span>
          <input
            type="checkbox"
            className="toggle-input"
            checked={git.enabled}
            onChange={(e) => setGit('enabled', e.target.checked)}
          />
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
        </label>
        <ul className="requirement-list">
          <li>Use “Check companion” after installing or reloading the extension.</li>
          <li>The vault path is optional when the selected folder is in your home folders.</li>
          <li>If a custom vault path is needed, add it in Advanced Git setup.</li>
        </ul>
        <div className="row">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void checkGitCompanion()}
            disabled={checkingGit}
          >
            {checkingGit ? 'Checking…' : 'Check companion'}
          </button>
          {gitCheck ? <span className="status-note">{gitCheck}</span> : null}
        </div>
        <details className="advanced-panel">
          <summary>Advanced Git setup</summary>
          <div className="field-grid">
            <label className="field">
              <span className="field-label">Companion name</span>
              <input
                className="input"
                type="text"
                value={git.helperName}
                onChange={(e) => setGit('helperName', e.target.value)}
                placeholder="com.yosephfr.dompin_git"
              />
            </label>
            <label className="field">
              <span className="field-label">Optional vault absolute path</span>
              <input
                className="input"
                type="text"
                value={git.vaultPath}
                onChange={(e) => setGit('vaultPath', e.target.value)}
                placeholder="/Users/franco/anotaciones"
              />
            </label>
          </div>
        </details>
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

      <section className="section">
        <div className="section-head">
          <h2>Recorded session frames</h2>
        </div>
        <p className="section-hint">
          One keyword or phrase per line. When a recorded session transcript contains one of these,
          DOMPin saves a still frame and a short WebM clip from that moment.
        </p>
        <textarea
          className="textarea"
          value={frameKeywordsText}
          spellCheck={false}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setFrameKeywordsText(e.target.value)}
        />
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Audio transcription</h2>
        </div>
        <p className="section-hint">
          Audio is recorded in the browser, sent directly from the extension to the selected
          provider, and inserted into the pin text before you submit it.
        </p>
        <label className="field">
          <span className="field-label">Provider</span>
          <select
            className="select"
            value={transcription.provider}
            onChange={(e) => setTranscription('provider', e.target.value as TranscriptionProvider)}
          >
            <option value="elevenlabs">ElevenLabs</option>
            <option value="openai">OpenAI</option>
          </select>
        </label>
        <div className="field-grid">
          <label className="field">
            <span className="field-label">ElevenLabs API key</span>
            <input
              className="input"
              type="password"
              autoComplete="off"
              value={transcription.elevenLabsApiKey}
              onChange={(e) => setTranscription('elevenLabsApiKey', e.target.value)}
              placeholder="xi-..."
            />
          </label>
          <label className="field">
            <span className="field-label">ElevenLabs model</span>
            <input
              className="input"
              type="text"
              value={transcription.elevenLabsModel}
              onChange={(e) => setTranscription('elevenLabsModel', e.target.value)}
              placeholder="scribe_v2"
            />
          </label>
        </div>
        <div className="field-grid">
          <label className="field">
            <span className="field-label">OpenAI API key</span>
            <input
              className="input"
              type="password"
              autoComplete="off"
              value={transcription.openAiApiKey}
              onChange={(e) => setTranscription('openAiApiKey', e.target.value)}
              placeholder="sk-..."
            />
          </label>
          <label className="field">
            <span className="field-label">OpenAI model</span>
            <input
              className="input"
              type="text"
              value={transcription.openAiModel}
              onChange={(e) => setTranscription('openAiModel', e.target.value)}
              placeholder="gpt-4o-transcribe"
            />
          </label>
        </div>
        <label className="field field-small">
          <span className="field-label">Language code</span>
          <input
            className="input"
            type="text"
            value={transcription.languageCode}
            onChange={(e) => setTranscription('languageCode', e.target.value)}
            placeholder="es"
          />
        </label>
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
        <span className="brand-mark" aria-hidden="true">
          <BrandLogo size={20} />
        </span>
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

function parseFrameKeywords(text: string): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const line of text.split('\n')) {
    const value = line.replace(/\s+/g, ' ').trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    lines.push(value);
  }
  return lines.length ? lines : mergeSettings(undefined).recording.frameKeywords;
}

function sameAllowlist(a: string[], b: string[]): boolean {
  return sameStringArray(a, b);
}

function sameStringArray(a: string[], b: string[]): boolean {
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
  for (const k of Object.keys(a.transcription) as Array<keyof Settings['transcription']>) {
    if (a.transcription[k] !== b.transcription[k]) return false;
  }
  for (const k of Object.keys(a.git) as Array<keyof Settings['git']>) {
    if (a.git[k] !== b.git[k]) return false;
  }
  if (!sameStringArray(a.recording.frameKeywords, b.recording.frameKeywords)) return false;
  return true;
}
