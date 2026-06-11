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
      <div className="view-head">
        <span className={`chip chip-${task.priority}`}>{task.priority}</span>
        <span className="view-title">{task.title}</span>
        <span className={`badge badge-${task.status}`}>{task.status}</span>
      </div>

      <div className="stack">
        <div className="card">
          <TaskForm
            task={task}
            projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          />
        </div>

        <div className="form-actions">
          {task.status === "open" ? (
            <>
              <form action={completeTaskAction}>
                <input type="hidden" name="id" value={task.id} />
                <button type="submit" className="btn">
                  ✓ Mark done
                </button>
              </form>
              <form action={cancelTaskAction}>
                <input type="hidden" name="id" value={task.id} />
                <button type="submit" className="btn btn-danger">
                  Cancel task
                </button>
              </form>
            </>
          ) : (
            <form action={reopenTaskAction}>
              <input type="hidden" name="id" value={task.id} />
              <button type="submit" className="btn">
                Reopen
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
