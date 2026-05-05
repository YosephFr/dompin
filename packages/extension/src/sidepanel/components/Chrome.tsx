import { useEffect, useRef, useState } from 'react';

export interface MenuAction {
  id: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

export function Head({
  onOpenSettings,
  onShowOnboarding,
}: {
  onOpenSettings: () => void;
  onShowOnboarding: () => void;
}): JSX.Element {
  const items: MenuAction[] = [
    { id: 'settings', label: 'Open settings', onClick: onOpenSettings },
    { id: 'onboarding', label: 'Show onboarding', onClick: onShowOnboarding },
  ];

  return (
    <header className="head">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">DOMPin</span>
      </div>
      <div className="head-actions">
        <OverflowMenu items={items} />
      </div>
    </header>
  );
}

function OverflowMenu({ items }: { items: MenuAction[] }): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu-wrap" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open menu"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Menu"
      >
        <DotsIcon />
      </button>
      {open ? (
        <div className="menu" role="menu">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              role="menuitem"
              className={`menu-item ${it.danger ? 'is-danger' : ''}`}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Foot({
  rootName,
  configured,
  unreachable,
  onChangeVault,
  busyChange,
}: {
  rootName: string | null;
  configured: boolean;
  unreachable: boolean;
  onChangeVault: () => void;
  busyChange: boolean;
}): JSX.Element {
  return (
    <footer className="foot">
      <span className="foot-meta">
        {!configured
          ? 'Vault not configured'
          : unreachable
            ? `Vault unreachable: ${rootName ?? '—'}`
            : `Vault: ${rootName ?? '—'}`}
      </span>
      <div className="foot-actions">
        <button
          type="button"
          className="icon-btn icon-btn-tiny"
          onClick={onChangeVault}
          disabled={busyChange}
          aria-label="Change vault folder"
          title="Change vault folder"
        >
          <PencilIcon />
        </button>
        <span className={`foot-dot ${configured && !unreachable ? 'is-ok' : 'is-warn'}`}>
          {configured && !unreachable ? '●' : '○'}
        </span>
      </div>
    </footer>
  );
}

export function ErrorBanner({
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

export function UnreachableBanner({
  reason,
  onPickAnother,
  onReconnect,
}: {
  reason: string | null;
  onPickAnother: () => void;
  onReconnect: () => void;
}): JSX.Element {
  return (
    <div className="banner banner-error" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="dot" aria-hidden="true" />
        <span className="banner-text">
          Vault folder is unreachable. It may have been moved or deleted.
          {reason ? ` (${reason})` : ''}
        </span>
      </div>
      <div className="card-actions inline" style={{ marginTop: 8 }}>
        <button type="button" className="btn btn-primary" onClick={onPickAnother}>
          Pick a new folder
        </button>
        <button type="button" className="btn btn-secondary" onClick={onReconnect}>
          Try reconnect
        </button>
      </div>
    </div>
  );
}

function DotsIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="3.5" cy="8" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="12.5" cy="8" r="1.5" />
    </svg>
  );
}

function PencilIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11.4 2.6a1.5 1.5 0 0 1 2.1 2.1L5 13.2l-3 .8.8-3z" />
      <path d="m10.5 3.5 2 2" />
    </svg>
  );
}
