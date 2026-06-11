import { listRecurrences } from "@/lib/db/recurrences";
import { listProjects } from "@/lib/db/projects";
import { fmtShort } from "@/lib/dates";
import { RecurrenceForm } from "./recurrence-form";
import { toggleRecurrenceAction } from "./actions";

export default async function RecurrencesPage() {
  const [recurrences, projects] = await Promise.all([
    listRecurrences(),
    listProjects(),
  ]);
  const projectName = (id: string | null) =>
    projects.find((p) => p.id === id)?.name ?? null;

  return (
    <>
      <div className="view-head">
        <span className="view-title">Recurring</span>
        <span className="view-sub">
          Fixed schedules — the nightly job creates the tasks 14 days ahead
        </span>
      </div>

      <RecurrenceForm projects={projects} />

      <div className="stack" style={{ marginTop: "var(--space-6)" }}>
        {recurrences.length === 0 ? (
          <div className="card empty">No recurring tasks yet.</div>
        ) : (
          <ul className="tasks">
            {recurrences.map((r) => {
              const meta = [
                `every ${r.interval > 1 ? `${r.interval} ` : ""}${r.freq.replace(
                  "ly",
                  r.interval > 1 ? "s" : "",
                )}`,
                projectName(r.project_id),
                `from ${fmtShort(r.start_date)}`,
                r.until ? `until ${fmtShort(r.until)}` : null,
                r.last_materialized_through
                  ? `materialized to ${fmtShort(r.last_materialized_through)}`
                  : "not materialized yet",
              ]
                .filter(Boolean)
                .join(" · ");

              return (
                <li key={r.id} className="task-item" style={{ alignItems: "center" }}>
                  <span className={`chip chip-${r.default_priority}`}>
                    {r.default_priority}
                  </span>
                  <div
                    className="task-body"
                    style={{ opacity: r.active ? 1 : 0.5 }}
                  >
                    <p className="task-title">{r.title_template}</p>
                    <div className="task-meta">
                      <span>{meta}</span>
                    </div>
                  </div>
                  <form action={toggleRecurrenceAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input
                      type="hidden"
                      name="active"
                      value={r.active ? "0" : "1"}
                    />
                    <button type="submit" className="btn-pill">
                      {r.active ? "Pause" : "Resume"}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
