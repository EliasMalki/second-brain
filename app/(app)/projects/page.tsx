import Link from "next/link";
import {
  listProjectsWithStats,
  type ProjectWithStats,
} from "@/lib/db/projects";
import { ensureDefaultAreas } from "@/lib/db/areas";
import { projectColorVars } from "@/lib/colors";
import { fmtAgo } from "@/lib/dates";
import { NewProjectForm } from "./new-project-form";

/** Group projects under their area's kind (Business / Personal); area-less
 *  projects fall into a neutral "Other" group — same order as the sidebar. */
type Group = { key: string; label: string; projects: ProjectWithStats[] };

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: { archived?: string };
}) {
  const showArchived = searchParams.archived === "1";
  const [projects, areas] = await Promise.all([
    listProjectsWithStats({ includeArchived: showArchived }),
    ensureDefaultAreas(),
  ]);

  const areaKind = new Map(areas.map((a) => [a.id, a.kind]));
  const buckets: Record<"business" | "personal" | "other", ProjectWithStats[]> = {
    business: [],
    personal: [],
    other: [],
  };
  for (const p of projects) {
    const kind = p.area_id ? areaKind.get(p.area_id) : undefined;
    buckets[kind ?? "other"].push(p);
  }
  const groups: Group[] = [
    { key: "business", label: "Business", projects: buckets.business },
    { key: "personal", label: "Personal", projects: buckets.personal },
    { key: "other", label: "Other", projects: buckets.other },
  ].filter((g) => g.projects.length > 0);

  const activeCount = projects.filter((p) => p.status === "active").length;

  return (
    <>
      <div className="view-head">
        <span className="view-title">Projects</span>
        <span className="view-sub">{activeCount} active</span>
        <Link
          href={showArchived ? "/projects" : "/projects?archived=1"}
          className="view-sub spacer"
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </Link>
      </div>

      <div id="new-project">
        <NewProjectForm areas={areas.map((a) => ({ id: a.id, name: a.name }))} />
      </div>

      {projects.length === 0 ? (
        <div className="card empty">
          <i className="ti ti-folders" aria-hidden="true" />
          No projects yet — name your first one above.
        </div>
      ) : (
        groups.map((group, gi) => (
          <section key={group.key}>
            <p className="ahead">{group.label}</p>
            <div className="pgrid">
              {group.projects.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
              {/* the "+ New project" ghost lands as the last cell of the last
                  group, pointing back at the create bar above */}
              {gi === groups.length - 1 ? (
                <Link href="#new-project" className="ghost-card">
                  <i className="ti ti-plus" aria-hidden="true" />
                  New project
                </Link>
              ) : null}
            </div>
          </section>
        ))
      )}
    </>
  );
}

function ProjectCard({ project: p }: { project: ProjectWithStats }) {
  const { stats } = p;
  const statusLabel =
    p.status === "active" ? "Active" : p.status === "paused" ? "Paused" : "Archived";

  return (
    <Link href={`/projects/${p.id}`} className="pcard" style={projectColorVars(p.color)}>
      <div className="pcard-head">
        <span className="dot" aria-hidden="true" />
        <span className="pcard-name">{p.name}</span>
        <span className={`pill pill-${p.status}`}>{statusLabel}</span>
      </div>

      <p className={p.description ? "pcard-desc" : "pcard-desc empty"}>
        {p.description || "No description yet."}
      </p>

      <div className="pcard-stats">
        <span className="pstat">
          <i className="ti ti-checkbox" aria-hidden="true" />
          <b>{stats.openTasks}</b> tasks
        </span>
        <span className="pstat">
          <i className="ti ti-note" aria-hidden="true" />
          <b>{stats.notes}</b> notes
        </span>
        {stats.records > 0 ? (
          <span className="pstat">
            <i className="ti ti-folders" aria-hidden="true" />
            <b>{stats.records}</b> records
          </span>
        ) : null}
        <span className="pcard-upd">{fmtAgo(stats.lastActivity)}</span>
      </div>
    </Link>
  );
}
