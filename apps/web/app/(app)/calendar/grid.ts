import { addDaysISO, todayISO } from "@second-brain/shared/domain/dates";
import type { CalendarProviderId, NormalizedEvent } from "@/lib/calendar/types";
import type { Task } from "@/lib/db/tasks";

/**
 * Pure calendar math + the internal view-model. NO Google-isms and no server-
 * only deps — imported by both the server page (window/params) and the client
 * grid (positioning), so the two never disagree about what day a thing is on.
 *
 * Weeks run Monday→Sunday to match `endOfWeekISO` (lib/dates), which treats
 * Sunday as the last day of the week.
 */

export type CalendarView = "week" | "month" | "day";

/**
 * The one shape the grid renders. App tasks are "yours" (editable, project
 * color + priority chip); external events are display-only and carry their
 * source `provider` so the generic source-icon slot stays provider-agnostic.
 */
export type CalItem =
  | { kind: "app"; task: Task }
  | { kind: "external"; provider: CalendarProviderId; event: NormalizedEvent };

const VIEWS: CalendarView[] = ["week", "month", "day"];
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Parse ?view & ?date into a validated view + anchor day (defaults: week/today). */
export function parseCalendarParams(sp: {
  view?: string;
  date?: string;
}): { view: CalendarView; anchor: string } {
  return {
    view: VIEWS.includes(sp.view as CalendarView)
      ? (sp.view as CalendarView)
      : "week",
    anchor: sp.date && ISO_RE.test(sp.date) ? sp.date : todayISO(),
  };
}

/** Day-of-week with Monday=0 … Sunday=6 (local parse of a YYYY-MM-DD). */
function mondayIndex(iso: string): number {
  return (new Date(`${iso}T00:00:00`).getDay() + 6) % 7;
}

/** Monday of the week containing `iso`. */
export function startOfWeekISO(iso: string): string {
  return addDaysISO(iso, -mondayIndex(iso));
}

/** First day of the month containing `iso`, shifted by `n` months. */
export function addMonthsISO(iso: string, n: number): string {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
}

/** Inclusive day list for a view + anchor, plus the fetch window (start/end). */
export function windowFor(
  view: CalendarView,
  anchor: string,
): { startISO: string; endISO: string; days: string[] } {
  if (view === "day") {
    return { startISO: anchor, endISO: anchor, days: [anchor] };
  }
  if (view === "week") {
    const start = startOfWeekISO(anchor);
    const days = Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
    return { startISO: start, endISO: days[6], days };
  }
  // month → a fixed 6-week (42-cell) grid starting on the Monday of the week
  // that holds the 1st, so the grid height never jumps between months.
  const first = addMonthsISO(anchor, 0);
  const gridStart = startOfWeekISO(first);
  const days = Array.from({ length: 42 }, (_, i) => addDaysISO(gridStart, i));
  return { startISO: gridStart, endISO: days[41], days };
}

/** Build /calendar?... omitting defaults (view=week, date=today) for clean URLs. */
export function calendarHref(
  view: CalendarView,
  anchor: string,
  today: string = todayISO(),
): string {
  const q = new URLSearchParams();
  if (view !== "week") q.set("view", view);
  if (anchor !== today) q.set("date", anchor);
  const s = q.toString();
  return s ? `/calendar?${s}` : "/calendar";
}

/** Prev/next anchor for the header arrows (±1 day / week / month). */
export function shiftAnchor(
  view: CalendarView,
  anchor: string,
  dir: -1 | 1,
): string {
  if (view === "day") return addDaysISO(anchor, dir);
  if (view === "week") return addDaysISO(startOfWeekISO(anchor), dir * 7);
  return addMonthsISO(anchor, dir);
}

// --- time-of-day positioning (tz-aware, no library) ------------------------

type Wall = { dayKey: string; minutes: number };

/** Local wall-clock day (YYYY-MM-DD) + minutes-from-midnight of an instant. */
export function wallInTz(dateTimeISO: string, tz: string): Wall {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(dateTimeISO));
  const val = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  let hour = Number(val("hour"));
  if (hour === 24) hour = 0; // some engines emit 24 for midnight
  return {
    dayKey: `${val("year")}-${val("month")}-${val("day")}`,
    minutes: hour * 60 + Number(val("minute")),
  };
}

/** Which day column (YYYY-MM-DD) an app task belongs to, and whether it's timed. */
export function taskDay(task: Task, tz: string): { dayKey: string; timed: boolean } | null {
  if (task.start_at) return { dayKey: wallInTz(task.start_at, tz).dayKey, timed: true };
  if (task.scheduled_for) return { dayKey: task.scheduled_for, timed: false };
  if (task.due_date) return { dayKey: task.due_date, timed: false };
  return null;
}

export type TimedRange = { startMin: number; endMin: number };

/** Minutes-from-midnight span of a timed app task (defaults to a 60-min block). */
export function taskTimedRange(task: Task, tz: string): TimedRange {
  const s = wallInTz(task.start_at!, tz);
  let endMin = s.minutes + 60;
  if (task.end_at) {
    const e = wallInTz(task.end_at, tz);
    endMin = e.dayKey === s.dayKey ? e.minutes : 24 * 60; // clamp multi-day to EOD
  }
  return { startMin: s.minutes, endMin: Math.max(endMin, s.minutes + 20) };
}

/** Minutes-from-midnight span of a timed external event, clamped to its start day. */
export function eventTimedRange(
  startISO: string,
  endISO: string | null,
  startDayKey: string,
  tz: string,
): TimedRange {
  const s = wallInTz(startISO, tz);
  let endMin = s.minutes + 60;
  if (endISO) {
    const e = wallInTz(endISO, tz);
    endMin = e.dayKey === startDayKey ? e.minutes : 24 * 60;
  }
  return { startMin: s.minutes, endMin: Math.max(endMin, s.minutes + 20) };
}

/**
 * Greedy interval coloring: lay overlapping timed items into side-by-side lanes.
 * Each item gets its `lane` index and the `lanes` count of its overlap cluster,
 * so the renderer can size width = 1/lanes and offset left = lane/lanes.
 */
export function assignLanes<T extends TimedRange>(
  items: T[],
): (T & { lane: number; lanes: number })[] {
  const sorted = [...items].sort(
    (a, b) => a.startMin - b.startMin || a.endMin - b.endMin,
  );
  const out: (T & { lane: number; lanes: number })[] = [];
  let cluster: (T & { lane: number; lanes: number })[] = [];
  let clusterEnd = -1;
  const laneEnds: number[] = []; // last endMin per lane in the current cluster

  const closeCluster = () => {
    const lanes = laneEnds.length || 1;
    for (const c of cluster) c.lanes = lanes;
    laneEnds.length = 0;
    cluster = [];
  };

  for (const it of sorted) {
    if (it.startMin >= clusterEnd && cluster.length > 0) closeCluster();
    let lane = laneEnds.findIndex((end) => end <= it.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(it.endMin);
    } else {
      laneEnds[lane] = it.endMin;
    }
    const placed = { ...it, lane, lanes: 1 };
    cluster.push(placed);
    out.push(placed);
    clusterEnd = Math.max(clusterEnd, it.endMin);
  }
  if (cluster.length > 0) closeCluster();
  return out;
}
