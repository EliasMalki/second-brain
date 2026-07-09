"use client";

import {
  useEffect,
  useMemo,
  useOptimistic,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { AppTile, ExternalTile } from "./event-tile";
import { TimeGrid, type Placed } from "./time-grid";
import { MonthGrid } from "./month-grid";
import { ExternalEventPopover } from "./external-popover";
import { ComposePopover } from "./compose-popover";
import { AgendaList } from "./agenda-list";
import { TaskPanel } from "../tasks/task-panel";
import { UndoToast, useUndoToast } from "../undo-toast";
import {
  completeTaskAction,
  deleteTaskAction,
  hardDeleteTaskAction,
  quickUpdateTaskAction,
  reopenTaskQuietAction,
} from "../tasks/actions";
import {
  assignLanes,
  eventTimedRange,
  taskDay,
  taskTimedRange,
  wallInTz,
  type CalendarView,
  type CalItem,
} from "./grid";
import { addDaysISO } from "@/lib/dates";
import type {
  Availability,
  Effort,
  Priority,
  Task,
} from "@/lib/db/tasks";
import type { Recurrence } from "@/lib/db/recurrences";
import type { CalendarProviderId, NormalizedEvent } from "@/lib/calendar/types";

type ProjectOption = { id: string; name: string; color: string | null };
export type ExternalLayer = { provider: CalendarProviderId; events: NormalizedEvent[] };

type Mut =
  | { type: "remove"; id: string }
  | { type: "patch"; id: string; patch: Partial<Task> };

/** Map a quick-edit field+value to an optimistic Task patch (mirrors Tasks). */
function toPatch(field: string, value: string): Partial<Task> {
  switch (field) {
    case "title":
      return { title: value };
    case "priority":
      return { priority: value as Priority };
    case "scheduled_for":
      return { scheduled_for: value || null };
    case "due_date":
      return { due_date: value || null };
    case "project_id":
      return { project_id: value || null, record_id: null };
    case "record_id":
      return { record_id: value || null };
    case "effort":
      return { effort: (value || null) as Effort | null };
    case "availability":
      return { availability: (value || null) as Availability | null };
    case "body":
      return { body: value || null };
    case "start_at": {
      // timed: anchor the scheduled day to the new instant (browser/user tz),
      // 60-min default; the server preserves the real duration on revalidate.
      const day = value ? new Date(value).toLocaleDateString("en-CA") : null;
      const end = value
        ? new Date(new Date(value).getTime() + 3_600_000).toISOString()
        : null;
      return { start_at: value || null, scheduled_for: day, end_at: end };
    }
    case "all_day":
      return { scheduled_for: value || null, start_at: null, end_at: null };
    default:
      return {};
  }
}

const PRIORITY_ORDER: Record<Priority, number> = { A: 0, B: 1, C: 2, D: 3 };

/** "9:00 AM" in the user's tz. */
function fmtTimeShort(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Owns bucketing of every CalItem into day columns + the all-day vs timed split,
 * and renders the view's grid. App tiles carry project color + priority chip;
 * external tiles are muted + read-only. Interactivity (open panel, create from a
 * slot, drag-reschedule) lands in later steps; this is the read skeleton.
 */
export function CalendarWorkspace({
  view,
  days,
  monthIndex,
  tz,
  today,
  tasks,
  external,
  projects,
  recurrences,
  recordsByProject,
  recordLabelByProject,
}: {
  view: CalendarView;
  days: string[];
  monthIndex: number;
  tz: string;
  today: string;
  tasks: Task[];
  external: ExternalLayer[];
  projects: ProjectOption[];
  recurrences: Recurrence[];
  recordsByProject: Record<string, { id: string; name: string }[]>;
  recordLabelByProject: Record<string, string>;
}) {
  const projectColor = useMemo(() => {
    const m = new Map(projects.map((p) => [p.id, p.color]));
    return (id: string | null) => (id ? m.get(id) ?? null : null);
  }, [projects]);

  // Optimistic task list (mirrors TasksWorkspace) so the shared panel + drag
  // reflect edits instantly; revalidation refreshes the base.
  const [optimistic, applyMut] = useOptimistic(tasks, (state: Task[], m: Mut) =>
    m.type === "remove"
      ? state.filter((t) => t.id !== m.id)
      : state.map((t) => (t.id === m.id ? { ...t, ...m.patch } : t)),
  );
  const [, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const undo = useUndoToast();

  // Touch can't HTML5-drag; disable so it doesn't fight scrolling (the panel's
  // reschedule control is the touch path). Mirrors the Records board.
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    setCoarse(mq.matches);
    const onChange = () => setCoarse(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const selectedTask = selectedId
    ? optimistic.find((t) => t.id === selectedId) ?? null
    : null;
  const selectedRecurrence = selectedTask?.recurrence_id
    ? recurrences.find((r) => r.id === selectedTask.recurrence_id) ?? null
    : null;

  const fd = (entries: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(entries)) f.set(k, v);
    return f;
  };
  const select = (id: string) => setSelectedId((cur) => (cur === id ? null : id));
  const close = () => setSelectedId(null);

  const patch = (id: string, field: string, value: string) =>
    startTransition(async () => {
      applyMut({ type: "patch", id, patch: toPatch(field, value) });
      await quickUpdateTaskAction(fd({ id, field, value }));
    });
  const complete = (id: string) =>
    startTransition(async () => {
      applyMut({ type: "remove", id });
      if (id === selectedId) close();
      await completeTaskAction(fd({ id }));
    });
  const completeWithUndo = (task: Task) => {
    complete(task.id);
    undo.show({
      msg: `Completed “${task.title}”`,
      undo: () =>
        startTransition(async () => {
          await reopenTaskQuietAction(fd({ id: task.id }));
        }),
    });
  };
  const del = (id: string) =>
    startTransition(async () => {
      applyMut({ type: "remove", id });
      if (id === selectedId) close();
      await deleteTaskAction(fd({ id }));
    });
  const reopen = (id: string) =>
    startTransition(async () => {
      applyMut({ type: "remove", id });
      if (id === selectedId) close();
      await reopenTaskQuietAction(fd({ id }));
    });
  const hardDelete = (id: string) =>
    startTransition(async () => {
      applyMut({ type: "remove", id });
      if (id === selectedId) close();
      await hardDeleteTaskAction(fd({ id }));
    });

  const buckets = useMemo(
    () => bucketItems(optimistic, external, days, tz),
    [optimistic, external, days, tz],
  );

  // Selected external event → read-only detail popover (never editable).
  const [extSel, setExtSel] = useState<{
    provider: CalendarProviderId;
    event: NormalizedEvent;
  } | null>(null);

  // Clicked empty slot → the reused Tasks composer, pre-filled with day (+time).
  const [compose, setCompose] = useState<{ date: string; time: string | null } | null>(
    null,
  );
  const openSlotTimed = (dayKey: string, minutes: number) =>
    setCompose({ date: dayKey, time: minutesToHHMM(minutes) });
  const openSlotDay = (dayKey: string) => setCompose({ date: dayKey, time: null });

  // Restore a task's schedule to a captured prior state (powers drag undo).
  // Note: restoring a timed task resets its duration to the 60-min default —
  // acceptable for reversing an accidental drag; the day/time come back.
  const restoreSchedule = (
    id: string,
    prior: { start_at: string | null; scheduled_for: string | null },
  ) => {
    if (prior.start_at) patch(id, "start_at", prior.start_at);
    else patch(id, "all_day", prior.scheduled_for ?? "");
  };

  // Drag-reschedule (app items only; external tiles aren't draggable). Drop on
  // an hour slot → timed (start_at); on the all-day band / a month day → date-only.
  // Both mutate silently otherwise, so each offers an undo back to the prior slot
  // — and dropping a TIMED task onto a date discards its time, which undo restores.
  const dropTimed = (dayKey: string, minutes: number, id: string) => {
    const prior = optimistic.find((t) => t.id === id);
    const iso = new Date(`${dayKey}T${minutesToHHMM(minutes)}:00`).toISOString();
    patch(id, "start_at", iso);
    if (prior) {
      const snap = { start_at: prior.start_at, scheduled_for: prior.scheduled_for };
      undo.show({ msg: "Rescheduled", undo: () => restoreSchedule(id, snap) });
    }
  };
  const dropAllDay = (dayKey: string, id: string) => {
    const prior = optimistic.find((t) => t.id === id);
    const losesTime = !!prior?.start_at;
    patch(id, "all_day", dayKey);
    if (prior) {
      const snap = { start_at: prior.start_at, scheduled_for: prior.scheduled_for };
      undo.show({
        msg: losesTime ? "Moved — time cleared" : "Moved",
        undo: () => restoreSchedule(id, snap),
      });
    }
  };

  const renderTile = (item: CalItem, opts: { block: boolean }): ReactNode => {
    if (item.kind === "app") {
      const t = item.task;
      const time = t.start_at ? fmtTimeShort(t.start_at, tz) : null;
      return (
        <AppTile
          key={t.id}
          task={t}
          color={projectColor(t.project_id)}
          time={time}
          block={opts.block}
          selected={t.id === selectedId}
          dragging={t.id === draggingId}
          draggable={!coarse}
          onOpen={() => select(t.id)}
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", t.id);
            e.dataTransfer.effectAllowed = "move";
            setDraggingId(t.id);
          }}
          onDragEnd={() => setDraggingId(null)}
        />
      );
    }
    const e = item.event;
    const time = !e.allDay && e.start.dateTime ? fmtTimeShort(e.start.dateTime, tz) : null;
    return (
      <ExternalTile
        key={`${item.provider}:${e.id}`}
        event={e}
        provider={item.provider}
        time={time}
        block={opts.block}
        onOpen={() => setExtSel({ provider: item.provider, event: e })}
      />
    );
  };

  const grid =
    view === "month" ? (
      <MonthGrid
        days={days}
        monthIndex={monthIndex}
        today={today}
        cells={buckets.monthCells}
        renderTile={renderTile}
        onSlotClick={openSlotDay}
        onDropDay={dropAllDay}
      />
    ) : (
      <TimeGrid
        days={days}
        today={today}
        allDay={buckets.allDay}
        timed={buckets.timed}
        renderTile={renderTile}
        onSlotClick={openSlotTimed}
        onDropTimed={dropTimed}
        onDropAllDay={dropAllDay}
      />
    );

  return (
    <>
      <div className="panes cal-panes">
        <div className="cal-stage">
          {/* desktop: the grid; phone: a chronological agenda (CSS-toggled, both
              render from the same buckets so there's no hydration flash) */}
          <div className="cal-only-wide">{grid}</div>
          <div className="cal-only-narrow">
            <AgendaList
              days={days}
              agenda={buckets.monthCells}
              renderTile={renderTile}
              onAdd={openSlotDay}
            />
          </div>
        </div>
        {selectedTask ? (
          <TaskPanel
            key={selectedTask.id}
            task={selectedTask}
            projects={projects}
            recurrence={selectedRecurrence}
            recordsByProject={recordsByProject}
            recordLabelByProject={recordLabelByProject}
            onPatch={(field, value) => patch(selectedTask.id, field, value)}
            onComplete={() => completeWithUndo(selectedTask)}
            onDelete={() => del(selectedTask.id)}
            onReopen={() => reopen(selectedTask.id)}
            onHardDelete={() => hardDelete(selectedTask.id)}
            onClose={close}
          />
        ) : null}
      </div>

      {extSel ? (
        <ExternalEventPopover
          event={extSel.event}
          provider={extSel.provider}
          tz={tz}
          onClose={() => setExtSel(null)}
        />
      ) : null}
      {compose ? (
        <ComposePopover
          date={compose.date}
          time={compose.time}
          projects={projects}
          recordsByProject={recordsByProject}
          recordLabelByProject={recordLabelByProject}
          onClose={() => setCompose(null)}
        />
      ) : null}
      <UndoToast toast={undo.toast} onClear={undo.clear} />
    </>
  );
}

/** 870 → "14:30" for the time input. */
function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// --- bucketing --------------------------------------------------------------

type Buckets = {
  allDay: Record<string, CalItem[]>; // week/day: date-only items per day
  timed: Record<string, Placed[]>; // week/day: lane-laid timed items per day
  monthCells: Record<string, CalItem[]>; // month: all items per day, sorted
};

function appSortKey(t: Task): number {
  return PRIORITY_ORDER[t.priority as Priority] ?? 9;
}

type RawTimed = { item: CalItem; startMin: number; endMin: number };

function bucketItems(
  tasks: Task[],
  external: ExternalLayer[],
  days: string[],
  tz: string,
): Buckets {
  const dayset = new Set(days);
  const allDay: Record<string, CalItem[]> = {};
  const timedRaw: Record<string, RawTimed[]> = {};
  const monthTimed: Record<string, { item: CalItem; startMin: number }[]> = {};
  const monthAllDay: Record<string, CalItem[]> = {};

  const pushAllDay = (day: string, item: CalItem) => {
    if (!dayset.has(day)) return;
    (allDay[day] ??= []).push(item);
    (monthAllDay[day] ??= []).push(item);
  };
  const pushTimed = (
    day: string,
    item: CalItem,
    startMin: number,
    endMin: number,
  ) => {
    if (!dayset.has(day)) return;
    (timedRaw[day] ??= []).push({ item, startMin, endMin });
    (monthTimed[day] ??= []).push({ item, startMin });
  };

  // app tasks
  for (const t of tasks) {
    const d = taskDay(t, tz);
    if (!d) continue;
    const item: CalItem = { kind: "app", task: t };
    if (d.timed) {
      const r = taskTimedRange(t, tz);
      pushTimed(d.dayKey, item, r.startMin, r.endMin);
    } else {
      pushAllDay(d.dayKey, item);
    }
  }

  // external layers (Google today; bucketing handled here so providers are uniform)
  for (const layer of external) {
    for (const e of layer.events) {
      placeExternal(e, layer.provider, tz, pushAllDay, pushTimed);
    }
  }

  // sort all-day (app by priority then title; external after, by title)
  const sortAllDay = (arr: CalItem[]) =>
    arr.sort((a, b) => itemRank(a) - itemRank(b) || itemTitle(a).localeCompare(itemTitle(b)));
  for (const d of Object.keys(allDay)) sortAllDay(allDay[d]);
  for (const d of Object.keys(monthAllDay)) sortAllDay(monthAllDay[d]);

  // lane-lay timed per day for week/day
  const timed: Record<string, Placed[]> = {};
  for (const d of Object.keys(timedRaw)) {
    timed[d] = assignLanes(timedRaw[d]);
  }

  // month cells: timed (by start) then all-day
  const monthCells: Record<string, CalItem[]> = {};
  for (const d of days) {
    const t = (monthTimed[d] ?? []).sort((a, b) => a.startMin - b.startMin).map((x) => x.item);
    const a = monthAllDay[d] ?? [];
    if (t.length || a.length) monthCells[d] = [...t, ...a];
  }

  return { allDay, timed, monthCells };
}

function itemRank(it: CalItem): number {
  return it.kind === "app" ? appSortKey(it.task) : 8; // external sorts after app
}
function itemTitle(it: CalItem): string {
  return it.kind === "app" ? it.task.title : it.event.title;
}

/**
 * Place one external event. All-day events span [start.date, end.date) (Google's
 * end is exclusive) and render on each day; timed events take a slot on their
 * start day. Capped iterations guard against malformed spans.
 */
function placeExternal(
  e: NormalizedEvent,
  provider: CalendarProviderId,
  tz: string,
  pushAllDay: (day: string, item: CalItem) => void,
  pushTimed: (day: string, item: CalItem, s: number, en: number) => void,
): void {
  const item: CalItem = { kind: "external", provider, event: e };
  if (e.allDay) {
    const start = e.start.date;
    if (!start) return;
    const endExcl = e.end.date ?? addDaysISO(start, 1);
    let day = start;
    for (let i = 0; i < 90 && day < endExcl; i++) {
      pushAllDay(day, item);
      day = addDaysISO(day, 1);
    }
    return;
  }
  if (e.start.dateTime) {
    const w = wallInTz(e.start.dateTime, tz);
    const r = eventTimedRange(e.start.dateTime, e.end.dateTime, w.dayKey, tz);
    pushTimed(w.dayKey, item, r.startMin, r.endMin);
  }
}
