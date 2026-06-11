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
      <div className="page-head">
        <h1>Recurring</h1>
        <span className="help">
          Fixed schedules — the nightly job creates the tasks 14 days ahead
        </span>
      </div>

      <RecurrenceForm projects={projects} />

      <div className="stack" style={{ marginTop: "var(--space-6)" }}>
        {recurrences.length === 0 ? (
          <div className="card empty">No recurring tasks yet.</div>
        ) : (
          <ul className="item-list">
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
                <li key={r.id} className="card inbox-row">
                  <div className="inbox-row-main">
                    <span className={`badge badge-prio-${r.default_priority}`}>
                      {r.default_priority}
                    </span>
                    <span className="inbox-text" style={{ opacity: r.active ? 1 : 0.5 }}>
                      {r.title_template}
                      <span className="meta" style={{ display: "block" }}>
                        {meta}
                      </span>
                    </span>
                    <form action={toggleRecurrenceAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input
                        type="hidden"
                        name="active"
                        value={r.active ? "0" : "1"}
                      />
                      <button type="submit" className="btn">
                        {r.active ? "Pause" : "Resume"}
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
