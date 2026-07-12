import { isBeforeToday } from "@/lib/dates";
import type { Task } from "@/lib/db/tasks";

/**
 * Overdue = open AND something about it is in the past: a due date before today
 * OR a scheduled date before today. Pure + type-only import so both the server
 * page (segment count) and the client table (pinned group) share one rule.
 */
export function isOverdue(task: Task, today?: string): boolean {
  if (task.status !== "open") return false;
  return (
    (task.due_date != null && isBeforeToday(task.due_date, today)) ||
    (task.scheduled_for != null && isBeforeToday(task.scheduled_for, today))
  );
}

/** The earliest past date driving the lateness label ("2d late"). */
export function overdueDate(task: Task): string | null {
  const dates = [task.due_date, task.scheduled_for].filter(
    (d): d is string => d != null,
  );
  if (dates.length === 0) return null;
  return dates.sort()[0];
}
