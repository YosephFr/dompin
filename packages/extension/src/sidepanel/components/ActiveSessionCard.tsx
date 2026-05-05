import { forwardRef, type FormEvent } from 'react';
import type { Session } from '../../common/types.js';
import { relativeTime, type Busy } from '../utils.js';
import { useT } from '../../common/i18n/index.js';

export interface ActiveSessionCardProps {
  flash?: boolean;
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
}

export const ActiveSessionCard = forwardRef<HTMLElement, ActiveSessionCardProps>(
  function ActiveSessionCard(
    {
      flash,
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
    },
    ref,
  ): JSX.Element {
    const t = useT();
    return (
      <section ref={ref} className={`card session-card ${flash ? 'is-flashing' : ''}`}>
        <div className="card-header">
          <span className="card-eyebrow">{t.session.eyebrow}</span>
          {session ? (
            <span className="session-meta">
              {relativeTime(session.lastWriteAt ?? session.startedAt, t)}
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
  },
);

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
  const t = useT();
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
        placeholder={t.session.namePlaceholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="card-actions inline">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? t.session.creating : t.session.create}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t.session.cancel}
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
  const t = useT();
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
          {busy ? t.session.saving : t.session.save}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t.session.cancel}
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
  const t = useT();
  return (
    <>
      <div className="session-name">{session.name}</div>
      <div className="session-sub">
        <span className="session-domain">{session.domain || domain || t.session.unknownHost}</span>
        <span className="session-dot" aria-hidden="true">
          ·
        </span>
        <span>{t.session.pinCount(session.annotationCount)}</span>
      </div>
      <div className="card-actions">
        <button type="button" className="btn btn-secondary" onClick={onStartNew}>
          {t.session.newButton}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onStartRename}>
          {t.session.rename}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onEndSession}
          disabled={busy === 'archive'}
          title={t.session.endTooltip}
        >
          {t.session.end}
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
  const t = useT();
  return (
    <>
      <div className="session-name session-name-empty">{t.session.none}</div>
      <p className="card-text">
        {domain ? t.session.nonePromptDomain(domain) : t.session.nonePromptNoDomain}
      </p>
      <div className="card-actions">
        <button type="button" className="btn btn-primary" onClick={onStartNew} disabled={!domain}>
          {t.session.startNew}
        </button>
      </div>
    </>
  );
}
