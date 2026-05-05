import { useEffect, useRef, useState } from 'react';
import type { LocalePreference, ThemePreference } from '../../common/settings.js';
import { useT } from '../../common/i18n/index.js';

export function Head({
  onOpenSettings,
  onShowOnboarding,
  theme,
  onThemeChange,
  locale,
  onLocaleChange,
}: {
  onOpenSettings: () => void;
  onShowOnboarding: () => void;
  theme: ThemePreference;
  onThemeChange: (t: ThemePreference) => void;
  locale: LocalePreference;
  onLocaleChange: (l: LocalePreference) => void;
}): JSX.Element {
  const t = useT();
  return (
    <header className="head">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">DOMPin</span>
      </div>
      <div className="head-actions">
        <OverflowMenu
          theme={theme}
          onThemeChange={onThemeChange}
          locale={locale}
          onLocaleChange={onLocaleChange}
          onOpenSettings={onOpenSettings}
          onShowOnboarding={onShowOnboarding}
          ariaLabel={t.head.menu.open}
        />
      </div>
    </header>
  );
}

function OverflowMenu({
  theme,
  onThemeChange,
  locale,
  onLocaleChange,
  onOpenSettings,
  onShowOnboarding,
  ariaLabel,
}: {
  theme: ThemePreference;
  onThemeChange: (t: ThemePreference) => void;
  locale: LocalePreference;
  onLocaleChange: (l: LocalePreference) => void;
  onOpenSettings: () => void;
  onShowOnboarding: () => void;
  ariaLabel: string;
}): JSX.Element {
  const t = useT();
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

  const close = () => setOpen(false);

  return (
    <div className="menu-wrap" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        title={ariaLabel}
      >
        <DotsIcon />
      </button>
      {open ? (
        <div className="menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              close();
              onOpenSettings();
            }}
          >
            {t.head.menu.settings}
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              close();
              onShowOnboarding();
            }}
          >
            {t.head.menu.onboarding}
          </button>
          <div className="menu-sep" role="separator" />
          <div className="menu-group-label">{t.head.menu.themeLabel}</div>
          <ChoiceItem
            label={t.head.menu.themeAuto}
            checked={theme === 'auto'}
            onClick={() => onThemeChange('auto')}
          />
          <ChoiceItem
            label={t.head.menu.themeLight}
            checked={theme === 'light'}
            onClick={() => onThemeChange('light')}
          />
          <ChoiceItem
            label={t.head.menu.themeDark}
            checked={theme === 'dark'}
            onClick={() => onThemeChange('dark')}
          />
          <div className="menu-sep" role="separator" />
          <div className="menu-group-label">{t.head.menu.languageLabel}</div>
          <ChoiceItem
            label={t.head.menu.languageAuto}
            checked={locale === 'auto'}
            onClick={() => onLocaleChange('auto')}
          />
          <ChoiceItem
            label={t.head.menu.languageEn}
            checked={locale === 'en'}
            onClick={() => onLocaleChange('en')}
          />
          <ChoiceItem
            label={t.head.menu.languageEs}
            checked={locale === 'es'}
            onClick={() => onLocaleChange('es')}
          />
        </div>
      ) : null}
    </div>
  );
}

function ChoiceItem({
  label,
  checked,
  onClick,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      className={`menu-item menu-item-choice ${checked ? 'is-checked' : ''}`}
      onClick={onClick}
    >
      <span className="menu-check" aria-hidden="true">
        {checked ? '✓' : ''}
      </span>
      <span>{label}</span>
    </button>
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
  const t = useT();
  const text = !configured
    ? t.foot.notConfigured
    : unreachable
      ? t.foot.unreachable(rootName ?? '—')
      : t.foot.vault(rootName ?? '—');
  return (
    <footer className="foot">
      <span className="foot-meta">{text}</span>
      <div className="foot-actions">
        <button
          type="button"
          className="icon-btn icon-btn-tiny"
          onClick={onChangeVault}
          disabled={busyChange}
          aria-label={t.foot.changeVault}
          title={t.foot.changeVault}
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
  const t = useT();
  return (
    <div className="banner banner-error">
      <span className="dot" aria-hidden="true" />
      <span className="banner-text">{message}</span>
      <button type="button" className="banner-action" onClick={onDismiss}>
        {t.banner.error.dismiss}
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
  const t = useT();
  return (
    <div className="banner banner-error" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="dot" aria-hidden="true" />
        <span className="banner-text">
          {t.banner.unreachable.message}
          {reason ? ` (${reason})` : ''}
        </span>
      </div>
      <div className="card-actions inline" style={{ marginTop: 8 }}>
        <button type="button" className="btn btn-primary" onClick={onPickAnother}>
          {t.banner.unreachable.pickAnother}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onReconnect}>
          {t.banner.unreachable.reconnect}
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
