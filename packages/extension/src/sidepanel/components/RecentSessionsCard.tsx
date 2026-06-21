import type { SessionListItem } from '../../common/types.js';
import { sameBaseUrl } from '../../common/view-url.js';
import { relativeTime } from '../utils.js';
import { useT } from '../../common/i18n/index.js';

export function RecentSessionsCard({
  items,
  activeId,
  currentUrl,
  busyResumeId,
  onResume,
}: {
  items: SessionListItem[];
  activeId: string | null;
  currentUrl: string | null;
  busyResumeId: string | null;
  onResume: (session: SessionListItem) => void;
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
        {filtered.map((s) => {
          const urls = s.pageUrls.length > 0 ? s.pageUrls : s.pageUrl ? [s.pageUrl] : [];
          const canResume = urls.some((url) => sameBaseUrl(url, currentUrl));
          const isBusy = busyResumeId === s.id;
          return (
            <li key={s.id} className="recent-item">
              <span className="recent-main">
                <span className="recent-name">{s.name}</span>
                <span className="recent-meta">
                  {s.annotationCount} · {relativeTime(s.lastWriteAt ?? s.startedAt, t)}
                </span>
              </span>
              {canResume ? (
                <button
                  type="button"
                  className="btn-link recent-resume"
                  onClick={() => onResume(s)}
                  disabled={isBusy}
                >
                  {isBusy ? t.recent.resuming : t.recent.resume}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
