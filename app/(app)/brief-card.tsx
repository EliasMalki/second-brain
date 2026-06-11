import type { BriefPayload } from "@/lib/db/brief";

/**
 * First-open-of-day brief (BUILD_SPEC §5) — rendered once per day at the top
 * of Today. Same content as the brief email.
 */
export function BriefCard({ brief }: { brief: BriefPayload }) {
  const prios = (["A", "B", "C", "D"] as const).filter(
    (p) => brief.by_priority[p].length > 0,
  );
  const total = prios.reduce((n, p) => n + brief.by_priority[p].length, 0);
  const projectName = (id: string | null) =>
    id ? brief.project_names[id] ?? null : null;

  return (
    <section className="card brief-card">
      <h2 className="section-head">
        ☀️ Daily brief
        <span className="help" style={{ marginLeft: "var(--space-2)" }}>
          {total === 0
            ? "Nothing scheduled — you're clear."
            : `${total} task${total === 1 ? "" : "s"} on deck`}
        </span>
      </h2>

      {prios.map((p) => (
        <div key={p}>
          <h3 className="brief-prio">
            <span className={`badge badge-prio-${p}`}>{p}</span>
          </h3>
          <ul className="brief-list">
            {brief.by_priority[p].map((t) => (
              <li key={t.id}>
                {t.title}
                {projectName(t.project_id) ? (
                  <span className="meta"> · {projectName(t.project_id)}</span>
                ) : null}
                {t.effort === "quick" ? (
                  <span className="meta"> · quick</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {brief.quick_wins.length > 0 ? (
        <p className="meta">
          ⚡ {brief.quick_wins.length} quick win
          {brief.quick_wins.length === 1 ? "" : "s"} in there — start with one.
        </p>
      ) : null}
      {brief.hidden_business_hours > 0 ? (
        <p className="meta">
          {brief.hidden_business_hours} business-hours task
          {brief.hidden_business_hours === 1 ? "" : "s"} hidden until 9–5.
        </p>
      ) : null}
    </section>
  );
}
