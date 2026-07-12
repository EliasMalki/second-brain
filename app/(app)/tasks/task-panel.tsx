"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { RecurrenceFields } from "./recurrence-fields";
import { setTaskRepeatAction } from "./recurrence-actions";
import { DonePill, RowUndo } from "../done-pill";
import type { CompletionPhase } from "../use-row-completion";
import { addDaysISO, endOfWeekISO, fmtShort, todayISO } from "@/lib/dates";
import type { Priority, Task } from "@/lib/db/tasks";
import type { Recurrence } from "@/lib/db/recurrences";
import { hapticTick } from "@/lib/haptics";
import {
  type Cancel,
  createVelocityTracker,
  flingOut,
  prefersReducedMotion,
  project,
  springTo,
} from "@/lib/motion";

type ProjectOption = { id: string; name: string };
const PRIORITIES: Priority[] = ["A", "B", "C", "D"];

function closeMenu(el: HTMLElement) {
  el.closest("details")?.removeAttribute("open");
}

/**
 * The right-side detail panel (mockup v4). Symmetric icon·label·value rows;
 * empty fields offer a subtle accent "+ Add"/"Set" instead of a blank. Title is
 * inline-editable with its priority chip; Notes is markdown. All edits are
 * optimistic + auto-save via the patch callback. Opens only when a row is
 * selected; × / Escape / click-away closes it (handled here + in the workspace).
 */
