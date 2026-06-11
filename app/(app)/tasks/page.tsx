import Link from "next/link";
import { listProjects } from "@/lib/db/projects";
import { listTasks, type Task, type TaskStatus } from "@/lib/db/tasks";
import { fmtDayLabel } from "@/lib/dates";
import { TaskForm } from "./task-form";
import { TaskRow } from "./task-row";

const TABS: { label: string; status: TaskStatus }[] = [
  { label: "Open", status: "open" },
  { label: "Done", status: "done" },
  { label: "Cancelled", status: "cancelled" },
];

/** Group open tasks under day headers (mockup: Today / Wed / Fri); undated last. */
function groupByDay(tasks: Task[]): { key: string; label: string; tasks: Task[] }[] {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    const k = t.scheduled_for ?? "";
    const arr = map.get(k);
    if (arr) arr.push(t);
    else map.set(k, [t]);
  }
  const keys = [...map.keys()].sort((a, b) => {
    if (a === "") return 1;
    if (b === "") return -1;
    return a < b ? -1 : 1;
  });
  return keys.map((k) => ({
    key: k,
    label: k === "" ? "Anytime" : fmtDayLabel(k),
    tasks: map.get(k)!,
  }));
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: { status?: string; project?: string };
}) {
  const status: TaskStatus = TABS.some((t) => t.status === searchParams.status)
    ? (searchParams.status as TaskStatus)
    : "open";
  const projectId = searchParams.project;

  const [tasks, projects] = await Promise.all([
    listTasks({ status, projectId }),
    listProjects(),
  ]);
  const projectName = (id: string | null) =>
    projects.find((p) => p.id === id)?.name ?? null;
  const filterProject = projectId ? projectName(projectId) : null;

  const tabHref = (s: TaskStatus) =>
    `/tasks?status=${s}${projectId ? `&project=${projectId}` : ""}`;

  const grouped = status === "open" ? groupByDay(tasks) : null;

  return (
    <>
      <div className="view-head">
        <span className="view-title">Tasks</span>
        <span className="view-sub">{tasks.length} shown</span>
      </div>

      <div className="fbar">
        {TABS.map((t) => (
          <Link
            key={t.status}
            href={tabHref(t.status)}
            className={t.status === status ? "fpill on" : "fpill"}
          >
            {t.label}
          </Link>
        ))}
        {filterProject ? (
          <>
            <span className="fbar-sep" />
            <Link href={`/tasks?status=${status}`} className="fpill on">
              {filterProject}
              <i className="ti ti-x" aria-hidden="true" />
            </Link>
          </>
        ) : null}
      </div>

      <div className="stack">
        {tasks.length === 0 ? (
          <div className="card empty">
            {status === "open"
              ? "Nothing open — add a task below."
              : `No ${status} tasks.`}
          </div>
        ) : grouped ? (
          grouped.map((g) => (
            <section key={g.key}>
              <p className="day-head">{g.label}</p>
              <ul className="tasks">
                {g.tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    projectName={projectName(t.project_id)}
                    showScheduled={false}
                  />
                ))}
              </ul>
            </section>
          ))
        ) : (
          <ul className="tasks">
            {tasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                projectName={projectName(t.project_id)}
              />
            ))}
          </ul>
        )}

        <div className="card">
          <h2 className="label">New task</h2>
          <TaskForm projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
        </div>
      </div>
    </>
  );
}
