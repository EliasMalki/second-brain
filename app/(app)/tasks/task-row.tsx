"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { completeTaskAction, reopenTaskAction } from "./actions";
import { DonePill, RowUndo } from "../done-pill";
import { useRowCompletion } from "../use-row-completion";
import { ProjectTag } from "../project-tag";
import { projectColorVars } from "@/lib/colors";
import { fmtShort } from "@/lib/dates";
import type { Task } from "@/lib/db/tasks";

/**
 * One task row (mockup): [Done pill] [priority chip] [title + icon meta].
 * Shared by the project- and record-detail task lists. Completing runs the same
 * inline grace-period undo as everywhere else (Done pill → confirm → grace with
 * an inline Undo → the real complete fires at expiry and the row drops).
 *
 * `showScheduled` adds the scheduled date to the meta line (useful in Overdue
 * and the Tasks list, redundant inside a Week/day section that's already dated).
 */

/** A meta entry rendered as an optional Tabler icon + label. */
type Meta = { icon?: string; label: string };

function buildMeta(task: Task, showScheduled: boolean): Meta[] {
  const meta: Meta[] = [];
  if (task.recurrence_id) meta.push({ icon: "ti-refresh", label: "recurring" });
  if (showScheduled && task.scheduled_for) {
    meta.push({ icon: "ti-calendar", label: fmtShort(task.scheduled_for) });
  }
  if (task.due_date) {
    meta.push({ icon: "ti-calendar-event", label: `due ${fmtShort(task.due_date)}` });
  }
  if (task.effort) meta.push({ icon: "ti-bolt", label: task.effort });
  if (task.availability === "business_hours") {
    meta.push({ icon: "ti-briefcase", label: "9–5" });
  }
  if (task.status === "waiting" && task.waiting_on) {
    meta.push({ icon: "ti-user", label: `waiting on ${task.waiting_on}` });
  }
  return meta;
}

export function TaskRow({
  task,
  projectName,
  projectColor = null,
  recordName = null,
  showScheduled = true,
}: {
  task: Task;
  projectName: string | null;
  projectColor?: string | null;
  recordName?: string | null;
  showScheduled?: boolean;
}) {
  const [, startTransition] = useTransition();
  const [gone, setGone] = useState(false);
  const completing = useRowCompletion();

  const phase = completing.phaseOf(task.id);
  const grace = phase === "grace";
  const done = task.status === "done";
  const cancelled = task.status === "cancelled";
  const held = task.status === "waiting" || task.status === "snoozed";
  const struck = done || cancelled || !!phase;

  const fd = () => {
    const f = new FormData();
    f.set("id", task.id);
    return f;
  };
  const complete = () =>
    completing.complete(task.id, {
      completeAction: () => {
        void completeTaskAction(fd());
      },
      // hide immediately at expiry; the completeAction's revalidate then drops
      // it from the server list for good
      onRemove: () => setGone(true),
    });
  const reopen = () =>
    startTransition(() => {
      void reopenTaskAction(fd());
    });

  if (gone) return null;

  const meta = buildMeta(task, showScheduled);
  const edge = projectColorVars(projectColor);

  // The leading chip: a pause glyph for held tasks, otherwise the priority
  // letter — dimmed once the task is done/cancelled/completing.
  const chipClass = held
    ? "chip chip-muted"
    : `chip chip-${task.priority}${struck ? " chip-dim" : ""}`;

  return (
    <li className={edge ? "task-item edged dp-row" : "task-item dp-row"} style={edge}>
      {done ? (
        <button
          type="button"
          className="check checked"
          onClick={reopen}
          title="Reopen"
          aria-label="Reopen"
        >
          <i className="ti ti-check" aria-hidden="true" />
        </button>
      ) : (
        <DonePill
          phase={phase ? (phase === "confirm" ? "confirm" : "done") : "idle"}
          onComplete={complete}
          ariaLabel={`Complete “${task.title}”`}
        />
      )}

      <span className={chipClass}>
        {held ? (
          <i className="ti ti-player-pause" style={{ fontSize: 13 }} aria-hidden="true" />
        ) : (
          task.priority
        )}
      </span>

      <div className="task-body">
        <Link href={`/tasks/${task.id}`} className="task-link">
          <p className={`task-title${struck ? " done" : ""}`}>{task.title}</p>
          {projectName || recordName || meta.length > 0 ? (
            <div className="task-meta">
              {projectName ? (
                <ProjectTag name={projectName} color={projectColor} />
              ) : null}
              {recordName ? (
                <span className="rtag" title={recordName}>
                  <i className="ti ti-folders" aria-hidden="true" />
                  <span className="rtag-name">{recordName}</span>
                </span>
              ) : null}
              {meta.map((m, i) => (
                <span key={i}>
                  {m.icon ? <i className={`ti ${m.icon}`} aria-hidden="true" /> : null}
                  {m.label}
                </span>
              ))}
            </div>
          ) : null}
        </Link>
      </div>

      {grace ? <RowUndo onUndo={() => completing.undo(task.id)} /> : null}
    </li>
  );
}
