import Link from "next/link";
import { listProjects } from "@/lib/db/projects";
import { listTasks, type TaskStatus } from "@/lib/db/tasks";
import { completeTaskAction, reopenTaskAction } from "./actions";
import { TaskForm } from "./task-form";

const TABS: { label: string; status: TaskStatus }[] = [
  { label: "Open", status: "open" },
  { label: "Done", status: "done" },
  { label: "Cancelled", status: "cancelled" },
];

function fmtDate(d: string | null): string {
  if (!d) return "";
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
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

  return (
    <>
      <div className="page-head">
        <h1>
          Tasks
          {filterProject ? (
            <span className="help"> — {filterProject}</span>
          ) : null}
        </h1>
        {filterProject ? (
          <Link href={`/tasks?status=${status}`} className="help">
            Clear project filter
          </Link>
        ) : null}
      </div>

      <nav className="tabs">
        {TABS.map((t) => (
          <Link
            key={t.status}
            href={tabHref(t.status)}
            className={t.status === status ? "tab tab-active" : "tab"}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="stack">
        {tasks.length === 0 ? (
          <div className="card empty">
            {status === "open"
              ? "Nothing open — add a task below."
              : `No ${status} tasks.`}
          </div>
        ) : (
          <ul className="item-list">
            {tasks.map((t) => (
              <li key={t.id} className="task-row">
                <form
                  action={
                    t.status === "done" ? reopenTaskAction : completeTaskAction
                  }
                >
                  <input type="hidden" name="id" value={t.id} />
                  <button
                    type="submit"
                    className={
                      t.status === "done" ? "check-btn checked" : "check-btn"
                    }
                    title={t.status === "done" ? "Reopen" : "Mark done"}
                    aria-label={t.status === "done" ? "Reopen" : "Mark done"}
                  >
                    {t.status === "done" ? "✓" : ""}
                  </button>
                </form>
                <Link href={`/tasks/${t.id}`} className="item-row task-link">
                  <span className="title">{t.title}</span>
                  <span className="meta">
                    {projectName(t.project_id) ?? ""}
                    {t.scheduled_for ? ` · ${fmtDate(t.scheduled_for)}` : ""}
                    {t.due_date ? ` · due ${fmtDate(t.due_date)}` : ""}
                  </span>
                  <span className={`badge badge-prio-${t.priority}`}>
                    {t.priority}
                  </span>
                </Link>
              </li>
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
