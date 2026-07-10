"use client";

import { type ReactNode } from "react";
import { fmtDayLabel } from "@/lib/dates";
import type { CalItem } from "./grid";

/**
 * Chronological agenda — the mobile fallback for every view, and the desktop
 * fallback when a week/day has no timed items. Renders EVERY day in the window
 * (empty days kept compact) so a task can be added to any day via its "+", not
 * only days that already have items. Same buckets as the grids.
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
  return (
    <div className="agenda">
      {days.map((d) => {
        const items = agenda[d] ?? [];
        return (
          <section
            key={d}
            className={items.length ? "agenda-day" : "agenda-day is-empty"}
          >
            <div className="agenda-head">
              <span className="agenda-date">{fmtDayLabel(d)}</span>
              {onAdd ? (
                <button
                  type="button"
                  className="agenda-add"
                  onClick={() => onAdd(d)}
                  aria-label={`Add task on ${fmtDayLabel(d)}`}
                  title="Add task"
                >
                  <i className="ti ti-plus" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            {items.length ? (
              <div className="agenda-items">
                {items.map((it) => renderTile(it, { block: false }))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
