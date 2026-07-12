"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { scheduleTaskTodayAction } from "./home-actions";

/**
 * The Home hub's backlog pool: open tasks with no schedule and no due date,
 * shown as recessed wrapping pills. Capped at `initialVisible`; "+N more"
 * expands. Tapping a pill opens a small action menu — pull it into Today
 * (schedule for today) or open the task. A pool to pull from, not a list.
 */

export type BacklogItem = { id: string; title: string; project: string | null };

export function BacklogPool({
  items,
  initialVisible = 8,
}: {
  items: BacklogItem[];
  initialVisible?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  // Close the open menu on an outside click or Escape.
  useEffect(() => {
    if (!openId) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".pool-item")) setOpenId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openId]);

  const hidden = items.length - initialVisible;
  const visible = expanded ? items : items.slice(0, initialVisible);

  return (
    <div className="pool">
      {visible.map((item) => (
        <div className="pool-item" key={item.id}>
          <button
            type="button"
            className="pool-pill"
            aria-haspopup="menu"
            aria-expanded={openId === item.id}
            onClick={() => setOpenId(openId === item.id ? null : item.id)}
          >
            {item.project ? (
              <span className="pool-tag">{item.project}</span>
            ) : null}
            <span className="pool-title">{item.title}</span>
          </button>

          {openId === item.id ? (
            <div className="pool-menu" role="menu">
              <form
                action={scheduleTaskTodayAction}
                onSubmit={() => setOpenId(null)}
              >
                <input type="hidden" name="id" value={item.id} />
                <button type="submit" className="pool-menu-item" role="menuitem">
                  <i className="ti ti-calendar-plus" aria-hidden="true" />
                  Schedule today
                </button>
              </form>
              <Link
                href={`/tasks/${item.id}`}
                className="pool-menu-item"
                role="menuitem"
              >
                <i className="ti ti-arrow-up-right" aria-hidden="true" />
                Open task
              </Link>
            </div>
          ) : null}
        </div>
      ))}

      {hidden > 0 ? (
        <button
          type="button"
          className="pool-more"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? "Show less" : `+${hidden} more`}
        </button>
      ) : null}
    </div>
  );
}
