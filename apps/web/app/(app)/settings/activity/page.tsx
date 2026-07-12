import { listRecentActivity, type ActivityRow } from "@/lib/db/activity";
import { fmtAgoFine, fmtDayLabel } from "@second-brain/shared/domain/dates";
import { EmptyState } from "../../empty-state";

/**
 * Activity — the append-only "who did what" feed (AI vs manual). Read-only:
 * every row was written best-effort by the mutation that caused it (see
 * lib/db/activity.ts). Auth is enforced by the (app) layout; RLS scopes rows to
 * this owner's org. The All/AI/Manual filter narrows server-side via ?actor=.
 */

type ActorGroup = "all" | "ai" | "manual";

const FILTERS: { value: ActorGroup; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ai", label: "AI" },
  { value: "manual", label: "Manual" },
];

/** Actor → chip. Neutral tags only — saturated color is reserved for priority. */
function actorChip(actor: string): { icon: string; label: string } {
  switch (actor) {
    case "user":
      return { icon: "ti-user", label: "Manual" };
    case "command":
      return { icon: "ti-robot", label: "AI · command" };
    case "classifier":
      return { icon: "ti-robot", label: "AI · classifier" };
    case "nightly":
      return { icon: "ti-moon", label: "Nightly" };
    case "recurrence":
      return { icon: "ti-repeat", label: "Repeat" };
    default:
      return { icon: "ti-dots", label: actor };
  }
}

const VERBS: Record<string, string> = {
  task_created: "created",
  task_completed: "completed",
  task_reopened: "reopened",
  task_cancelled: "cancelled",
  task_deleted: "deleted",
  task_snoozed: "snoozed",
  task_unsnoozed: "unsnoozed",
  task_rescheduled: "rescheduled",
  task_reprioritized: "reprioritized",
  task_refiled: "refiled",
  task_rolled_over: "rolled over",
  task_resurfaced: "resurfaced",
  recurrence_spawned: "scheduled next",
  note_filed: "filed note",
};

/** A short human context string pulled from the detail jsonb, when useful. */
function contextOf(row: ActivityRow): string | null {
  const d = (row.detail ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  if (row.action === "task_rescheduled" && d.to) parts.push(`→ ${String(d.to)}`);
  if (row.action === "task_reprioritized" && (d.from || d.to)) {
    parts.push(`${d.from ?? "?"} → ${d.to ?? "?"}`);
  }
  if (row.action === "task_rolled_over" && typeof d.rollover_count === "number") {
    parts.push(`×${d.rollover_count}`);
  }
  if (row.action === "task_resurfaced" && d.from) parts.push(`from ${String(d.from)}`);
  if (d.reason === "undo") parts.push("undo");
  if (d.reason === "record_intake") parts.push("record intake");
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** YYYY-MM-DD (local) of a timestamp, for day grouping. */
function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA");
}

export default async function ActivitySettingsPage({
  searchParams,
}: {
  searchParams: { actor?: string };
}) {
  const group: ActorGroup =
    searchParams.actor === "ai" || searchParams.actor === "manual"
      ? searchParams.actor
      : "all";

  const rows = await listRecentActivity({ actorGroup: group, limit: 100 });

  // Group the (already newest-first) rows into day buckets.
  const days: { key: string; rows: ActivityRow[] }[] = [];
  for (const row of rows) {
    const key = dayKey(row.created_at);
    const last = days[days.length - 1];
    if (last && last.key === key) last.rows.push(row);
    else days.push({ key, rows: [row] });
  }

  return (
    <>
      <div className="view-head">
        <span className="view-title">Activity</span>
        <span className="view-sub">Who did what · AI vs manual</span>
      </div>

      <div
        className="theme-seg"
        role="group"
        aria-label="Filter by actor"
        style={{ marginBottom: "var(--space-4)" }}
      >
        {FILTERS.map((f) => (
          <form
            action="/settings/activity"
            method="get"
            key={f.value}
            style={{ flex: 1, display: "flex" }}
          >
            <input type="hidden" name="actor" value={f.value} />
            <button
              type="submit"
              className={group === f.value ? "on" : undefined}
              aria-pressed={group === f.value}
            >
              {f.label}
            </button>
          </form>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="ti-history"
          title={
            group === "all"
              ? "No activity logged yet."
              : `No ${group === "ai" ? "AI" : "manual"} activity yet.`
          }
        />
      ) : (
        days.map((day) => (
          <div key={day.key} style={{ marginBottom: "var(--space-4)" }}>
            <p
              className="card-label"
              style={{ marginBottom: "var(--space-2)" }}
            >
              {fmtDayLabel(day.key)}
            </p>
            <ul className="tasks">
              {day.rows.map((row) => {
                const chip = actorChip(row.actor);
                const ctx = contextOf(row);
                return (
                  <li key={row.id} className="task-item" style={{ alignItems: "center" }}>
                    <span className="tag">
                      <i className={`ti ${chip.icon}`} aria-hidden="true" /> {chip.label}
                    </span>
                    <div className="task-body">
                      <p className="task-title">
                        {row.summary ?? (row.entity_type === "note" ? "(note)" : "(task)")}
                      </p>
                      <div className="task-meta">
                        <span>
                          <i className="ti ti-arrow-right" aria-hidden="true" />
                          {VERBS[row.action] ?? row.action}
                        </span>
                        {ctx ? <span>{ctx}</span> : null}
                        <span>
                          <i className="ti ti-clock" aria-hidden="true" />
                          {fmtAgoFine(row.created_at)}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </>
  );
}
