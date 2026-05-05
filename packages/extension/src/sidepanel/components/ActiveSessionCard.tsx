import type { FormEvent } from 'react';
import type { Session } from '../../common/types.js';
import { relativeTime, type Busy } from '../utils.js';

export function ActiveSessionCard({
  session,
  domain,
  pickerOn,
  busy,
  renameDraft,
  newDraft,
  onTogglePicker,
  onStartNew,
  onCommitNew,
  onCancelNew,
  onNewDraftChange,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onRenameDraftChange,
  onArchive,
}: {
  session: Session | null;
  domain: string | null;
  pickerOn: boolean;
  busy: Busy;
  renameDraft: string | null;
  newDraft: string | null;
  onTogglePicker: () => void;
  onStartNew: () => void;
  onCommitNew: (name: string | null) => void;
  onCancelNew: () => void;
  onNewDraftChange: (v: string) => void;
  onStartRename: () => void;
  onCommitRename: (e: FormEvent) => void;
  onCancelRename: () => void;
  onRenameDraftChange: (v: string) => void;
  onArchive: () => void;
}): JSX.Element {
  return (
    <section className="card">
      <div className="card-header">
        <span className="card-eyebrow">Active session</span>
        <span className={`picker-state ${pickerOn ? 'is-on' : ''}`}>
          <span className="picker-dot" aria-hidden="true" />
          {pickerOn ? 'Picker on' : 'Picker off'}
        </span>
      </div>

      {newDraft !== null ? (
        <NewSessionForm
          value={newDraft}
          busy={busy === 'new'}
          onChange={onNewDraftChange}
          onSubmit={onCommitNew}
          onCancel={onCancelNew}
        />
      ) : renameDraft !== null ? (
        <RenameForm
          value={renameDraft}
          busy={busy === 'rename'}
          onChange={onRenameDraftChange}
          onSubmit={onCommitRename}
          onCancel={onCancelRename}
        />
      ) : session ? (
        <ActiveSessionInfo
          session={session}
          domain={domain}
          pickerOn={pickerOn}
          busy={busy}
          onTogglePicker={onTogglePicker}
          onStartNew={onStartNew}
          onStartRename={onStartRename}
          onArchive={onArchive}
        />
      ) : (
        <EmptySessionInfo
          domain={domain}
          pickerOn={pickerOn}
          busy={busy}
          onTogglePicker={onTogglePicker}
          onStartNew={onStartNew}
        />
      )}
    </section>
  );
}

function NewSessionForm({
  value,
  busy,
  onChange,
  onSubmit,
  onCancel,
}: {
  value: string;
  busy: boolean;
  onChange: (v: string) => void;
  onSubmit: (name: string | null) => void;
  onCancel: () => void;
}): JSX.Element {
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        const v = value.trim();
        onSubmit(v.length ? v : null);
      }}
    >
      <input
        autoFocus
        className="inline-input"
        value={value}
        placeholder="Session name (optional)"
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="card-actions inline">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function RenameForm({
  value,
  busy,
  onChange,
  onSubmit,
  onCancel,
}: {
  value: string;
  busy: boolean;
  onChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
}): JSX.Element {
  return (
    <form className="inline-form" onSubmit={onSubmit}>
      <input
        autoFocus
        className="inline-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="card-actions inline">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ActiveSessionInfo({
  session,
  domain,
  pickerOn,
  busy,
  onTogglePicker,
  onStartNew,
  onStartRename,
  onArchive,
}: {
  session: Session;
  domain: string | null;
  pickerOn: boolean;
  busy: Busy;
  onTogglePicker: () => void;
  onStartNew: () => void;
  onStartRename: () => void;
  onArchive: () => void;
}): JSX.Element {
  return (
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
        <span className="session-dot" aria-hidden="true">
          ·
        </span>
        <span className="session-meta">
          {relativeTime(session.lastWriteAt ?? session.startedAt)}
        </span>
      </div>
      <div className="card-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onTogglePicker}
          disabled={busy === 'toggle'}
        >
          {busy === 'toggle' ? 'Working…' : pickerOn ? 'Pause picker' : 'Resume picker'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onStartNew}>
          New session
        </button>
        <button type="button" className="btn btn-ghost" onClick={onStartRename}>
          Rename
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onArchive}
          disabled={busy === 'archive'}
          title="Stop writing to this session"
        >
          Archive
        </button>
      </div>
    </>
  );
}

function EmptySessionInfo({
  domain,
  pickerOn,
  busy,
  onTogglePicker,
  onStartNew,
}: {
  domain: string | null;
  pickerOn: boolean;
  busy: Busy;
  onTogglePicker: () => void;
  onStartNew: () => void;
}): JSX.Element {
  return (
    <>
      <div className="session-name session-name-empty">No session yet</div>
      <p className="card-text">
        {domain
          ? `Pick an element on ${domain} to start a session here.`
          : 'Open a regular tab to start a session.'}
      </p>
      <div className="card-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onTogglePicker}
          disabled={busy === 'toggle'}
        >
          {busy === 'toggle' ? 'Working…' : pickerOn ? 'Pause picker' : 'Start picker'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onStartNew}>
          Name session…
        </button>
      </div>
    </>
  );
}
