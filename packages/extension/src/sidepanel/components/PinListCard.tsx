import type { PinForPage } from '../../common/types.js';

export function PinListCard({
  pins,
  editingId,
  editDraft,
  onEditDraftChange,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onDelete,
  busyEditId,
  busyDeleteId,
}: {
  pins: PinForPage[];
  editingId: string | null;
  editDraft: string;
  onEditDraftChange: (v: string) => void;
  onStartEdit: (p: PinForPage) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (p: PinForPage) => void;
  busyEditId: string | null;
  busyDeleteId: string | null;
}): JSX.Element {
  return (
    <section className="card">
      <div className="card-header">
        <span className="card-eyebrow">Annotations</span>
        <span className="session-meta">{pins.length} on this page</span>
      </div>
      {pins.length === 0 ? (
        <p className="card-text muted">
          None yet — start the picker and click an element on the page.
        </p>
      ) : (
        <ul className="pin-list">
          {pins.map((p) => (
            <PinItem
              key={p.id}
              pin={p}
              isEditing={editingId === p.id}
              editDraft={editDraft}
              onEditDraftChange={onEditDraftChange}
              onStartEdit={onStartEdit}
              onCommitEdit={onCommitEdit}
              onCancelEdit={onCancelEdit}
              onDelete={onDelete}
              busyEdit={busyEditId === p.id}
              busyDelete={busyDeleteId === p.id}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function PinItem({
  pin,
  isEditing,
  editDraft,
  onEditDraftChange,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onDelete,
  busyEdit,
  busyDelete,
}: {
  pin: PinForPage;
  isEditing: boolean;
  editDraft: string;
  onEditDraftChange: (v: string) => void;
  onStartEdit: (p: PinForPage) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (p: PinForPage) => void;
  busyEdit: boolean;
  busyDelete: boolean;
}): JSX.Element {
  const ord = String(pin.ordinal).padStart(2, '0');
  const comment = (pin.commentPreview ?? '').trim();
  if (isEditing) {
    return (
      <li className="pin-item">
        <form
          className="pin-edit"
          onSubmit={(e) => {
            e.preventDefault();
            onCommitEdit();
          }}
        >
          <textarea
            autoFocus
            className="inline-textarea"
            value={editDraft}
            placeholder="Comment"
            onChange={(e) => onEditDraftChange(e.target.value)}
          />
          <div className="card-actions inline">
            <button type="submit" className="btn btn-primary" disabled={busyEdit}>
              {busyEdit ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onCancelEdit}>
              Cancel
            </button>
          </div>
        </form>
      </li>
    );
  }
  return (
    <li className="pin-item">
      <div className="pin-row">
        <span className="pin-ord">#{ord}</span>
        <span className={`pin-comment ${comment ? '' : 'muted'}`}>{comment || '(no comment)'}</span>
        <span className="pin-actions">
          <button
            type="button"
            className="icon-btn-sm"
            onClick={() => onStartEdit(pin)}
            title="Edit comment"
          >
            Edit
          </button>
          <button
            type="button"
            className="icon-btn-sm is-danger"
            onClick={() => onDelete(pin)}
            disabled={busyDelete}
            title="Delete annotation"
          >
            {busyDelete ? '…' : 'Delete'}
          </button>
        </span>
      </div>
    </li>
  );
}