export function TaskPanel({
  task,
  projects,
  recurrence,
  recordsByProject,
  recordLabelByProject,
  onPatch,
  onComplete,
  onDelete,
  onReopen,
  onHardDelete,
  onClose,
  completion = null,
}: {
  task: Task;
  projects: ProjectOption[];
  recurrence: Recurrence | null;
  recordsByProject: Record<string, { id: string; name: string }[]>;
  recordLabelByProject: Record<string, string>;
  onPatch: (field: string, value: string) => void;
  onComplete: () => void;
  onDelete: () => void;
  onReopen: () => void;
  onHardDelete: () => void;
  onClose: () => void;
  /** When set (Calendar), the panel stays open through the grace window showing
   *  the inline Done + Undo instead of the Complete button. */
  completion?: { phase: CompletionPhase; onUndo: () => void } | null;
}) {
  const ref = useRef<HTMLElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);

  /* ---- detent-sheet presentation (mobile only; apple-design pass D) ----
     The sheet slides up on open, drags down 1:1 from the grabber/header,
     and dismisses when the PROJECTED landing point clears ~45% of its
     height (or on a fast flick) — otherwise it springs back at the
     finger's speed. Desktop keeps the plain sticky rail: every branch
     below is behind isSheet(). */
  const yRef = useRef(0);
  const heightRef = useRef(480); // measured at open + drag start, not per frame
  const cancelAnim = useRef<Cancel | null>(null);
  const closingRef = useRef(false);
  // NOTE: must match the `@media (max-width: 640px)` sheet block in
  // globals.css — change them together or the rail/sheet behaviors split.
  const isSheet = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 640px)").matches;

  const measure = () => {
    const h = ref.current?.offsetHeight;
    if (h) heightRef.current = h;
    return heightRef.current;
  };

  const setY = useCallback((y: number) => {
    yRef.current = y;
    const el = ref.current;
    if (el) el.style.transform = y ? `translateY(${y}px)` : "";
    const scrim = scrimRef.current;
    if (scrim) {
      // cached height: a layout read per animation frame invites forced
      // synchronous layout the moment anything dirties layout mid-gesture
      scrim.style.opacity = String(
        Math.min(1, Math.max(0, 1 - y / heightRef.current)),
      );
    }
  }, []);

  // Slide up from the bottom on open (before paint, so no flash).
  useLayoutEffect(() => {
    if (!isSheet() || prefersReducedMotion()) return;
    const h = measure();
    setY(h);
    cancelAnim.current = springTo({ from: h, to: 0, onUpdate: setY });
    return () => {
      cancelAnim.current?.();
    };
  }, [setY]);

  const requestClose = useCallback(
    (velocity = 0) => {
      if (closingRef.current) return;
      if (!isSheet() || prefersReducedMotion()) {
        onClose();
        return;
      }
      closingRef.current = true;
      // the exiting sheet must not swallow taps (mirrors .is-closing overlays)
      if (ref.current) ref.current.style.pointerEvents = "none";
      if (scrimRef.current) scrimRef.current.style.pointerEvents = "none";
      const h = measure();
      cancelAnim.current?.();
      cancelAnim.current = flingOut({
        from: yRef.current,
        velocity: Math.max(velocity, 1400),
        direction: 1,
        limit: h - 1,
        onUpdate: setY,
        onDone: onClose,
      });
    },
    [onClose, setY],
  );

  // Drag-to-dismiss from the grabber or the header strip.
  const drag = useRef<{ startY: number; offset: number } | null>(null);
  const tracker = useRef(createVelocityTracker());
  const onDragDown = (e: React.PointerEvent) => {
    if (!isSheet() || prefersReducedMotion()) return;
    if ((e.target as HTMLElement).closest("button")) return;
    cancelAnim.current?.(); // grab mid-flight
    if (closingRef.current) {
      // re-grabbed during the exit fling: the sheet is live again
      closingRef.current = false;
      if (ref.current) ref.current.style.pointerEvents = "";
      if (scrimRef.current) scrimRef.current.style.pointerEvents = "";
    }
    measure();
    drag.current = { startY: e.clientY, offset: yRef.current };
    tracker.current.reset(yRef.current);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const raw = drag.current.offset + (e.clientY - drag.current.startY);
    // downward 1:1; upward rubber-bands (there's nothing above the detent)
    setY(raw >= 0 ? raw : Math.max(raw / 3, -24));
    tracker.current.push(yRef.current);
  };
  const settleOpen = useCallback(
    (vel = 0) => {
      cancelAnim.current = springTo({
        from: yRef.current,
        to: 0,
        velocity: vel,
        onUpdate: setY,
      });
    },
    [setY],
  );
  const onDragUp = () => {
    if (!drag.current) return;
    drag.current = null;
    // Recent-window velocity only: flick-then-HOLD-then-release reads 0, so
    // the classic hold-to-cancel gesture springs back instead of dismissing.
    const vel = tracker.current.read();
    const h = heightRef.current;
    const projected = yRef.current + project(vel);
    if (projected > h * 0.45 || vel > 700) {
      hapticTick();
      requestClose(vel);
      return;
    }
    settleOpen(vel);
  };
  const onDragCancel = () => {
    // OS/browser took the gesture — a cancelled drag never dismisses.
    if (!drag.current) return;
    drag.current = null;
    settleOpen();
  };
  const dragProps = {
    onPointerDown: onDragDown,
    onPointerMove: onDragMove,
    onPointerUp: onDragUp,
    onPointerCancel: onDragCancel,
  };

  // Escape + click-away close (clicks on rows swap selection, so ignore those).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t)) return;
      // Clicking another row/card/tile swaps selection (the workspace handles
      // it), so don't treat those as click-away. These are the live command-
      // center classes: list rows, grid cards, the add/filter bars, and calendar
      // tiles (the panel is shared with Calendar).
      if (t.closest(".t-row, .t-card, .add-bar, .t-bar, .cev")) return;
      requestClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [requestClose]);

  const projectName =
    projects.find((p) => p.id === task.project_id)?.name ?? null;
  const recordOptions = task.project_id
    ? recordsByProject[task.project_id] ?? []
    : [];
  const recordLabel =
    (task.project_id ? recordLabelByProject[task.project_id] : null) ?? "Record";
  const recordName = task.record_id
    ? recordOptions.find((r) => r.id === task.record_id)?.name ?? null
    : null;
  const done = task.status === "done" || task.status === "cancelled";

  return (
    <>
      <div
        className="panel-scrim"
        ref={scrimRef}
        onClick={() => requestClose()}
        aria-hidden="true"
      />
      <aside className="panel" ref={ref} aria-label="Task detail">
        <div className="panel-grabber" aria-hidden="true" {...dragProps} />
        <div className="chead" {...dragProps}>
          <b>TASK</b>
          <button
            type="button"
            className="panel-x"
            onClick={() => requestClose()}
            aria-label="Close"
            title="Close"
          >
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>

      <div className="ctitle">
        <PriorityChip
          value={task.priority as Priority}
          dim={done}
          onPick={(p) => onPatch("priority", p)}
        />
        <TitleEditor
          initial={task.title}
          done={done}
          onCommit={(v) => onPatch("title", v)}
        />
      </div>

      <PanelRow icon="ti-flag" label="Priority">
        <Dropdown value={`Priority ${task.priority}`}>
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              className={p === task.priority ? "fmenu-item on" : "fmenu-item"}
              onClick={(e) => {
                closeMenu(e.currentTarget);
                onPatch("priority", p);
              }}
            >
              Priority {p}
            </button>
          ))}
        </Dropdown>
      </PanelRow>

      <PanelRow icon="ti-folder" label="Project">
        <Dropdown value={projectName ?? "No project"} empty={!projectName} emptyLabel="Set">
          <button
            type="button"
            className="fmenu-item"
            onClick={(e) => {
              closeMenu(e.currentTarget);
              onPatch("project_id", "");
            }}
          >
            No project
          </button>
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              className={p.id === task.project_id ? "fmenu-item on" : "fmenu-item"}
              onClick={(e) => {
                closeMenu(e.currentTarget);
                onPatch("project_id", p.id);
              }}
            >
              {p.name}
            </button>
          ))}
        </Dropdown>
      </PanelRow>

      {recordOptions.length > 0 ? (
        <PanelRow icon="ti-folders" label={recordLabel}>
          <Dropdown
            value={recordName ?? `No ${recordLabel.toLowerCase()}`}
            empty={!recordName}
            emptyLabel="Set"
          >
            <button
              type="button"
              className="fmenu-item"
              onClick={(e) => {
                closeMenu(e.currentTarget);
                onPatch("record_id", "");
              }}
            >
              No {recordLabel.toLowerCase()}
            </button>
            {recordOptions.map((r) => (
              <button
                key={r.id}
                type="button"
                className={r.id === task.record_id ? "fmenu-item on" : "fmenu-item"}
                onClick={(e) => {
                  closeMenu(e.currentTarget);
                  onPatch("record_id", r.id);
                }}
              >
                {r.name}
              </button>
            ))}
          </Dropdown>
        </PanelRow>
      ) : null}

      <PanelRow icon="ti-calendar" label="When">
        <Dropdown
          value={task.scheduled_for ? fmtShort(task.scheduled_for) : "Set"}
          empty={!task.scheduled_for}
          emptyLabel="Set"
        >
          {whenChoices().map((c) => (
            <button
              key={c.label}
              type="button"
              className="fmenu-item"
              onClick={(e) => {
                closeMenu(e.currentTarget);
                onPatch("scheduled_for", c.value);
              }}
            >
              {c.label}
            </button>
          ))}
          <label className="fmenu-item fmenu-pick">
            <i className="ti ti-calendar-plus" aria-hidden="true" />
            Pick…
            <input
              type="date"
              defaultValue={task.scheduled_for ?? ""}
              onChange={(e) => {
                closeMenu(e.currentTarget);
                onPatch("scheduled_for", e.target.value);
              }}
            />
          </label>
        </Dropdown>
      </PanelRow>

      <PanelRow icon="ti-clock-hour-4" label="Time">
        <TimeField
          task={task}
          onSet={(iso) => onPatch("start_at", iso)}
          onClear={() => onPatch("all_day", task.scheduled_for ?? "")}
        />
      </PanelRow>

      <PanelRow icon="ti-calendar-event" label="Due">
        <DateField
          value={task.due_date}
          onChange={(v) => onPatch("due_date", v)}
        />
      </PanelRow>

      <PanelRow icon="ti-bolt" label="Effort">
        <ChoiceField
          value={task.effort ?? ""}
          options={[
            { value: "quick", label: "Quick" },
            { value: "deep", label: "Deep" },
          ]}
          onChange={(v) => onPatch("effort", v)}
        />
      </PanelRow>

      <PanelRow icon="ti-clock" label="Avail.">
        <ChoiceField
          value={task.availability ?? ""}
          options={[
            { value: "anytime", label: "Anytime" },
            { value: "business_hours", label: "9–5 only" },
          ]}
          onChange={(v) => onPatch("availability", v)}
        />
      </PanelRow>

      <PanelRow icon="ti-circle-check" label="Status">
        <span className="cval">{task.status}</span>
      </PanelRow>

      <PanelRepeatRow task={task} recurrence={recurrence} />

      <NotesField initial={task.body ?? ""} onCommit={(v) => onPatch("body", v)} />

      <div className="acts">
        {completion ? (
          <div className="acts-completing dp-row">
            <DonePill
              phase={completion.phase === "confirm" ? "confirm" : "done"}
              onComplete={() => {}}
              label="Done"
            />
            <span className="acts-completing-lbl">Completed</span>
            <RowUndo onUndo={completion.onUndo} />
          </div>
        ) : done ? (
          <>
            <button type="button" className="done reopen" onClick={onReopen}>
              <i className="ti ti-arrow-back-up" aria-hidden="true" />
              Reopen
            </button>
            <button
              type="button"
              className="ibtn ibtn-danger ibtn-wide"
              title="Delete permanently"
              onClick={() => {
                if (
                  confirm("Permanently delete this task? This can't be undone.")
                ) {
                  onHardDelete();
                }
              }}
            >
              <i className="ti ti-trash" aria-hidden="true" />
              Delete
            </button>
          </>
        ) : (
          <>
            <button type="button" className="done" onClick={onComplete}>
              <i className="ti ti-check" aria-hidden="true" />
              Complete
            </button>
            <details className="fdrop fdrop-up">
              <summary className="ibtn" title="Reschedule" aria-label="Reschedule">
                <i className="ti ti-calendar" aria-hidden="true" />
              </summary>
              <div className="fmenu">
                {whenChoices().map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    className="fmenu-item"
                    onClick={(e) => {
                      closeMenu(e.currentTarget);
                      onPatch("scheduled_for", c.value);
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </details>
            <button
              type="button"
              className="ibtn ibtn-danger"
              title="Delete (cancels the task)"
              aria-label="Delete"
              onClick={() => {
                if (confirm("Delete this task? It's moved to cancelled (reversible).")) {
                  onDelete();
                }
              }}
            >
              <i className="ti ti-trash" aria-hidden="true" />
            </button>
          </>
        )}
      </div>
      </aside>
    </>
  );
}

function whenChoices(): { label: string; value: string }[] {
  return [
    { label: "Today", value: todayISO() },
    { label: "Tomorrow", value: addDaysISO(todayISO(), 1) },
    { label: "End of week", value: endOfWeekISO() },
    { label: "No date", value: "" },
  ];
}

function PanelRow({
  icon,
  label,
  children,
}: {
  icon: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="crow">
      <i className={`ti ${icon}`} aria-hidden="true" />
      <span className="clab">{label}</span>
      {children}
    </div>
  );
}

function PriorityChip({
  value,
  dim,
  onPick,
}: {
  value: Priority;
  dim: boolean;
  onPick: (p: Priority) => void;
}) {
  return (
    <details className="fdrop">
      <summary className={`chip chip-${value}${dim ? " chip-dim" : ""}`} title="Priority">
        {value}
      </summary>
      <div className="fmenu">
        {PRIORITIES.map((p) => (
          <button
            key={p}
            type="button"
            className={p === value ? "fmenu-item on" : "fmenu-item"}
            onClick={(e) => {
              closeMenu(e.currentTarget);
              onPick(p);
            }}
          >
            Priority {p}
          </button>
        ))}
      </div>
    </details>
  );
}

function TitleEditor({
  initial,
  done,
  onCommit,
}: {
  initial: string;
  done: boolean;
  onCommit: (v: string) => void;
}) {
  const handled = useRef(false);
  const commit = (v: string) => {
    if (handled.current) return;
    handled.current = true;
    const t = v.trim();
    if (t && t !== initial) onCommit(t);
  };
  // reset the guard whenever we render a different task's title
  useEffect(() => {
    handled.current = false;
  }, [initial]);

  return (
    <input
      className={`panel-title${done ? " done" : ""}`}
      defaultValue={initial}
      aria-label="Title"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          handled.current = true;
          e.currentTarget.value = initial;
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => commit(e.currentTarget.value)}
    />
  );
}

