import Link from "next/link";
import { completeTaskAction, reopenTaskAction } from "./actions";
import { fmtShort } from "@/lib/dates";
import type { Task } from "@/lib/db/tasks";

/**
 * One task row (mockup): [complete circle] [priority chip] [title + icon meta].
 * Shared by Today, Week, and the Tasks list so they never drift.
 *
 * `showScheduled` adds the scheduled date to the meta line (useful in Overdue
 * and the Tasks list, redundant inside a Week/day section that's already dated).
 */

/** A meta entry rendered as an optional Tabler icon + label. */
type Meta = { icon?: string; label: string };

function buildMeta(task: Task, showScheduled: boolean): Meta[] {
  const meta: Meta[] = [];
  if (task.recurrence_id) meta.push({ icon: "ti-refresh", label: "recurring" });
  if (showScheduled && task.scheduled_for) {
    meta.push({ icon: "ti-calendar", label: fmtShort(task.scheduled_for) });
  }
  if (task.due_date) {
    meta.push({ icon: "ti-calendar-event", label: `due ${fmtShort(task.due_date)}` });
  }
  if (task.effort) meta.push({ icon: "ti-bolt", label: task.effort });
  if (task.availability === "business_hours") {
    meta.push({ icon: "ti-briefcase", label: "9–5" });
  }
  if (task.status === "waiting" && task.waiting_on) {
    meta.push({ icon: "ti-user", label: `waiting on ${task.waiting_on}` });
  }
  return meta;
}

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
  const cancelled = task.status === "cancelled";
  const held = task.status === "waiting" || task.status === "snoozed";
  const meta = buildMeta(task, showScheduled);

  // The leading chip: a pause glyph for held tasks, otherwise the priority
  // letter — dimmed once the task is done/cancelled.
  const chipClass = held
    ? "chip chip-muted"
    : `chip chip-${task.priority}${done || cancelled ? " chip-dim" : ""}`;

  return (
    <li className="task-item">
      <form action={done ? reopenTaskAction : completeTaskAction}>
        <input type="hidden" name="id" value={task.id} />
        <button
          type="submit"
          className={done ? "check checked" : "check"}
          title={done ? "Reopen" : "Mark done"}
          aria-label={done ? "Reopen" : "Mark done"}
        >
          {done ? "✓" : ""}
        </button>
      </form>

      <span className={chipClass}>
        {held ? (
          <i className="ti ti-player-pause" style={{ fontSize: 13 }} aria-hidden="true" />
        ) : (
          task.priority
        )}
      </span>

      <div className="task-body">
        <Link href={`/tasks/${task.id}`} className="task-link">
          <p className={`task-title${done || cancelled ? " done" : ""}`}>
            {task.title}
          </p>
          {projectName || meta.length > 0 ? (
            <div className="task-meta">
              {projectName ? <span className="tag">{projectName}</span> : null}
              {meta.map((m, i) => (
                <span key={i}>
                  {m.icon ? <i className={`ti ${m.icon}`} aria-hidden="true" /> : null}
                  {m.label}
                </span>
              ))}
            </div>
          ) : null}
        </Link>
      </div>
    </li>
  );
}
