import type { SessionListItem } from '../../common/types.js';
import { relativeTime } from '../utils.js';
import { useT } from '../../common/i18n/index.js';

export function RecentSessionsCard({
  items,
  activeId,
}: {
  items: SessionListItem[];
  activeId: string | null;
}): JSX.Element {
  const t = useT();
  const filtered = items.filter((s) => s.id !== activeId).slice(0, 6);
  if (filtered.length === 0) return <></>;
  return (
    <section className="card">
      <div className="card-header">
        <span className="card-eyebrow">{t.recent.eyebrow}</span>
      </div>
      <ul className="recent-list">
        {filtered.map((s) => (
          <li key={s.id} className="recent-item">
            <span className="recent-name">{s.name}</span>
            <span className="recent-meta">
              {s.annotationCount} · {relativeTime(s.lastWriteAt ?? s.startedAt, t)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
