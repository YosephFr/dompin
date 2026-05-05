import { useEffect, useMemo, useState } from 'react';
import type { ExtensionState } from '../common/messaging.js';
import { sendRequest } from '../common/messaging.js';
import {
  DEFAULT_SETTINGS,
  validateHost,
  validatePath,
  validatePort,
  type Settings,
} from '../common/settings.js';

type TestStatus =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; serverVersion: string; protocolVersion: string }
  | { kind: 'error'; message: string };

export function App(): JSX.Element {
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saved, setSaved] = useState<Settings | null>(null);
  const [test, setTest] = useState<TestStatus>({ kind: 'idle' });
  const [savedTick, setSavedTick] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await sendRequest<{ state: ExtensionState }>({ kind: 'state:get' });
      if (r.ok) {
        setDraft(r.state.settings);
        setSaved(r.state.settings);
      } else {
        setDraft(DEFAULT_SETTINGS);
        setSaved(DEFAULT_SETTINGS);
      }
    })();
  }, []);

  const errors = useMemo(() => validateAll(draft), [draft]);
  const dirty = useMemo(() => {
    if (!draft || !saved) return false;
    return JSON.stringify(draft) !== JSON.stringify(saved);
  }, [draft, saved]);
  const canSave = dirty && Object.keys(errors).length === 0;

  if (!draft) {
    return <div className="loading">Loading…</div>;
  }

  const update = (patch: Partial<Settings> | ((s: Settings) => Settings)) => {
    setSavedTick(false);
    setDraft((prev) =>
      prev == null
        ? prev
        : typeof patch === 'function'
          ? patch(prev)
          : { ...prev, ...patch },
    );
  };

  const handleSave = async () => {
    if (!canSave || !draft) return;
    const r = await sendRequest({ kind: 'settings:save', settings: draft });
    if (r.ok) {
      setSaved(draft);
      setSavedTick(true);
      window.setTimeout(() => setSavedTick(false), 2000);
    }
  };

  const handleReset = () => {
    setDraft({ ...DEFAULT_SETTINGS });
  };

  const handleTest = async () => {
    if (!draft) return;
    setTest({ kind: 'testing' });
    const r = await sendRequest<{ serverVersion: string; protocolVersion: string }>({
      kind: 'test-connection',
      settings: draft,
    });
    if (r.ok) {
      setTest({
        kind: 'ok',
        serverVersion: r.serverVersion,
        protocolVersion: r.protocolVersion,
      });
    } else {
      setTest({ kind: 'error', message: r.error });
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <h1>DOMPin Settings</h1>
        </div>
        <p className="subtitle">
          Local connection to the DOMPin MCP server, capture preferences, and per-domain access.
        </p>
      </header>

      <Section title="Server connection">
        <div className="grid">
          <Field label="Host" error={errors.host}>
            <input
              type="text"
              value={draft.ws.host}
              onChange={(e) =>
                update((s) => ({ ...s, ws: { ...s.ws, host: e.target.value } }))
              }
              spellCheck={false}
              autoComplete="off"
            />
          </Field>
          <Field label="Port" error={errors.port}>
            <input
              type="number"
              min={1}
              max={65535}
              value={draft.ws.port}
              onChange={(e) =>
                update((s) => ({ ...s, ws: { ...s.ws, port: Number(e.target.value) } }))
              }
            />
          </Field>
          <Field label="Path" error={errors.path}>
            <input
              type="text"
              value={draft.ws.path}
              onChange={(e) =>
                update((s) => ({ ...s, ws: { ...s.ws, path: e.target.value } }))
              }
              spellCheck={false}
              autoComplete="off"
            />
          </Field>
        </div>
        <div className="row">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleTest}
            disabled={Object.keys(errors).length > 0}
          >
            {test.kind === 'testing' ? 'Testing…' : 'Test connection'}
          </button>
          {test.kind === 'ok' ? (
            <span className="status-ok">
              Server v{test.serverVersion} · protocol {test.protocolVersion}
            </span>
          ) : null}
          {test.kind === 'error' ? <span className="status-error">{test.message}</span> : null}
        </div>
      </Section>

      <Section title="Allowed domains">
        <p className="section-hint">
          Limit where DOMPin runs. Use <code>*</code> to allow every site, or wildcards like
          <code> *.example.com</code>. One pattern per line.
        </p>
        <textarea
          className="textarea"
          rows={5}
          spellCheck={false}
          value={draft.allowlist.join('\n')}
          onChange={(e) =>
            update((s) => ({
              ...s,
              allowlist: e.target.value.split(/\n+/).map((l) => l.trim()).filter(Boolean),
            }))
          }
        />
      </Section>

      <Section title="Capture options">
        <Toggle
          label="Capture recent network failures"
          description="Include failed network requests in each annotation payload."
          checked={draft.flags.captureNetworkFailures}
          onChange={(v) =>
            update((s) => ({ ...s, flags: { ...s.flags, captureNetworkFailures: v } }))
          }
        />
        <Toggle
          label="Voice memos"
          description="Use the browser's speech recognition to dictate the comment."
          checked={draft.flags.enableWebSpeech}
          onChange={(v) =>
            update((s) => ({ ...s, flags: { ...s.flags, enableWebSpeech: v } }))
          }
        />
        <Toggle
          label="React Fiber introspection"
          description="Read component name, owner chain, and props from React internals when present."
          checked={draft.flags.enableReactFiber}
          onChange={(v) =>
            update((s) => ({ ...s, flags: { ...s.flags, enableReactFiber: v } }))
          }
        />
      </Section>

      <footer className="page-footer">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={handleReset}
          disabled={!dirty && JSON.stringify(draft) === JSON.stringify(DEFAULT_SETTINGS)}
        >
          Reset to defaults
        </button>
        <div className="footer-spacer" />
        {savedTick ? <span className="status-ok">Saved</span> : null}
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSave}
          disabled={!canSave}
        >
          Save changes
        </button>
      </footer>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <label className={`field${error ? ' field-error' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-message">{error}</span> : null}
    </label>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}): JSX.Element {
  return (
    <label className="toggle">
      <div className="toggle-text">
        <span className="toggle-label">{label}</span>
        <span className="toggle-description">{description}</span>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="toggle-input"
      />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
    </label>
  );
}

function validateAll(draft: Settings | null): Record<string, string> {
  if (!draft) return {};
  const out: Record<string, string> = {};
  const h = validateHost(draft.ws.host);
  if (h) out.host = h;
  const p = validatePort(draft.ws.port);
  if (p) out.port = p;
  const pp = validatePath(draft.ws.path);
  if (pp) out.path = pp;
  return out;
}
