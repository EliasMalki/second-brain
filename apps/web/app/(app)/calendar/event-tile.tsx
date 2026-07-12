"use client";

import { projectColorVars } from "@/lib/colors";
import { SourceIcon } from "./source-icon";
import type { Priority, Task } from "@/lib/db/tasks";
import type { CalendarProviderId, NormalizedEvent } from "@/lib/calendar/types";

/**
 * Calendar tiles. App tiles are "yours": project-color edge + priority chip,
 * clickable to open the shared Tasks detail panel (wired in step 4). External
 * tiles are display-only and muted, with a generic source-icon slot (step 2).
 *
 * `block` = a timed block that fills its absolutely-positioned box in the hour
 * grid; otherwise a compact row (month cells + the all-day band).
 */

export function AppTile({
  task,
  color,
  time,
  block = false,
  selected = false,
  dragging = false,
  draggable = false,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  color: string | null;
  time?: string | null;
  block?: boolean;
  selected?: boolean;
  dragging?: boolean;
  draggable?: boolean;
  onOpen?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}) {
  const cls =
    "cev cev-app" +
    (color ? " edged" : "") +
    (block ? " cev-block" : "") +
    (selected ? " sel" : "") +
    (dragging ? " dragging" : "");
  return (
    <button
      type="button"
      className={cls}
      style={projectColorVars(color)}
      title={task.title}
      onClick={(e) => {
        e.stopPropagation(); // don't also trigger the cell's slot-add
        onOpen?.();
      }}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <span className={`chip chip-${task.priority as Priority}`} aria-hidden="true">
        {task.priority}
      </span>
      {time ? <span className="cev-time">{time}</span> : null}
      <span className="cev-title">{task.title}</span>
    </button>
  );
}

export function ExternalTile({
  event,
  provider,
  time,
  block = false,
  onOpen,
}: {
  event: NormalizedEvent;
  provider: CalendarProviderId;
  time?: string | null;
  block?: boolean;
  onOpen?: () => void;
}) {
  return (
    <button
      type="button"
      className={"cev cev-ext" + (block ? " cev-block" : "")}
      title={event.title}
      onClick={(e) => {
        e.stopPropagation();
        onOpen?.();
      }}
    >
      {time ? <span className="cev-time">{time}</span> : null}
      <span className="cev-title">{event.title}</span>
      {/* generic source slot — the at-a-glance "external, read-only" cue */}
      <span className="cev-src" aria-hidden="true">
        <SourceIcon provider={provider} size={13} />
      </span>
    </button>
  );
}
