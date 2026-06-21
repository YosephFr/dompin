import type { PinForPage } from '../../common/types.js';
import { useT } from '../../common/i18n/index.js';

export function PinListCard({
  currentPins,
  otherPins,
  onFocus,
  onStartEdit,
  onDelete,
  busyEditId,
  busyDeleteId,
}: {
  currentPins: PinForPage[];
  otherPins: PinForPage[];
  onFocus: (p: PinForPage) => void;
  onStartEdit: (p: PinForPage) => void;
  onDelete: (p: PinForPage) => void;
  busyEditId: string | null;
  busyDeleteId: string | null;
}): JSX.Element {
  const t = useT();
  const total = currentPins.length + otherPins.length;
  return (
    <section className="card">
      <div className="card-header">
        <span className="card-eyebrow">{t.pins.eyebrow}</span>
        <span className="session-meta">{t.pins.inSession(total)}</span>
      </div>
      {total === 0 ? (
        <p className="card-text muted">{t.pins.emptySession}</p>
      ) : (
        <div className="pin-groups">
          <PinGroup
            title={t.pins.currentView}
            countLabel={t.pins.onThisPage(currentPins.length)}
            pins={currentPins}
            onFocus={onFocus}
            onStartEdit={onStartEdit}
            onDelete={onDelete}
            busyEditId={busyEditId}
            busyDeleteId={busyDeleteId}
            emptyText={t.pins.empty}
          />
          {otherPins.length ? (
            <PinGroup
              title={t.pins.otherViews}
              countLabel={String(otherPins.length)}
              pins={otherPins}
              onFocus={onFocus}
              onStartEdit={onStartEdit}
              onDelete={onDelete}
              busyEditId={busyEditId}
              busyDeleteId={busyDeleteId}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}

function PinGroup({
  title,
  countLabel,
  pins,
  onFocus,
  onStartEdit,
  onDelete,
  busyEditId,
  busyDeleteId,
  emptyText,
}: {
  title: string;
  countLabel: string;
  pins: PinForPage[];
  onFocus: (p: PinForPage) => void;
  onStartEdit: (p: PinForPage) => void;
  onDelete: (p: PinForPage) => void;
  busyEditId: string | null;
  busyDeleteId: string | null;
  emptyText?: string;
}): JSX.Element {
  return (
    <div className="pin-group">
      <div className="pin-group-head">
        <span>{title}</span>
        <span>{countLabel}</span>
      </div>
      {pins.length === 0 ? (
        <p className="card-text muted">{emptyText}</p>
      ) : (
        <ul className="pin-list">
          {pins.map((p) => (
            <PinItem
              key={p.id}
              pin={p}
              onFocus={onFocus}
              onStartEdit={onStartEdit}
              onDelete={onDelete}
              busyEdit={busyEditId === p.id}
              busyDelete={busyDeleteId === p.id}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function PinItem({
  pin,
  onFocus,
  onStartEdit,
  onDelete,
  busyEdit,
  busyDelete,
}: {
  pin: PinForPage;
  onFocus: (p: PinForPage) => void;
  onStartEdit: (p: PinForPage) => void;
  onDelete: (p: PinForPage) => void;
  busyEdit: boolean;
  busyDelete: boolean;
}): JSX.Element {
  const t = useT();
  const ord = String(pin.ordinal).padStart(2, '0');
  const comment = (pin.comment || pin.commentPreview || '').trim();
  return (
    <li className="pin-item">
      <button type="button" className="pin-row pin-row-button" onClick={() => onFocus(pin)}>
        <span className="pin-ord">#{ord}</span>
        <span className={`pin-comment ${comment ? '' : 'muted'}`}>
          {comment || t.pins.noComment}
        </span>
      </button>
      {pin.pageTitle ? <div className="pin-page">{t.pins.viewLabel(pin.pageTitle)}</div> : null}
      <span className="pin-actions">
        <button
          type="button"
          className="icon-btn-sm"
          onClick={() => onStartEdit(pin)}
          disabled={busyEdit}
          title={t.pins.edit}
        >
          {busyEdit ? '…' : t.pins.edit}
        </button>
        <button
          type="button"
          className="icon-btn-sm is-danger"
          onClick={() => onDelete(pin)}
          disabled={busyDelete}
          title={t.pins.delete}
        >
          {busyDelete ? '…' : t.pins.delete}
        </button>
      </span>
    </li>
  );
}
