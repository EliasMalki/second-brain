import Link from "next/link";
import { notFound } from "next/navigation";
import { listProjects } from "@/lib/db/projects";
import { getTask } from "@/lib/db/tasks";
import {
  cancelTaskAction,
  completeTaskAction,
  reopenTaskAction,
} from "../actions";
import { TaskForm } from "../task-form";

export default async function TaskDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [task, projects] = await Promise.all([
    getTask(params.id),
    listProjects(),
  ]);
  if (!task) notFound();

  return (
    <>
      <p className="view-sub" style={{ marginBottom: "var(--space-3)" }}>
        <Link href="/tasks">← Tasks</Link>
      </p>
      <div className="view-head" style={{ alignItems: "center" }}>
        <span className={`chip chip-${task.priority}`}>{task.priority}</span>
        <span className="view-title">{task.title}</span>
        <span className="tag">{task.status}</span>
        <span className="spacer" style={{ display: "flex", gap: 6 }}>
          {task.status === "open" ? (
            <>
              <form action={completeTaskAction}>
                <input type="hidden" name="id" value={task.id} />
                <button type="submit" className="btn-pill go">
                  <i className="ti ti-check" aria-hidden="true" />
                  Done
                </button>
              </form>
              <form action={cancelTaskAction}>
                <input type="hidden" name="id" value={task.id} />
                <button type="submit" className="btn-pill" title="Cancel this task">
                  Cancel
                </button>
              </form>
            </>
          ) : (
            <form action={reopenTaskAction}>
              <input type="hidden" name="id" value={task.id} />
              <button type="submit" className="btn-pill">
                Reopen
              </button>
            </form>
          )}
        </span>
      </div>

      <div className="card">
        <TaskForm
          task={task}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        />
      </div>
    </>
  );
}
