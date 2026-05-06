import { useEffect, useRef, useState } from 'react';

export interface KebabItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export function KebabMenu({
  items,
  ariaLabel,
  size = 'md',
}: {
  items: KebabItem[];
  ariaLabel: string;
  size?: 'sm' | 'md';
}): JSX.Element {
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
  const btnClass = size === 'sm' ? 'icon-btn icon-btn-tiny' : 'icon-btn';

  return (
    <div className="menu-wrap" ref={ref}>
      <button
        type="button"
        className={btnClass}
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
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className={`menu-item ${it.danger ? 'is-danger' : ''}`}
              disabled={it.disabled}
              onClick={() => {
                close();
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

function DotsIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="3.5" cy="8" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="12.5" cy="8" r="1.5" />
    </svg>
  );
}
