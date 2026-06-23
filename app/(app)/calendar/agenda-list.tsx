"use client";

import { type ReactNode } from "react";
import { fmtDayLabel } from "@/lib/dates";
import type { CalItem } from "./grid";

/**
 * Mobile fallback for every view: a chronological agenda. A 7-column week grid
 * and a month tile grid don't fit a phone, so on narrow screens the window
 * collapses to a vertical list of its days-with-items (tiles stay interactive
 * via the shared renderTile; each day offers a "+"). Same buckets as the grids.
 */
export function AgendaList({
  days,
  agenda,
  renderTile,
  onAdd,
}: {
  days: string[];
  agenda: Record<string, CalItem[]>;
  renderTile: (item: CalItem, opts: { block: boolean }) => ReactNode;
  onAdd?: (dayKey: string) => void;
}) {
  const active = days.filter((d) => (agenda[d]?.length ?? 0) > 0);

  if (active.length === 0) {
    return (
      <div className="agenda agenda-empty">
        <i className="ti ti-calendar-off" aria-hidden="true" />
        Nothing scheduled in this range.
      </div>
    );
  }

  return (
    <div className="agenda">
      {active.map((d) => (
        <section key={d} className="agenda-day">
          <div className="agenda-head">
            <span className="agenda-date">{fmtDayLabel(d)}</span>
            {onAdd ? (
              <button
                type="button"
                className="agenda-add"
                onClick={() => onAdd(d)}
                aria-label="Add task this day"
                title="Add task"
              >
                <i className="ti ti-plus" aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <div className="agenda-items">
            {agenda[d].map((it) => renderTile(it, { block: false }))}
          </div>
        </section>
      ))}
    </div>
  );
}
