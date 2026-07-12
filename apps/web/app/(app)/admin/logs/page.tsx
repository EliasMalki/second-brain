import { listRecentBriefs } from "@/lib/db/brief";
import { todayISO, addDaysISO, fmtShort } from "@second-brain/shared/domain/dates";
import { EmptyState } from "../../empty-state";

/**
 * Minimal owner-only health view (decided in the polish pass): recent
 * briefs_log rows so a stalled nightly job is visible without opening
 * Supabase. Auth is enforced by the (app) layout's requireUser; RLS scopes
 * the rows to this owner's org. Read-only — no new write paths.
 */
export default async function AdminLogsPage() {
  const briefs = await listRecentBriefs();

  const today = todayISO();
  const yesterday = addDaysISO(today, -1);
  const lastDaily = briefs.find((b) => b.kind === "daily");
  // "Healthy" = a daily brief exists for today or yesterday.
  const healthy =
    !!lastDaily &&
    (lastDaily.generated_for >= yesterday);

  return (
    <>
      <div className="view-head">
        <span className="view-title">Logs</span>
        <span className="view-sub">Nightly brief health · owner only</span>
      </div>

      <div
        className="card"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: "var(--space-4)",
        }}
      >
        <i
          className={`ti ${healthy ? "ti-circle-check" : "ti-alert-triangle"}`}
          style={{
            fontSize: 20,
            color: healthy
              ? "var(--color-text-success)"
              : "var(--color-text-warning)",
          }}
          aria-hidden="true"
        />
        <span style={{ fontSize: 14 }}>
          {lastDaily ? (
            <>
              Last daily brief generated for{" "}
              <strong>{fmtShort(lastDaily.generated_for)}</strong>.{" "}
              {healthy
                ? "Nightly job looks healthy."
                : "That's stale — the nightly job may have stopped."}
            </>
          ) : (
            "No daily brief has been generated yet."
          )}
        </span>
      </div>

      {briefs.length === 0 ? (
        <EmptyState icon="ti-file-text" title="No brief runs logged yet." />
      ) : (
        <ul className="tasks">
          {briefs.map((b) => (
            <li key={b.id} className="task-item" style={{ alignItems: "center" }}>
              <span className="tag">{b.kind}</span>
              <div className="task-body">
                <p className="task-title">{fmtShort(b.generated_for)}</p>
                <div className="task-meta">
                  <span>
                    <i className="ti ti-checkbox" aria-hidden="true" />
                    {b.task_ids.length} task{b.task_ids.length === 1 ? "" : "s"}
                  </span>
                  <span>
                    <i className="ti ti-clock" aria-hidden="true" />
                    generated {new Date(b.created_at).toLocaleString()}
                  </span>
                  <span>
                    {b.shown_at ? (
                      <>
                        <i className="ti ti-eye" aria-hidden="true" />
                        opened in-app
                      </>
                    ) : (
                      <>
                        <i className="ti ti-mail" aria-hidden="true" />
                        not yet opened in-app
                      </>
                    )}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
