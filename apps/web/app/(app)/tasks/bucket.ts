import {
  BUCKET_LABEL,
  BUCKET_ORDER,
  bucketOf,
  byPriority,
  dateCmp,
  isOverdue,
  overdueDate,
  type Bucket,
} from "@second-brain/shared/domain/buckets";
import { addDaysISO, fmtLate, fmtShort, todayISO } from "@second-brain/shared/domain/dates";
import type { TaskSort } from "./params";
import type { Task } from "@/lib/db/tasks";

export function makeComparator(
  sort: TaskSort,
  projectName: (id: string | null) => string | null,
): (a: Task, b: Task) => number {
  return (a, b) => {
    switch (sort) {
      case "due":
        return dateCmp(a.due_date, b.due_date) || byPriority(a, b);
      case "project": {
        const an = projectName(a.project_id);
        const bn = projectName(b.project_id);
        if (an === bn) return byPriority(a, b);
        if (an === null) return 1;
        if (bn === null) return -1;
        return an.localeCompare(bn) || byPriority(a, b);
      }
      case "created":
        return a.created_at.localeCompare(b.created_at);
      default:
        return byPriority(a, b);
    }
  };
}

// ---- the "when" cell -------------------------------------------------------
/** HH:MM in the browser tz for a timed (start_at) task. */
function fmtClock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function weekday(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
  });
}

export type Section = { key: Bucket | "completed"; label: string; over: boolean; tasks: Task[] };

/**
 * Group already-filtered tasks into the ordered, non-empty buckets both views
 * render. `completed` collapses everything into a single "Completed" section.
 */
export function buildSections(
  tasks: Task[],
  sort: TaskSort,
  projectName: (id: string | null) => string | null,
  today = todayISO(),
  completed = false,
): Section[] {
  const cmp = makeComparator(sort, projectName);
  if (completed) {
    if (tasks.length === 0) return [];
    return [
      { key: "completed", label: "Completed", over: false, tasks: [...tasks] },
    ];
  }
  const groups = new Map<Bucket, Task[]>();
  for (const t of tasks) {
    const b = bucketOf(t, today);
    (groups.get(b) ?? groups.set(b, []).get(b)!).push(t);
  }
  const out: Section[] = [];
  for (const b of BUCKET_ORDER) {
    const list = groups.get(b);
    if (!list || list.length === 0) continue;
    out.push({ key: b, label: BUCKET_LABEL[b], over: b === "overdue", tasks: list.sort(cmp) });
  }
  return out;
}

export type When = { text: string; over: boolean; icon: string | null };

/**
 * The compact "when" label. List rows show `text` only (danger when overdue);
 * Grid card footers show `icon` + `text`, treating the em-dash placeholder as
 * empty (a bare card with just the Done pill, per the design).
 */
export function whenCell(task: Task, today = todayISO()): When {
  if (isOverdue(task, today)) {
    const d = overdueDate(task);
    return { text: d ? fmtLate(d, today) : "late", over: true, icon: "ti-calendar-x" };
  }
  if (task.start_at && task.scheduled_for === today) {
    return { text: fmtClock(task.start_at), over: false, icon: "ti-clock" };
  }
  const s = task.scheduled_for;
  if (s) {
    if (s === today) return { text: "Today", over: false, icon: "ti-calendar-event" };
    if (s === addDaysISO(today, 1))
      return { text: "Tomorrow", over: false, icon: "ti-calendar-event" };
    const end = addDaysISO(today, 7);
    if (s <= end) return { text: weekday(s), over: false, icon: "ti-calendar" };
    return { text: fmtShort(s), over: false, icon: "ti-calendar" };
  }
  if (task.due_date)
    return { text: `due ${fmtShort(task.due_date)}`, over: false, icon: "ti-calendar-event" };
  return { text: "—", over: false, icon: null };
}
