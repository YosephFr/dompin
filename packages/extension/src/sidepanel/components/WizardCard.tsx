export function WizardCard({
  busy,
  onPick,
  vaultConfigured,
  onClose,
}: {
  busy: boolean;
  onPick: () => void;
  vaultConfigured: boolean;
  onClose?: () => void;
}): JSX.Element {
  return (
    <section className="wizard">
      <div className="wizard-head">
        <h2 className="wizard-title">Welcome to DOMPin</h2>
        {onClose ? (
          <button type="button" className="link-btn" onClick={onClose}>
            Close
          </button>
        ) : null}
      </div>
      <p className="wizard-intro">
        Pin elements on any page, jot a comment, and DOMPin saves a Markdown file plus screenshots
        to a folder you choose. Drop the folder into your AI coding agent and it has all the context
        it needs.
      </p>

      <ol className="wizard-steps">
        <Step n={1} title="Pick a folder for your annotations" done={vaultConfigured}>
          <p className="tip">
            You only do this once. The extension remembers it across sessions. You can change it
            later from the pencil icon at the bottom.
          </p>
          <div className="card-actions">
            <button
              type="button"
              className={`btn ${vaultConfigured ? 'btn-secondary' : 'btn-primary'}`}
              onClick={onPick}
              disabled={busy}
            >
              {busy ? 'Choosing…' : vaultConfigured ? 'Change folder…' : 'Choose folder…'}
            </button>
          </div>
        </Step>

        <Step n={2} title="Open a tab and start a named session">
          <p className="tip">
            Each tab gets its own session. Click <strong>Start new session</strong> in the Session
            card and give it a name. Your annotations live in{' '}
            <code>&lt;folder&gt;/&lt;domain&gt;/&lt;session&gt;/</code>.
          </p>
        </Step>

        <Step n={3} title="Pick elements with the picker">
          <p className="tip">
            Once a session is active, hit <strong>Start picking</strong> and click any element on
            the page — chain as many as you want, the picker stays on. Stop with the button or{' '}
            <span className="kbd">Esc</span>.
          </p>
        </Step>

        <Step n={4} title="Or capture a single element on the fly">
          <p className="tip">
            Press <span className="kbd">⌘ ⇧ .</span> (Mac) or <span className="kbd">Ctrl ⇧ .</span>{' '}
            (Win/Linux) to pick one element and auto-stop. Or right-click any element and choose{' '}
            <em>Annotate element with DOMPin</em> — perfect for hover menus that disappear when you
            click elsewhere.
          </p>
        </Step>

        <Step n={5} title="Type your comment, hit Enter">
          <p className="tip">
            You'll see a numbered marker on the element and the file appears immediately in your
            session folder.
          </p>
        </Step>
      </ol>
    </section>
  );
}

function Step({
  n,
  title,
  done,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <li className={`wizard-step ${done ? 'is-done' : ''}`}>
      <div className="wizard-step-row">
        <span className="wizard-num" aria-hidden="true">
          {done ? '✓' : n}
        </span>
        <h3 className="wizard-step-title">{title}</h3>
      </div>
      <div className="wizard-step-body">{children}</div>
    </li>
  );
}

export function ReconnectCard({
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
    <section className="card">
      <div className="banner banner-pending" style={{ margin: 0 }}>
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
