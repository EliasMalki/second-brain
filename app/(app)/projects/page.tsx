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
      <div className="page-head">
        <h1>Projects</h1>
        <Link
          href={showArchived ? "/projects" : "/projects?archived=1"}
          className="help"
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </Link>
      </div>

      <div className="stack">
        {projects.length === 0 ? (
          <div className="card empty">
            No projects yet — create your first one below.
          </div>
        ) : (
          <ul className="item-list">
            {projects.map((p) => (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="item-row">
                  <span className="title">{p.name}</span>
                  <span className={`badge badge-${p.status}`}>{p.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="card">
          <h2 className="label">New project</h2>
          <NewProjectForm areas={areas.map((a) => ({ id: a.id, name: a.name }))} />
        </div>
      </div>
    </>
  );
}
