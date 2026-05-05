export function WizardCard({ busy, onPick }: { busy: boolean; onPick: () => void }): JSX.Element {
  return (
    <section className="card">
      <h2 className="card-title">Welcome to DOMPin</h2>
      <p className="card-text">
        Pin elements on any page, jot a comment, and DOMPin saves a Markdown file plus screenshots
        to a folder you choose. Drop the folder into your AI coding agent and it has all the context
        it needs.
      </p>
      <div className="wizard-step">
        <div className="wizard-step-row">
          <span className="wizard-num">1</span>
          <strong>Pick a folder for your annotations</strong>
        </div>
        <p className="tip">
          You only do this once. The extension remembers it across sessions. You can change it later
          from settings.
        </p>
        <div className="card-actions">
          <button type="button" className="btn btn-primary" onClick={onPick} disabled={busy}>
            {busy ? 'Choosing…' : 'Choose folder…'}
          </button>
        </div>
      </div>
      <div className="wizard-step">
        <div className="wizard-step-row">
          <span className="wizard-num">2</span>
          <strong>Click the icon on any page to start picking</strong>
        </div>
        <p className="tip">
          Or hit <span className="kbd">⌘ ⇧ .</span> (Mac) / <span className="kbd">Ctrl ⇧ .</span>{' '}
          (Win/Linux). Right-click any element and pick "Annotate element with DOMPin" to capture it
          without dismissing modals.
        </p>
      </div>
      <div className="wizard-step">
        <div className="wizard-step-row">
          <span className="wizard-num">3</span>
          <strong>Type your comment, hit Enter</strong>
        </div>
        <p className="tip">
          You'll see a numbered marker on the element. Files appear immediately under{' '}
          <code>&lt;your folder&gt;/&lt;domain&gt;/&lt;session&gt;/</code>.
        </p>
      </div>
    </section>
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
