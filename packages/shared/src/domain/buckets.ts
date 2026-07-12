import { addDaysISO, isBeforeToday, todayISO } from "./dates";
import { PRIORITY_ORDER } from "./priority";
import type { Database } from "../types/database";

type Task = Database["public"]["Tables"]["tasks"]["Row"];

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

/**
 * Time-bucket grouping for the command-center Tasks views. Both List and Grid
 * render the same four buckets in this order; only non-empty ones show. This
 * replaces the old sort-driven grouping — the Sort control now reorders WITHIN
 * a bucket instead of defining the groups.
 */
export type Bucket = "overdue" | "today" | "week" | "backlog";

export const BUCKET_ORDER: Bucket[] = ["overdue", "today", "week", "backlog"];
export const BUCKET_LABEL: Record<Bucket, string> = {
  overdue: "Overdue",
  today: "Today",
  week: "This week",
  backlog: "Backlog",
};

export function bucketOf(t: Task, today = todayISO()): Bucket {
  if (isOverdue(t, today)) return "overdue";
  if (t.scheduled_for === today || t.due_date === today) return "today";
  const end = addDaysISO(today, 7);
  const within = (d: string | null) => !!d && d > today && d <= end;
  if (within(t.scheduled_for) || within(t.due_date)) return "week";
  return "backlog";
}

// ---- within-bucket ordering ------------------------------------------------
export function dateCmp(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : 1;
}

export function byPriority(a: Task, b: Task): number {
  return (
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
    dateCmp(a.scheduled_for, b.scheduled_for) ||
    a.created_at.localeCompare(b.created_at)
  );
}
