import Link from "next/link";
import {
  buildTasksHref,
  toggleProject,
  type TaskSort,
  type TaskView,
  type TasksParams,
} from "./params";

type ProjectOption = { id: string; name: string };

const VIEWS: { label: string; value: TaskView }[] = [
  { label: "All", value: "all" },
  { label: "Today", value: "today" },
  { label: "Overdue", value: "overdue" },
  { label: "Backlog", value: "backlog" },
  { label: "Recurring", value: "recurring" },
];

const SORTS: { label: string; value: TaskSort }[] = [
  { label: "Priority", value: "priority" },
  { label: "Due date", value: "due" },
  { label: "Project", value: "project" },
  { label: "Created", value: "created" },
];

/**
 * The control bar (command-center): a segmented "view" control on the left, a
 * pushed Project + Sort zone (disclosure pills) on the right, and a quiet
 * Completed pill at the far end. All links rewrite the query string (shareable,
 * server-fetched); the segments filter both List and Grid.
 */
export function FilterBar({
  current,
  projects,
  overdueCount,
}: {
  current: TasksParams;
  projects: ProjectOption[];
  overdueCount: number;
}) {
  const selectedCount = current.projectIds.length;
  const projectLabel =
    selectedCount === 0
      ? "All"
      : selectedCount === 1
        ? projects.find((p) => p.id === current.projectIds[0])?.name ?? "1"
        : `${selectedCount}`;
  const sortLabel = SORTS.find((s) => s.value === current.sort)?.label;

  return (
    <div className="t-bar" role="navigation" aria-label="Task views and filters">
      <div className="t-views" role="group" aria-label="Task views">
        {VIEWS.map((v) => {
          const on = current.view === v.value;
          const over = v.value === "overdue";
          return (
            <Link
              key={v.value}
              href={buildTasksHref(current, { view: v.value })}
              className={on ? "on" : undefined}
            >
              {v.label}
              {over && overdueCount > 0 ? (
                <span className="b">{overdueCount}</span>
              ) : null}
            </Link>
          );
        })}
      </div>

      <span className="t-spacer" />

      <details className="fdrop fdrop-right">
        <summary className={selectedCount > 0 ? "t-ctl on" : "t-ctl"}>
          <i className="ti ti-filter" aria-hidden="true" />
          <span className="k">Project</span> {projectLabel}
        </summary>
        <div className="fmenu">
          {projects.length === 0 ? (
            <span className="fmenu-empty">No projects yet</span>
          ) : (
            projects.map((p) => {
              const on = current.projectIds.includes(p.id);
              return (
                <Link
                  key={p.id}
                  href={buildTasksHref(current, {
                    projectIds: toggleProject(current.projectIds, p.id),
                  })}
                  className={on ? "fmenu-item on" : "fmenu-item"}
                >
                  <i
                    className={`ti ${on ? "ti-checkbox" : "ti-square"}`}
                    aria-hidden="true"
                  />
                  {p.name}
                </Link>
              );
            })
          )}
          {selectedCount > 0 ? (
            <Link
              href={buildTasksHref(current, { projectIds: [] })}
              className="fmenu-item fmenu-clear"
            >
              Clear
            </Link>
          ) : null}
        </div>
      </details>

      <details className="fdrop fdrop-right">
        <summary className="t-ctl">
          <i className="ti ti-arrows-sort" aria-hidden="true" />
          <span className="k">Sort</span> {sortLabel}
        </summary>
        <div className="fmenu">
          {SORTS.map((s) => (
            <Link
              key={s.value}
              href={buildTasksHref(current, { sort: s.value })}
              className={s.value === current.sort ? "fmenu-item on" : "fmenu-item"}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </details>

      <Link
        href={buildTasksHref(current, { view: "completed" })}
        className={current.view === "completed" ? "t-ctl on" : "t-ctl"}
        title="Completed & cancelled"
      >
        <i className="ti ti-check" aria-hidden="true" />
        Completed
      </Link>
    </div>
  );
}
