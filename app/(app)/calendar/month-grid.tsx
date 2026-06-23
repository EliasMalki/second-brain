"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { calendarHref, type CalItem } from "./grid";

/**
 * Month: a fixed 6-week day-cell grid (no hour rows). Each cell lists its items
 * (timed first by time, then all-day) capped with a "+N more" link into that
 * day. Out-of-month days are dimmed; today gets a ring. Dumb renderer — the
 * workspace supplies sorted items per day + the tile renderer.
 */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_TILES = 3;

export function MonthGrid({
  days,
  monthIndex,
  today,
  cells,
  renderTile,
  onSlotClick,
  onDropOnDay,
}: {
  days: string[];
  monthIndex: number; // 0–11 of the focused month, to dim spill-over days
  today: string;
  cells: Record<string, CalItem[]>;
  renderTile: (item: CalItem, opts: { block: boolean }) => ReactNode;
  onSlotClick?: (dayKey: string) => void;
  onDropOnDay?: (dayKey: string) => void;
}) {
  return (
    <div className="mg">
      <div className="mg-weekdays">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="mg-grid">
        {days.map((d) => {
          const inMonth = Number(d.split("-")[1]) - 1 === monthIndex;
          const items = cells[d] ?? [];
          const shown = items.slice(0, MAX_TILES);
          const extra = items.length - shown.length;
          const dayNum = Number(d.split("-")[2]);
          return (
            <div
              key={d}
              className={
                "mg-cell" + (inMonth ? "" : " out") + (d === today ? " is-today" : "")
              }
              onClick={onSlotClick ? () => onSlotClick(d) : undefined}
              onDragOver={
                onDropOnDay
                  ? (e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }
                  : undefined
              }
              onDrop={
                onDropOnDay
                  ? (e) => {
                      e.preventDefault();
                      onDropOnDay(d);
                    }
                  : undefined
              }
            >
              <span className="mg-daynum">{dayNum}</span>
              <div className="mg-cellitems">
                {shown.map((it) => renderTile(it, { block: false }))}
                {extra > 0 ? (
                  <Link
                    href={calendarHref("day", d, today)}
                    scroll={false}
                    className="mg-more"
                    onClick={(e) => e.stopPropagation()}
                  >
                    +{extra} more
                  </Link>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
