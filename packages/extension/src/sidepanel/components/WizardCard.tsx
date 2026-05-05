import { useT } from '../../common/i18n/index.js';

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
  const t = useT();
  return (
    <section className="wizard">
      <div className="wizard-head">
        <h2 className="wizard-title">{t.wizard.title}</h2>
        {onClose ? (
          <button type="button" className="link-btn" onClick={onClose}>
            {t.wizard.close}
          </button>
        ) : null}
      </div>
      <p className="wizard-intro">{t.wizard.intro}</p>

      <ol className="wizard-steps">
        <Step n={1} title={t.wizard.step1Title} done={vaultConfigured}>
          <p className="tip">{t.wizard.step1Tip}</p>
          <div className="card-actions">
            <button
              type="button"
              className={`btn ${vaultConfigured ? 'btn-secondary' : 'btn-primary'}`}
              onClick={onPick}
              disabled={busy}
            >
              {busy
                ? t.wizard.choosing
                : vaultConfigured
                  ? t.wizard.changeFolder
                  : t.wizard.chooseFolder}
            </button>
          </div>
        </Step>

        <Step n={2} title={t.wizard.step2Title}>
          <p className="tip">
            {t.wizard.step2Tip}
            <strong>{t.wizard.step2TipBold}</strong>
            {t.wizard.step2TipRest}
            <code>{t.wizard.step2TipPath}</code>
            {t.wizard.step2TipDot}
          </p>
        </Step>

        <Step n={3} title={t.wizard.step3Title}>
          <p className="tip">
            {t.wizard.step3Tip}
            <strong>{t.wizard.step3TipBold}</strong>
            {t.wizard.step3TipRest}
            <span className="kbd">{t.wizard.step3TipKey}</span>
            {t.wizard.step3TipDot}
          </p>
        </Step>

        <Step n={4} title={t.wizard.step4Title}>
          <p className="tip">
            {t.wizard.step4Tip}
            <span className="kbd">{t.wizard.step4TipMac}</span>
            {t.wizard.step4TipMacAfter}
            <span className="kbd">{t.wizard.step4TipWin}</span>
            {t.wizard.step4TipWinAfter}
            <em>{t.wizard.step4TipEm}</em>
            {t.wizard.step4TipRest}
          </p>
        </Step>

        <Step n={5} title={t.wizard.step5Title}>
          <p className="tip">{t.wizard.step5Tip}</p>
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
  const t = useT();
  return (
    <section className="card">
      <div className="banner banner-pending" style={{ margin: 0 }}>
        <span className="dot" aria-hidden="true" />
        <span className="banner-text">{t.reconnect.message}</span>
      </div>
      {rootName ? <p className="card-text">{t.reconnect.last(rootName)}</p> : null}
      <div className="card-actions">
        <button type="button" className="btn btn-primary" onClick={onReconnect} disabled={busy}>
          {busy ? t.reconnect.reconnecting : t.reconnect.reconnect}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onChangeFolder}>
          {t.reconnect.changeFolder}
        </button>
      </div>
    </section>
  );
}
