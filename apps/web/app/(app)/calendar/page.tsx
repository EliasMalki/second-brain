import Link from "next/link";
import { listProjects } from "@/lib/db/projects";
import { listTasksForCalendar } from "@/lib/db/tasks";
import { listRecurrences } from "@/lib/db/recurrences";
import { recordPickerData } from "@/lib/db/records";
import { getEventsInRange, getUserTimezone, type RangeCalendar } from "@/lib/db/calendar";
import { todayISO } from "@second-brain/shared/domain/dates";
import { CalendarNav } from "./calendar-nav";
import { CalendarWorkspace, type ExternalLayer } from "./calendar-workspace";
import { addMonthsISO, parseCalendarParams, windowFor } from "./grid";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Calendar-connection banner above the grid. Mirrors the Home "Today's calendar"
 * copy: a CTA when disconnected, a warning when the token died. Errors fail soft
 * (render nothing) — the calendar still shows app items. `ok` shows nothing.
 */
function ConnectionNote({ status }: { status: RangeCalendar["status"] }) {
  if (status === "disconnected") {
    return (
      <p className="cal-cta">
        <i className="ti ti-calendar-plus" aria-hidden="true" />{" "}
        <Link href="/settings/calendar">Connect Google Calendar</Link> to see your
        events alongside your tasks.
      </p>
    );
  }
  if (status === "needs_reconnect") {
    return (
      <p className="cal-cta warn">
        <i className="ti ti-calendar-exclamation" aria-hidden="true" /> Google
        Calendar needs reconnecting — <Link href="/settings/calendar">fix it</Link>.
      </p>
    );
  }
  return null;
}

/** Header title per view: "June 2026" / "Jun 16 – 22" / "Mon, Jun 16". */
function headTitle(view: string, days: string[], anchor: string): string {
  const d = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, opts);
  if (view === "month") {
    return d(addMonthsISO(anchor, 0), { month: "long", year: "numeric" });
  }
  if (view === "day") {
    return d(anchor, { weekday: "long", month: "short", day: "numeric", year: "numeric" });
  }
  const a = days[0];
  const b = days[days.length - 1];
  const sameMonth = a.slice(0, 7) === b.slice(0, 7);
  return sameMonth
    ? `${d(a, { month: "short", day: "numeric" })} – ${d(b, { day: "numeric" })}`
    : `${d(a, { month: "short", day: "numeric" })} – ${d(b, { month: "short", day: "numeric" })}`;
}

/**
 * Calendar view: two layers in one grid — your tasks/appointments (editable) and
 * external calendar events (read-only). URL-driven (?view & ?date) so it's
 * shareable and server-rendered (RLS-scoped). External overlay arrives in step 2.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { view, anchor } = parseCalendarParams({
    view: first(searchParams.view),
    date: first(searchParams.date),
  });
  const today = todayISO();
  const { startISO, endISO, days } = windowFor(view, anchor);
  const monthIndex = Number(addMonthsISO(anchor, 0).split("-")[1]) - 1;

  const [projects, tasks, tz, calendar, recordData, recurrences] = await Promise.all([
    listProjects(),
    listTasksForCalendar(startISO, endISO),
    getUserTimezone(),
    // getEventsInRange never throws, but guard so a calendar hiccup can never
    // reject this Promise.all — app items must still render.
    getEventsInRange(startISO, endISO).catch((): RangeCalendar => ({ status: "error" })),
    recordPickerData(),
    listRecurrences(),
  ]);

  const projOpts = projects.map((p) => ({ id: p.id, name: p.name, color: p.color }));
  const external: ExternalLayer[] =
    calendar.status === "ok"
      ? [{ provider: calendar.provider, events: calendar.events }]
      : [];

  return (
    <>
      <div className="view-head">
        <span className="view-title">Calendar</span>
      </div>

      <CalendarNav view={view} anchor={anchor} title={headTitle(view, days, anchor)} today={today} />

      <ConnectionNote status={calendar.status} />

      <CalendarWorkspace
        view={view}
        days={days}
        monthIndex={monthIndex}
        tz={tz}
        today={today}
        tasks={tasks}
        external={external}
        projects={projOpts}
        recurrences={recurrences}
        recordsByProject={recordData.byProject}
        recordLabelByProject={recordData.labelByProject}
      />
    </>
  );
}
