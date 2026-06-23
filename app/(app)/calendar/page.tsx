import { listProjects } from "@/lib/db/projects";
import { listTasksForCalendar } from "@/lib/db/tasks";
import { getUserTimezone } from "@/lib/db/calendar";
import { todayISO } from "@/lib/dates";
import { CalendarNav } from "./calendar-nav";
import { CalendarWorkspace, type ExternalLayer } from "./calendar-workspace";
import { addMonthsISO, parseCalendarParams, windowFor } from "./grid";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

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

  const [projects, tasks, tz] = await Promise.all([
    listProjects(),
    listTasksForCalendar(startISO, endISO),
    getUserTimezone(),
  ]);

  const projOpts = projects.map((p) => ({ id: p.id, name: p.name, color: p.color }));
  const external: ExternalLayer[] = []; // Google overlay wired in step 2

  return (
    <>
      <div className="view-head">
        <span className="view-title">Calendar</span>
      </div>

      <CalendarNav view={view} anchor={anchor} title={headTitle(view, days, anchor)} today={today} />

      <CalendarWorkspace
        view={view}
        days={days}
        monthIndex={monthIndex}
        tz={tz}
        today={today}
        tasks={tasks}
        external={external}
        projects={projOpts}
      />
    </>
  );
}
