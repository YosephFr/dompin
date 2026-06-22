import { useT } from '../../common/i18n/index.js';

export type PickerState = 'off' | 'on' | 'paused';

export function PickerHero({
  state,
  busy,
  markersVisible,
  onToggle,
  onToggleMarkers,
}: {
  state: PickerState;
  busy: boolean;
  markersVisible: boolean;
  onToggle: () => void;
  onToggleMarkers: () => void;
}): JSX.Element {
  const t = useT();
  const label =
    state === 'on' ? t.hero.pickerOn : state === 'paused' ? t.hero.pickerPaused : t.hero.pickerOff;
  const buttonLabel =
    state === 'on' ? t.hero.stop : state === 'paused' ? t.hero.resume : t.hero.start;
  const buttonClass = state === 'on' ? 'btn btn-danger-solid' : 'btn btn-primary';

  return (
    <section className={`hero hero-picker is-${state}`}>
      <div className="hero-row">
        <span className="hero-status">
          <span className="hero-dot" aria-hidden="true" />
          <span className="hero-label">{label}</span>
        </span>
        <button
          type="button"
          className={`hero-icon-btn ${markersVisible ? '' : 'is-muted'}`}
          aria-label={markersVisible ? t.hero.hidePins : t.hero.showPins}
          title={markersVisible ? t.hero.hidePins : t.hero.showPins}
          onClick={onToggleMarkers}
        >
          {markersVisible ? <EyeIcon /> : <EyeOffIcon />}
        </button>
      </div>
      <button
        type="button"
        className={`hero-btn ${buttonClass}`}
        onClick={onToggle}
        disabled={busy}
      >
        {busy ? t.hero.working : buttonLabel}
      </button>
      <p className="hero-hint">
        <span className="kbd">⌘ ⇧ .</span> &nbsp;{t.hero.hint}
      </p>
    </section>
  );
}

function EyeIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m3 3 18 18" />
      <path d="M9.9 5.4A10.4 10.4 0 0 1 12 5c6 0 9.5 7 9.5 7a16 16 0 0 1-3 3.9" />
      <path d="M6.5 6.9C3.9 8.5 2.5 12 2.5 12s3.5 7 9.5 7a9.8 9.8 0 0 0 4-.8" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}
