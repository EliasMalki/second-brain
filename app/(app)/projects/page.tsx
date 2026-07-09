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
type Group = {
  key: string;
  label: string;
  areaId: string;
  projects: ProjectWithStats[];
};

/** Whole-dollar money for the stat tiles ("$3,120", not "$3,120.00"). */
function fmtMoney(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(amount);
}

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
  const areaIdByKind = new Map(areas.map((a) => [a.kind, a.id]));
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
    {
      key: "business",
      label: "Business",
      areaId: areaIdByKind.get("business") ?? "",
      projects: buckets.business,
    },
    {
      key: "personal",
      label: "Personal",
      areaId: areaIdByKind.get("personal") ?? "",
      projects: buckets.personal,
    },
    { key: "other", label: "Other", areaId: "", projects: buckets.other },
  ].filter((g) => g.projects.length > 0);

  const activeCount = projects.filter((p) => p.status === "active").length;
  const pausedCount = projects.filter((p) => p.status === "paused").length;
  const openTasksTotal = projects.reduce((n, p) => n + p.stats.openTasks, 0);
  const notesTotal = projects.reduce((n, p) => n + p.stats.notes, 0);
  const receiptsTotal = projects.reduce((n, p) => n + p.stats.receiptsTotal, 0);

  return (
    <div className="projs">
      <div className="pl-head">
        <span className="pl-title">Projects</span>
        <span className="pl-sub">
          {activeCount} active{pausedCount > 0 ? ` · ${pausedCount} paused` : ""}
        </span>
        <Link
          href={showArchived ? "/projects" : "/projects?archived=1"}
          className="pl-arch"
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </Link>
      </div>

      <div className="pl-pulse">
        <div className="pl-tile">
          <div className="v">{activeCount}</div>
          <div className="k">
            <i className="ti ti-folders" aria-hidden="true" />
            active projects
          </div>
        </div>
        <div className="pl-tile">
          <div className="v">{openTasksTotal}</div>
          <div className="k">
            <i className="ti ti-checkbox" aria-hidden="true" />
            open tasks
          </div>
        </div>
        <div className="pl-tile">
          <div className="v">{notesTotal}</div>
          <div className="k">
            <i className="ti ti-note" aria-hidden="true" />
            notes
          </div>
        </div>
        <div className="pl-tile">
          <div className="v">{fmtMoney(receiptsTotal)}</div>
          <div className="k">
            <i className="ti ti-receipt" aria-hidden="true" />
            tracked
          </div>
        </div>
      </div>

      <NewProjectForm areas={areas.map((a) => ({ id: a.id, name: a.name }))} />

      {projects.length === 0 ? (
        <div className="card empty">
          <i className="ti ti-folders" aria-hidden="true" />
          No projects yet — name your first one above.
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.key} className="pl-group">
            <p className="pl-glabel">
              {group.label} <span className="ct">{group.projects.length}</span>
              <span className="ln" />
            </p>
            <div className="pl-grid">
              {group.projects.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function ProjectCard({ project: p }: { project: ProjectWithStats }) {
  const { stats } = p;
  const statusLabel =
    p.status === "active" ? "Active" : p.status === "paused" ? "Paused" : "Archived";
  const pct =
    stats.totalTasks > 0
      ? Math.round((stats.doneTasks / stats.totalTasks) * 100)
      : 0;

  return (
    <Link
      href={`/projects/${p.id}`}
      className={p.status === "paused" ? "pc paused" : "pc"}
      style={projectColorVars(p.color)}
    >
      <div className="pc-band">
        <span className="nm">{p.name}</span>
        <span className={p.status === "active" ? "st" : "st paused-pill"}>
          {statusLabel}
        </span>
        <span className="go" aria-hidden="true">
          <i className="ti ti-arrow-right" />
        </span>
      </div>

      <div className="pc-body">
        <p className={p.description ? "pc-desc" : "pc-desc empty"}>
          {p.description || "No description yet."}
        </p>
      </div>

      <div className="pc-prog">
        <div className="bar">
          <div className="fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="lbl">
          <span>
            <b>{stats.doneTasks}</b>/{stats.totalTasks} tasks done
          </span>
          <span>{stats.totalTasks > 0 ? `${pct}%` : "—"}</span>
        </div>
      </div>

      <div className="pc-foot">
        <span className="pc-stat">
          <i className="ti ti-checkbox" aria-hidden="true" />
          <b>{stats.openTasks}</b> open
        </span>
        <span className="pc-stat">
          <i className="ti ti-note" aria-hidden="true" />
          <b>{stats.notes}</b>
        </span>
        {stats.records > 0 ? (
          <span className="pc-stat">
            <i className="ti ti-folders" aria-hidden="true" />
            <b>{stats.records}</b> rec
          </span>
        ) : null}
        <span className="pc-upd">{fmtAgo(stats.lastActivity)}</span>
      </div>
    </Link>
  );
}
