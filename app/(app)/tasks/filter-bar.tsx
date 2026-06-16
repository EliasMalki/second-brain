import Link from "next/link";
import {
  buildTasksHref,
  toggleProject,
  type TaskGroup,
  type TaskSort,
  type TasksParams,
} from "./params";

type ProjectOption = { id: string; name: string; paused?: boolean };

const STATUS_TABS: { label: string; value: TasksParams["status"] }[] = [
  { label: "Open", value: "open" },
  { label: "Done", value: "done" },
  { label: "Cancelled", value: "cancelled" },
];

const SORTS: { label: string; value: TaskSort }[] = [
  { label: "Priority", value: "priority" },
  { label: "Due date", value: "due" },
  { label: "Project", value: "project" },
  { label: "Created", value: "created" },
];

const GROUPS: { label: string; value: TaskGroup }[] = [
  { label: "Day", value: "day" },
  { label: "Priority", value: "priority" },
  { label: "Project", value: "project" },
  { label: "Flat", value: "flat" },
];

/**
 * The view controls that sit directly above the list (NOT attached to the
 * add-task box). Everything is a Link that rewrites the query string, so the
 * server re-fetches RLS-scoped and the view is shareable. Composable: status ·
 * projects (multi) · timed/undated · recurring · sort · group.
 */
export function FilterBar({
  current,
  projects,
}: {
  current: TasksParams;
  projects: ProjectOption[];
}) {
  const recurring = current.view === "recurring";
  const selectedCount = current.projectIds.length;

  return (
    <div className="fbar" role="navigation" aria-label="Task filters">
      {recurring ? (
        <Link href={buildTasksHref(current, { view: "list" })} className="fpill">
          <i className="ti ti-arrow-left" aria-hidden="true" />
          Tasks
        </Link>
      ) : (
        STATUS_TABS.map((t) => (
          <Link
            key={t.value}
            href={buildTasksHref(current, { status: t.value })}
            className={t.value === current.status ? "fpill on" : "fpill"}
          >
            {t.label}
          </Link>
        ))
      )}

      <span className="fbar-sep" />

      {/* Projects — multi-select */}
      <details className="fdrop">
        <summary className={selectedCount > 0 ? "fpill on" : "fpill"}>
          <i className="ti ti-folders" aria-hidden="true" />
          {selectedCount > 0 ? `${selectedCount} project${selectedCount > 1 ? "s" : ""}` : "Projects"}
          <i className="ti ti-chevron-down" aria-hidden="true" />
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
              Clear projects
            </Link>
          ) : null}
        </div>
      </details>

      {/* Timing */}
      <Link
        href={buildTasksHref(current, {
          timing: current.timing === "timed" ? null : "timed",
        })}
        className={current.timing === "timed" ? "fpill on" : "fpill"}
      >
        <i className="ti ti-calendar-clock" aria-hidden="true" />
        Timed
      </Link>
      <Link
        href={buildTasksHref(current, {
          timing: current.timing === "undated" ? null : "undated",
        })}
        className={current.timing === "undated" ? "fpill on" : "fpill"}
      >
        <i className="ti ti-inbox" aria-hidden="true" />
        Undated
      </Link>

      {/* Recurring view */}
      <Link
        href={buildTasksHref(current, { view: recurring ? "list" : "recurring" })}
        className={recurring ? "fpill on" : "fpill"}
      >
        <i className="ti ti-refresh" aria-hidden="true" />
        Recurring
      </Link>

      {/* Sort + Group — list view only */}
      {!recurring ? (
        <>
          <span className="fbar-spacer" />
          <details className="fdrop fdrop-right">
            <summary className="fpill">
              <i className="ti ti-arrows-sort" aria-hidden="true" />
              {SORTS.find((s) => s.value === current.sort)?.label}
              <i className="ti ti-chevron-down" aria-hidden="true" />
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
          <details className="fdrop fdrop-right">
            <summary className="fpill">
              <i className="ti ti-layout-rows" aria-hidden="true" />
              {GROUPS.find((g) => g.value === current.group)?.label}
              <i className="ti ti-chevron-down" aria-hidden="true" />
            </summary>
            <div className="fmenu">
              {GROUPS.map((g) => (
                <Link
                  key={g.value}
                  href={buildTasksHref(current, { group: g.value })}
                  className={g.value === current.group ? "fmenu-item on" : "fmenu-item"}
                >
                  {g.label}
                </Link>
              ))}
            </div>
          </details>
        </>
      ) : null}
    </div>
  );
}
