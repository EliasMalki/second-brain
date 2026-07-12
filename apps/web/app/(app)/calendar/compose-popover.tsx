"use client";

import { useEffect } from "react";
import { QuickAddTask } from "../tasks/quick-add-task";
import { useDismissable } from "../use-dismissable";
import { fmtShort } from "@second-brain/shared/domain/dates";

/**
 * Slot-click composer. Wraps the EXACT Tasks-page add-task component (no
 * calendar-specific form) in a popover, pre-filled with the clicked day and —
 * in week/day — the clicked hour. On success the composer calls onClose. Esc /
 * backdrop click also closes.
 */
export function ComposePopover({
  date,
  time,
  projects,
  recordsByProject,
  recordLabelByProject,
  onClose,
}: {
  date: string;
  time: string | null;
  projects: { id: string; name: string }[];
  recordsByProject: Record<string, { id: string; name: string }[]>;
  recordLabelByProject: Record<string, string>;
  onClose: () => void;
}) {
  // exit mirrors the entrance (§7): requestClose plays it, then unmounts
  const { closing, requestClose } = useDismissable(onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [requestClose]);

  return (
    <div
      className={`cal-pop-backdrop${closing ? " is-closing" : ""}`}
      onClick={requestClose}
    >
      <div
        className={`cal-pop cal-compose${closing ? " is-closing" : ""}`}
        role="dialog"
        aria-label="Add task"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cal-pop-head">
          <span className="cal-pop-src">
            <i className="ti ti-plus" aria-hidden="true" /> New task ·{" "}
            {fmtShort(date)}
            {time ? ` · ${time}` : ""}
          </span>
          <button
            type="button"
            className="panel-x"
            onClick={requestClose}
            aria-label="Close"
            title="Close"
          >
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>

        <QuickAddTask
          projects={projects}
          defaultScheduledFor={date}
          defaultStartTime={time ?? undefined}
          recordsByProject={recordsByProject}
          recordLabelByProject={recordLabelByProject}
          onCreated={requestClose}
        />
      </div>
    </div>
  );
}
