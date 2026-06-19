import Link from "next/link";
import type { TodayCalendar } from "@/lib/db/calendar";

/**
 * Read-only "Today's calendar" block on the home screen. Renders per the
 * fail-soft status from getTodayEvents() — never assumes events loaded.
 */

function fmtTime(dateTime: string | null, allDay: boolean, tz: string): string {
  if (allDay) return "All day";
  if (!dateTime) return "";
  return new Date(dateTime).toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CalendarToday({ data }: { data: TodayCalendar }) {
  // Errors fail soft — render nothing rather than alarm the user.
  if (data.status === "error") return null;

  if (data.status === "disconnected") {
    return (
      <p className="cal-cta">
        <i className="ti ti-calendar-plus" aria-hidden="true" />{" "}
        <Link href="/settings/calendar">Connect Google Calendar</Link> to see your
        day here.
      </p>
    );
  }

  if (data.status === "needs_reconnect") {
    return (
      <p className="cal-cta warn">
        <i className="ti ti-calendar-exclamation" aria-hidden="true" /> Google
        Calendar needs reconnecting —{" "}
        <Link href="/settings/calendar">fix it</Link>.
      </p>
    );
  }

  return (
    <section className="peek">
      <p className="section-label">
        <i className="ti ti-calendar" aria-hidden="true" /> Today&apos;s calendar
      </p>
      {data.events.length === 0 ? (
        <p className="muted-note">No events today.</p>
      ) : (
        data.events.map((e) => (
          <div className="cal-row" key={e.id}>
            <span className="cal-time">
              {fmtTime(e.start.dateTime, e.allDay, data.timezone)}
            </span>
            <span className="cal-title">{e.title}</span>
            {e.location ? <span className="cal-loc">{e.location}</span> : null}
          </div>
        ))
      )}
    </section>
  );
}