/** A value that opens a menu; shows an accent affordance when empty. */
function Dropdown({
  value,
  empty,
  emptyLabel,
  children,
}: {
  value: string;
  empty?: boolean;
  emptyLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="fdrop fdrop-right cval-drop">
      <summary className={empty ? "cval cval-empty" : "cval"}>
        {empty ? (
          <span className="addv">
            <i className="ti ti-plus" aria-hidden="true" />
            {emptyLabel ?? "Add"}
          </span>
        ) : (
          <>
            {value}
            <i className="ti ti-chevron-down" aria-hidden="true" />
          </>
        )}
      </summary>
      <div className="fmenu">{children}</div>
    </details>
  );
}

function DateField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  if (!value && !editing) {
    return (
      <span className="cval cval-empty">
        <button type="button" className="addv" onClick={() => setEditing(true)}>
          <i className="ti ti-plus" aria-hidden="true" />
          Add
        </button>
      </span>
    );
  }
  return (
    <span className="cval">
      <input
        type="date"
        className="cval-date"
        defaultValue={value ?? ""}
        autoFocus={editing}
        onChange={(e) => {
          onChange(e.target.value);
          if (!e.target.value) setEditing(false);
        }}
      />
    </span>
  );
}

/** Combine the task's scheduled day + an HH:MM (browser tz) into an ISO instant. */
function combineISO(dateISO: string, time: string): string {
  if (!dateISO || !time) return "";
  const d = new Date(`${dateISO}T${time}`);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/**
 * Optional start-time on the task. Setting it makes a timed appointment
 * (start_at, anchored to the scheduled day — or today if undated); clearing it
 * returns the task to date-only. Shared with the Tasks page, so a task gains a
 * time anywhere and it shows on the calendar at that hour.
 */
function TimeField({
  task,
  onSet,
  onClear,
}: {
  task: Task;
  onSet: (iso: string) => void;
  onClear: () => void;
}) {
  const [editing, setEditing] = useState(!!task.start_at);
  useEffect(() => setEditing(!!task.start_at), [task.id, task.start_at]);

  const timeVal = task.start_at
    ? new Date(task.start_at).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "";

  if (!task.start_at && !editing) {
    return (
      <span className="cval cval-empty">
        <button type="button" className="addv" onClick={() => setEditing(true)}>
          <i className="ti ti-plus" aria-hidden="true" />
          Add
        </button>
      </span>
    );
  }
  return (
    <span className="cval">
      <input
        type="time"
        className="cval-date"
        defaultValue={timeVal}
        autoFocus={editing && !task.start_at}
        onChange={(e) => {
          const v = e.target.value;
          if (v) onSet(combineISO(task.scheduled_for ?? todayISO(), v));
          else {
            onClear();
            setEditing(false);
          }
        }}
      />
    </span>
  );
}

function ChoiceField({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <span className={value ? "cval" : "cval cval-empty"}>
      <select
        className={value ? "cval-select" : "cval-select is-empty"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Set value"
      >
        <option value="">Set…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}

function NotesField({
  initial,
  onCommit,
}: {
  initial: string;
  onCommit: (v: string) => void;
}) {
  return (
    <div className="notes">
      <div className="notes-label">Notes</div>
      <textarea
        className="notes-area"
        defaultValue={initial}
        placeholder="Notes… (markdown)"
        aria-label="Notes"
        onBlur={(e) => {
          if (e.currentTarget.value !== initial) onCommit(e.currentTarget.value);
        }}
      />
    </div>
  );
}

function PanelRepeatRow({
  task,
  recurrence,
}: {
  task: Task;
  recurrence: Recurrence | null;
}) {
  const active = !!recurrence && recurrence.active;
  const [on, setOn] = useState(active);
  // resync when switching tasks
  useEffect(() => {
    setOn(active);
  }, [task.id, active]);

  return (
    <>
      <div className="crow">
        <i className="ti ti-refresh" aria-hidden="true" />
        <span className="clab">Repeat</span>
        <span className="cval">
          <span className="repeat-state">{on ? "On" : "Off"}</span>
          <form action={setTaskRepeatAction} onSubmit={() => setOn(!on)}>
            <input type="hidden" name="task_id" value={task.id} />
            <input type="hidden" name="repeat" value={on ? "0" : "1"} />
            <input type="hidden" name="freq" value={recurrence?.freq ?? "weekly"} />
            <input type="hidden" name="interval" value={recurrence?.interval ?? 1} />
            <button
              type="submit"
              className={on ? "sw on" : "sw"}
              role="switch"
              aria-checked={on}
              aria-label="Toggle repeat"
            />
          </form>
        </span>
      </div>
      {on ? (
        <form action={setTaskRepeatAction} className="repeat-edit">
          <input type="hidden" name="task_id" value={task.id} />
          <input type="hidden" name="repeat" value="1" />
          <RecurrenceFields
            defaultFreq={recurrence?.freq ?? "weekly"}
            defaultInterval={recurrence?.interval ?? 1}
            defaultByday={recurrence?.byday ?? []}
          />
          <button type="submit" className="btn-pill go">
            Save
          </button>
        </form>
      ) : null}
    </>
  );
}
