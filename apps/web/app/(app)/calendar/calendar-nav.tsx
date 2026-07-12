import Link from "next/link";
import { calendarHref, shiftAnchor, type CalendarView } from "./grid";

/**
 * Calendar header: a title, prev/today/next stepping, and the week/month/day
 * toggle. View + anchor live in the URL (like the Records list/board toggle) so
 * the chosen view survives a refresh and is shareable. Pure Links — no client JS.
 */
const VIEWS: { key: CalendarView; label: string; icon: string }[] = [
  { key: "week", label: "Week", icon: "ti-calendar-week" },
  { key: "month", label: "Month", icon: "ti-calendar-month" },
  { key: "day", label: "Day", icon: "ti-calendar-event" },
];

export function CalendarNav({
  view,
  anchor,
  title,
  today,
}: {
  view: CalendarView;
  anchor: string;
  title: string;
  today: string;
}) {
  return (
    <div className="cal-nav">
      <div className="cal-nav-left">
        <Link
          className="cal-step"
          href={calendarHref(view, shiftAnchor(view, anchor, -1), today)}
          scroll={false}
          aria-label="Previous"
        >
          <i className="ti ti-chevron-left" aria-hidden="true" />
        </Link>
        <Link
          className="cal-step"
          href={calendarHref(view, shiftAnchor(view, anchor, 1), today)}
          scroll={false}
          aria-label="Next"
        >
          <i className="ti ti-chevron-right" aria-hidden="true" />
        </Link>
        <Link className="cal-today" href={calendarHref(view, today, today)} scroll={false}>
          Today
        </Link>
        <span className="cal-title">{title}</span>
      </div>

      <div className="viewtoggle" role="group" aria-label="Calendar view">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={calendarHref(v.key, anchor, today)}
            scroll={false}
            className={view === v.key ? "on" : ""}
            aria-current={view === v.key ? "true" : undefined}
          >
            <i className={`ti ${v.icon}`} aria-hidden="true" />
            {v.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
