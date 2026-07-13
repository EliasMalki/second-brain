import type { Database } from "../types/database";

type Task = Database["public"]["Tables"]["tasks"]["Row"];

/**
 * Which calendar day a task lands on, and whether it's timed. Mirrors the web
 * grid's `taskDay` precedence (apps/web/app/(app)/calendar/grid.ts): a timed
 * `start_at` wins, else `scheduled_for`, else `due_date`. Pure + platform-
 * agnostic so web and mobile agree on placement. Web resolves start_at in the
 * user's stored timezone; here (and everywhere in the mobile app) "day" is the
 * device-local date, consistent with domain/dates `todayISO`.
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Device-local YYYY-MM-DD for a timestamptz. */
function localDayKey(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The YYYY-MM-DD a task shows on, or null if it has no date at all. */
export function calendarDayKey(task: Task): string | null {
  if (task.start_at) return localDayKey(task.start_at);
  if (task.scheduled_for) return task.scheduled_for;
  if (task.due_date) return task.due_date;
  return null;
}

/** Whether the task is a timed appointment (has a start_at instant). */
export function calendarTimed(task: Task): boolean {
  return task.start_at != null;
}
