"use client";

import { useEffect, useState } from "react";
import { readViewSnapshot, type ViewSnapshot } from "./view-snapshot";

/**
 * Route error boundary. Offline (the §6 case): serve the last-cached Today
 * snapshot read-only instead of a crash. Online: plain error + retry.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [offline, setOffline] = useState(false);
  const [snapshot, setSnapshot] = useState<ViewSnapshot | null>(null);

  useEffect(() => {
    setOffline(!navigator.onLine);
    if (!navigator.onLine) {
      setSnapshot(readViewSnapshot("today") ?? readViewSnapshot("week"));
    }
    const on = () => setOffline(false);
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, [error]);

  if (offline) {
    return (
      <div className="stack">
        <div className="offline-banner" role="status">
          Offline — couldn&apos;t load fresh data. Reconnect and retry.
        </div>
        {snapshot ? (
          <section>
            <h2 className="section-head">
              Last loaded {snapshot.view}
              <span className="help" style={{ marginLeft: "var(--space-2)" }}>
                read-only · saved{" "}
                {new Date(snapshot.savedAt).toLocaleTimeString()}
              </span>
            </h2>
            <ul className="item-list">
              {snapshot.tasks.map((t, i) => (
                <li key={i} className="item-row">
                  <span className="title">{t.title}</span>
                  <span className="meta">
                    {[t.section, t.project].filter(Boolean).join(" · ")}
                  </span>
                  <span className={`badge badge-prio-${t.priority}`}>
                    {t.priority}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <div className="card empty">No cached view on this device yet.</div>
        )}
        <div>
          <button className="btn" onClick={() => reset()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card empty">
      <i className="ti ti-plug-connected-x" aria-hidden="true" />
      <span>Having trouble loading this page.</span>
      <div className="empty-action">
        <button className="btn" onClick={() => reset()}>
          <i className="ti ti-refresh" aria-hidden="true" />
          Try again
        </button>
      </div>
    </div>
  );
}
