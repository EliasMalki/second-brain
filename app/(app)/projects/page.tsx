import Link from "next/link";
import { listProjects } from "@/lib/db/projects";
import { ensureDefaultAreas } from "@/lib/db/areas";
import { NewProjectForm } from "./new-project-form";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: { archived?: string };
}) {
  const showArchived = searchParams.archived === "1";
  const [projects, areas] = await Promise.all([
    listProjects({ includeArchived: showArchived }),
    ensureDefaultAreas(),
  ]);

  return (
    <>
      <div className="view-head">
        <span className="view-title">Projects</span>
        <span className="view-sub">{projects.length} shown</span>
        <Link
          href={showArchived ? "/projects" : "/projects?archived=1"}
          className="view-sub spacer"
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </Link>
      </div>

      <NewProjectForm areas={areas.map((a) => ({ id: a.id, name: a.name }))} />

      <div className="stack">
        {projects.length === 0 ? (
          <div className="card empty">
            <i className="ti ti-folders" aria-hidden="true" />
            No projects yet — create your first one above.
          </div>
        ) : (
          <ul className="tasks">
            {projects.map((p) => (
              <li key={p.id} className="task-item">
                {p.status === "paused" ? (
                  <i
                    className="ti ti-player-pause"
                    style={{ fontSize: 14, color: "var(--color-text-tertiary)", marginTop: 3 }}
                    aria-hidden="true"
                  />
                ) : (
                  <span className="dot" style={{ marginTop: 8 }} aria-hidden="true" />
                )}
                <div className="task-body">
                  <Link href={`/projects/${p.id}`} className="task-link">
                    <p className="task-title">{p.name}</p>
                  </Link>
                </div>
                <span className={`pill pill-${p.status}`}>{p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
