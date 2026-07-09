"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { calendarHref, type CalItem } from "./grid";

/**
 * Week/Day time grid: a sticky day-header row, an all-day band, then a 24-hour
 * body. Timed items are absolutely positioned within their day column from a
 * precomputed lane layout (overlaps split side-by-side). The grid is a dumb
 * renderer — the workspace owns bucketing + what each tile looks like via
 * `renderTile`, so app/external styling lives in one place.
 */

export type Placed = {
  item: CalItem;
  startMin: number;
  endMin: number;
  lane: number;
  lanes: number;
};

const HOUR_H = 44; // px per hour
const HOURS = Array.from({ length: 24 }, (_, h) => h);

function dayParts(iso: string): { weekday: string; dayNum: string } {
  const d = new Date(`${iso}T00:00:00`);
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
    dayNum: d.toLocaleDateString(undefined, { day: "numeric" }),
  };
}

function hourLabel(h: number): string {
  if (h === 0) return "";
  const period = h < 12 ? "AM" : "PM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr} ${period}`;
}

export function TimeGrid({
  days,
  today,
  allDay,
  timed,
  renderTile,
  onSlotClick,
  onDropTimed,
  onDropAllDay,
}: {
  days: string[];
  today: string;
  allDay: Record<string, CalItem[]>;
  timed: Record<string, Placed[]>;
  renderTile: (item: CalItem, opts: { block: boolean }) => ReactNode;
  onSlotClick?: (dayKey: string, minutes: number) => void;
  onDropTimed?: (dayKey: string, minutes: number, id: string) => void;
  onDropAllDay?: (dayKey: string, id: string) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);

  // Open near the working day rather than midnight.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 7 * HOUR_H;
  }, []);

  const anyAllDay = days.some((d) => (allDay[d]?.length ?? 0) > 0);

  const slotMinutes = (e: React.MouseEvent<HTMLDivElement>): number => {
    // currentTarget is the .tg-col, which scrolls INSIDE .tg-body — so its
    // getBoundingClientRect().top already reflects the scroll offset. Adding
    // scrollTop again double-counted it (clicks landed hours late).
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const raw = (y / HOUR_H) * 60;
    return Math.max(0, Math.min(23 * 60 + 30, Math.round(raw / 30) * 30)); // snap 30m
  };

  return (
    <div className="tg" style={{ ["--cols" as string]: days.length, ["--hour-h" as string]: `${HOUR_H}px` }}>
      <div className="tg-head">
        <span className="tg-corner" aria-hidden="true" />
        <div className="tg-headcols">
          {days.map((d) => {
            const { weekday, dayNum } = dayParts(d);
            return (
              <Link
                key={d}
                href={calendarHref("day", d, today)}
                scroll={false}
                className={"tg-dayhead" + (d === today ? " is-today" : "")}
              >
                <span className="tg-wd">{weekday}</span>
                <span className="tg-dn">{dayNum}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {anyAllDay ? (
        <div className="tg-allday">
          <span className="tg-gutlabel">all-day</span>
          <div className="tg-alldaycols">
            {days.map((d) => (
              <div
                key={d}
                className="tg-alldaycol"
                onDragOver={
                  onDropAllDay
                    ? (e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                      }
                    : undefined
                }
                onDrop={
                  onDropAllDay
                    ? (e) => {
                        e.preventDefault();
                        const id = e.dataTransfer.getData("text/plain");
                        if (id) onDropAllDay(d, id);
                      }
                    : undefined
                }
              >
                {(allDay[d] ?? []).map((it) => renderTile(it, { block: false }))}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="tg-body" ref={bodyRef}>
        <div className="tg-gutter">
          {HOURS.map((h) => (
            <div key={h} className="tg-hour" style={{ height: HOUR_H }}>
              <span>{hourLabel(h)}</span>
            </div>
          ))}
        </div>
        <div className="tg-cols">
          {days.map((d) => (
            <div
              key={d}
              className="tg-col"
              style={{ height: 24 * HOUR_H }}
              onClick={
                onSlotClick ? (e) => onSlotClick(d, slotMinutes(e)) : undefined
              }
              onDragOver={
                onDropTimed
                  ? (e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }
                  : undefined
              }
              onDrop={
                onDropTimed
                  ? (e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/plain");
                      if (id) onDropTimed(d, slotMinutes(e), id);
                    }
                  : undefined
              }
            >
              {(timed[d] ?? []).map((p) => {
                const top = (p.startMin / 60) * HOUR_H;
                const height = Math.max(((p.endMin - p.startMin) / 60) * HOUR_H, 16);
                const width = 100 / p.lanes;
                return (
                  <div
                    key={
                      p.item.kind === "app" ? p.item.task.id : p.item.event.id
                    }
                    className="tg-event"
                    style={{
                      top,
                      height,
                      left: `calc(${p.lane * width}% + 1px)`,
                      width: `calc(${width}% - 2px)`,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {renderTile(p.item, { block: true })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
