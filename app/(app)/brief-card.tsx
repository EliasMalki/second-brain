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

  const rows = prios.flatMap((p) =>
    brief.by_priority[p].map((t) => ({ p, t })),
  );

  return (
    <section className="card brief-card" style={{ marginTop: "var(--space-6)" }}>
      <p className="card-label">
        <i className="ti ti-sun" aria-hidden="true" />
        Daily brief
        <span style={{ marginLeft: "auto", color: "var(--color-text-tertiary)" }}>
          {total === 0
            ? "Nothing scheduled — you're clear."
            : `${total} task${total === 1 ? "" : "s"} on deck`}
        </span>
      </p>

      <ul className="tasks">
        {rows.map(({ p, t }) => (
          <li className="task-item" key={t.id}>
            <span className={`chip chip-${p}`}>{p}</span>
            <div className="task-body">
              <p className="task-title">{t.title}</p>
              {projectName(t.project_id) || t.effort === "quick" ? (
                <div className="task-meta">
                  {projectName(t.project_id) ? (
                    <span className="tag">{projectName(t.project_id)}</span>
                  ) : null}
                  {t.effort === "quick" ? (
                    <span>
                      <i className="ti ti-bolt" aria-hidden="true" />
                      quick
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {brief.quick_wins.length > 0 ? (
        <p className="muted-note">
          <i className="ti ti-bolt" aria-hidden="true" />
          {brief.quick_wins.length} quick win
          {brief.quick_wins.length === 1 ? "" : "s"} in there — start with one.
        </p>
      ) : null}
      {brief.hidden_business_hours > 0 ? (
        <p className="muted-note">
          <i className="ti ti-eye-off" aria-hidden="true" />
          {brief.hidden_business_hours} business-hours task
          {brief.hidden_business_hours === 1 ? "" : "s"} hidden until 9–5.
        </p>
      ) : null}
    </section>
  );
}
