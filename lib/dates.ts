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

/**
 * Whether it is business hours right now: Mon–Fri, 9:00–17:00 (server local —
 * same tz caveat as todayISO). Drives availability-aware filtering in the
 * Today view and the daily brief (BUILD_SPEC §5).
 */
export function isBusinessHoursNow(now: Date = new Date()): boolean {
  const day = now.getDay(); // 0 = Sunday
  const hour = now.getHours();
  return day >= 1 && day <= 5 && hour >= 9 && hour < 17;
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

/**
 * The upcoming Sunday as YYYY-MM-DD (today if today is already Sunday). Drives
 * the "End of week" quick-date button in the add-task box.
 */
export function endOfWeekISO(from: Date = new Date()): string {
  const base = `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`;
  return addDaysISO(base, (7 - from.getDay()) % 7);
}

/** Whether a YYYY-MM-DD is strictly before today (server/browser local). */
export function isBeforeToday(iso: string, today: string = todayISO()): boolean {
  return iso < today;
}

/**
 * Lateness label for an overdue date: "yesterday", "2d late". Returns "today"
 * for today and "" for future dates (caller decides when to show it).
 */
export function fmtLate(iso: string, today: string = todayISO()): string {
  const days = Math.round(
    (Date.parse(`${today}T00:00:00`) - Date.parse(`${iso}T00:00:00`)) / 86_400_000,
  );
  if (days < 0) return "";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d late`;
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
