/**
 * Date helpers for the day/week views. All work in `YYYY-MM-DD` strings to
 * match the `date` columns (scheduled_for, due_date).
 *
 * NOTE (tz): "today" is the SERVER's local date. Good enough for the in-app
 * views in v0.5; true per-user timezone handling arrives with the daily brief
 * + user settings (Week 2), where it actually matters for delivery timing.
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Today as YYYY-MM-DD (server local). */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Shift a YYYY-MM-DD by n days, returning YYYY-MM-DD. */
export function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Inclusive list of YYYY-MM-DD from start spanning `count` days. */
export function dateRange(startISO: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDaysISO(startISO, i));
}

/** "Jun 16" */
export function fmtShort(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Day label with relative prefix: "Today · Mon, Jun 16". */
export function fmtDayLabel(iso: string): string {
  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);
  const weekday = new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (iso === today) return `Today · ${weekday}`;
  if (iso === tomorrow) return `Tomorrow · ${weekday}`;
  return weekday;
}
