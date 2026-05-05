import type { SessionListItem } from '../../common/types.js';
import { relativeTime } from '../utils.js';

export function RecentSessionsCard({
  items,
  activeId,
}: {
  items: SessionListItem[];
  activeId: string | null;
}): JSX.Element {
  const filtered = items.filter((s) => s.id !== activeId).slice(0, 6);
  return (
    <section className="card">
      <div className="card-header">
        <span className="card-eyebrow">Recent sessions</span>
      </div>
      {filtered.length === 0 ? (
        <p className="card-text muted">No other sessions yet for this site.</p>
      ) : (
        <ul className="recent-list">
          {filtered.map((s) => (
            <li key={s.id} className="recent-item">
              <span className="recent-name">{s.name}</span>
              <span className="recent-meta">
                {s.annotationCount} · {relativeTime(s.lastWriteAt ?? s.startedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
