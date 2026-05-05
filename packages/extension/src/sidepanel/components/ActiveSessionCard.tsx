import type { FormEvent } from 'react';
import type { Session } from '../../common/types.js';
import { relativeTime, type Busy } from '../utils.js';

export function ActiveSessionCard({
  session,
  domain,
  busy,
  renameDraft,
  newDraft,
  onStartNew,
  onCommitNew,
  onCancelNew,
  onNewDraftChange,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onRenameDraftChange,
  onEndSession,
}: {
  session: Session | null;
  domain: string | null;
  busy: Busy;
  renameDraft: string | null;
  newDraft: string | null;
  onStartNew: () => void;
  onCommitNew: (name: string | null) => void;
  onCancelNew: () => void;
  onNewDraftChange: (v: string) => void;
  onStartRename: () => void;
  onCommitRename: (e: FormEvent) => void;
  onCancelRename: () => void;
  onRenameDraftChange: (v: string) => void;
  onEndSession: () => void;
}): JSX.Element {
  return (
    <section className="card">
      <div className="card-header">
        <span className="card-eyebrow">Session</span>
        {session ? (
          <span className="session-meta">
            {relativeTime(session.lastWriteAt ?? session.startedAt)}
          </span>
        ) : null}
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
          busy={busy}
          onStartNew={onStartNew}
          onStartRename={onStartRename}
          onEndSession={onEndSession}
        />
      ) : (
        <EmptySessionInfo domain={domain} onStartNew={onStartNew} />
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
  busy,
  onStartNew,
  onStartRename,
  onEndSession,
}: {
  session: Session;
  domain: string | null;
  busy: Busy;
  onStartNew: () => void;
  onStartRename: () => void;
  onEndSession: () => void;
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
          {session.annotationCount} pin{session.annotationCount === 1 ? '' : 's'}
        </span>
      </div>
      <div className="card-actions">
        <button type="button" className="btn btn-secondary" onClick={onStartNew}>
          New session
        </button>
        <button type="button" className="btn btn-ghost" onClick={onStartRename}>
          Rename
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onEndSession}
          disabled={busy === 'archive'}
          title="Stop writing to this session. Files stay where they are."
        >
          End session
        </button>
      </div>
    </>
  );
}

function EmptySessionInfo({
  domain,
  onStartNew,
}: {
  domain: string | null;
  onStartNew: () => void;
}): JSX.Element {
  return (
    <>
      <div className="session-name session-name-empty">No session yet</div>
      <p className="card-text">
        {domain
          ? `Pin an element on ${domain} to start a session here.`
          : 'Open a regular tab to start a session.'}
      </p>
      <div className="card-actions">
        <button type="button" className="btn btn-secondary" onClick={onStartNew}>
          Name session…
        </button>
      </div>
    </>
  );
}
