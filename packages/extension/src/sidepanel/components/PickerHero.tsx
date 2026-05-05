import { useT } from '../../common/i18n/index.js';

export type PickerState = 'off' | 'on' | 'paused';

export function PickerHero({
  state,
  busy,
  onToggle,
}: {
  state: PickerState;
  busy: boolean;
  onToggle: () => void;
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
        <span className="hero-dot" aria-hidden="true" />
        <span className="hero-label">{label}</span>
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
