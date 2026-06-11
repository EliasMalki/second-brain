import Link from "next/link";
import { completeTaskAction, reopenTaskAction } from "./actions";
import { fmtShort } from "@/lib/dates";
import type { Task } from "@/lib/db/tasks";

/**
 * One task row: a complete/reopen circle + a link to the detail page.
 * Shared by the Tasks list, Today, and Week so they never drift.
 *
 * `showScheduled` adds the scheduled date to the meta line (useful in Overdue
 * and the Tasks list, redundant inside a Week day that's already dated).
 */
export function TaskRow({
  task,
  projectName,
  showScheduled = true,
}: {
  task: Task;
  projectName: string | null;
  showScheduled?: boolean;
}) {
  const done = task.status === "done";
  const meta = [
    projectName,
    showScheduled && task.scheduled_for ? fmtShort(task.scheduled_for) : null,
    task.due_date ? `due ${fmtShort(task.due_date)}` : null,
    task.effort === "quick" ? "quick" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="task-row">
      <form action={done ? reopenTaskAction : completeTaskAction}>
        <input type="hidden" name="id" value={task.id} />
        <button
          type="submit"
          className={done ? "check-btn checked" : "check-btn"}
          title={done ? "Reopen" : "Mark done"}
          aria-label={done ? "Reopen" : "Mark done"}
        >
          {done ? "✓" : ""}
        </button>
      </form>
      <Link href={`/tasks/${task.id}`} className="item-row task-link">
        <span className="title">{task.title}</span>
        {meta ? <span className="meta">{meta}</span> : null}
        <span className={`badge badge-prio-${task.priority}`}>
          {task.priority}
        </span>
      </Link>
    </li>
  );
}
