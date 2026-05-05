export function Head({ onSettings }: { onSettings: () => void }): JSX.Element {
  return (
    <header className="head">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">DOMPin</span>
      </div>
      <div className="head-actions">
        <button
          type="button"
          className="icon-btn"
          onClick={onSettings}
          title="Settings"
          aria-label="Settings"
        >
          <SettingsIcon />
        </button>
      </div>
    </header>
  );
}

export function Foot({
  rootName,
  configured,
  onSettings,
}: {
  rootName: string | null;
  configured: boolean;
  onSettings: () => void;
}): JSX.Element {
  return (
    <footer className="foot">
      <button type="button" className="link-btn" onClick={onSettings}>
        Open settings
      </button>
      <span className="foot-meta">
        {configured && rootName ? `Vault: ${rootName}` : 'Vault not configured'}
      </span>
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
