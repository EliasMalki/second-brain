"use client";

import { useMemo, type ReactNode } from "react";
import { AppTile, ExternalTile } from "./event-tile";
import { TimeGrid, type Placed } from "./time-grid";
import { MonthGrid } from "./month-grid";
import {
  assignLanes,
  taskDay,
  taskTimedRange,
  type CalendarView,
  type CalItem,
} from "./grid";
import type { Priority, Task } from "@/lib/db/tasks";
import type { CalendarProviderId, NormalizedEvent } from "@/lib/calendar/types";

type ProjectOption = { id: string; name: string; color: string | null };
export type ExternalLayer = { provider: CalendarProviderId; events: NormalizedEvent[] };

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
}: {
  view: CalendarView;
  days: string[];
  monthIndex: number;
  tz: string;
  today: string;
  tasks: Task[];
  external: ExternalLayer[];
  projects: ProjectOption[];
}) {
  const projectColor = useMemo(() => {
    const m = new Map(projects.map((p) => [p.id, p.color]));
    return (id: string | null) => (id ? m.get(id) ?? null : null);
  }, [projects]);

  const buckets = useMemo(
    () => bucketItems(tasks, external, days, tz),
    [tasks, external, days, tz],
  );

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
      />
    );
  };

  if (view === "month") {
    return (
      <MonthGrid
        days={days}
        monthIndex={monthIndex}
        today={today}
        cells={buckets.monthCells}
        renderTile={renderTile}
      />
    );
  }

  return (
    <TimeGrid
      days={days}
      today={today}
      allDay={buckets.allDay}
      timed={buckets.timed}
      renderTile={renderTile}
    />
  );
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

/** Placeholder external placement — fully exercised once Google events flow in. */
function placeExternal(
  e: NormalizedEvent,
  provider: CalendarProviderId,
  tz: string,
  pushAllDay: (day: string, item: CalItem) => void,
  pushTimed: (day: string, item: CalItem, s: number, en: number) => void,
): void {
  void e;
  void provider;
  void tz;
  void pushAllDay;
  void pushTimed;
}
