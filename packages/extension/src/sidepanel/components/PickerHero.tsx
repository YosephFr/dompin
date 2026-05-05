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
  const label = state === 'on' ? 'Picking on' : state === 'paused' ? 'Picker paused' : 'Picker off';
  const buttonLabel =
    state === 'on' ? 'Stop picking' : state === 'paused' ? 'Resume picking' : 'Start picking';
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
        {busy ? 'Working…' : buttonLabel}
      </button>
      <p className="hero-hint">
        <span className="kbd">⌘ ⇧ .</span> &nbsp;or right-click an element for one-off
      </p>
    </section>
  );
}
