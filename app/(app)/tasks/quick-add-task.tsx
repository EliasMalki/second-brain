"use client";

import { useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createTaskAction, type FormState } from "./actions";
import { RecurrenceFields } from "./recurrence-fields";
import { addDaysISO, endOfWeekISO, todayISO } from "@/lib/dates";

type ProjectOption = { id: string; name: string };

/** The quick-date choices. `value` resolves lazily so "today" tracks the clock. */
type QuickKey = "none" | "today" | "tomorrow" | "eow" | "pick";

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="qa-btn primary"
      disabled={pending}
      title="Add (Enter)"
      aria-label="Add"
    >
      <i className="ti ti-plus" aria-hidden="true" />
    </button>
  );
}

/**
 * Task creation. Type a title, Enter to add. A row of quick-date buttons
 * (Today / Tomorrow / End of week / No date) sets scheduled_for inline; "More"
 * reveals project / priority / due / effort / availability and a Repeat toggle
 * that turns the box into a recurrence-rule builder (rule-only — the nightly
 * job makes the first task, so nothing is double-created). Reused on the project
 * page, hence the stable {projects, defaultProjectId} props.
 */
export function QuickAddTask({
  projects,
  defaultProjectId,
}: {
  projects: ProjectOption[];
  defaultProjectId?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [quick, setQuick] = useState<QuickKey>("none");
  const [pickDate, setPickDate] = useState("");

  // Resolve the selected quick-date to an ISO string (or "" for No date).
  const scheduledFor =
    quick === "today"
      ? todayISO()
      : quick === "tomorrow"
        ? addDaysISO(todayISO(), 1)
        : quick === "eow"
          ? endOfWeekISO()
          : quick === "pick"
            ? pickDate
            : "";

  const action = async (prev: FormState, formData: FormData) => {
    const result = await createTaskAction(prev, formData);
    if (!result.error) {
      formRef.current?.reset();
      setQuick("none");
      setPickDate("");
      setRepeat(false);
      titleRef.current?.focus();
    }
    return result;
  };
  const [state, formAction] = useFormState(action, {});

  const dates: { key: QuickKey; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "tomorrow", label: "Tomorrow" },
    { key: "eow", label: "End of week" },
    { key: "none", label: "No date" },
  ];

  return (
    <form ref={formRef} action={formAction} className="quick-add">
      <div className="quick-add-row">
        <i className="ti ti-circle-plus" aria-hidden="true" />
        <input
          ref={titleRef}
          type="text"
          name="title"
          required
          placeholder="Add a task…"
          aria-label="New task title"
        />
        <button
          type="button"
          className={open ? "qa-btn active" : "qa-btn"}
          onClick={() => setOpen((v) => !v)}
          title="More options"
          aria-label="More options"
          aria-expanded={open}
        >
          <i className="ti ti-adjustments-horizontal" aria-hidden="true" />
        </button>
        <SendButton />
      </div>

      {/* always-visible quick scheduling */}
      <div className="qa-dates">
        <span className="qa-dates-label">{repeat ? "Starts" : "Schedule"}</span>
        <div className="qd-seg" role="group" aria-label="Quick schedule">
          {dates.map((d) => (
            <button
              key={d.key}
              type="button"
              className={quick === d.key ? "qd-pill on" : "qd-pill"}
              aria-pressed={quick === d.key}
              onClick={() => setQuick(d.key)}
            >
              {d.label}
            </button>
          ))}
          <label
            className={quick === "pick" ? "qd-pill qd-pick on" : "qd-pill qd-pick"}
            title="Pick a date"
          >
            <i className="ti ti-calendar" aria-hidden="true" />
            <input
              type="date"
              value={pickDate}
              aria-label="Pick a date"
              onChange={(e) => {
                setPickDate(e.target.value);
                setQuick(e.target.value ? "pick" : "none");
              }}
            />
          </label>
        </div>
      </div>

      {/* the value the action reads — kept in sync with the buttons above */}
      <input type="hidden" name="scheduled_for" value={scheduledFor} />
      <input type="hidden" name="repeat" value={repeat ? "1" : "0"} />

      <div className="quick-add-options" hidden={!open}>
        <select
          name="project_id"
          defaultValue={defaultProjectId ?? ""}
          aria-label="Project"
          title="Project"
        >
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select name="priority" defaultValue="C" aria-label="Priority" title="Priority">
          <option value="A">A — critical</option>
          <option value="B">B — important</option>
          <option value="C">C — normal</option>
          <option value="D">D — someday</option>
        </select>
        <span className="qa-word">due</span>
        <input type="date" name="due_date" aria-label="Due date" title="Due date" />
        <select name="effort" defaultValue="" aria-label="Effort" title="Effort">
          <option value="">Effort</option>
          <option value="quick">Quick</option>
          <option value="deep">Deep</option>
        </select>
        <select
          name="availability"
          defaultValue=""
          aria-label="Availability"
          title="Availability"
        >
          <option value="">Anytime</option>
          <option value="business_hours">9–5 only</option>
        </select>

        <label className={repeat ? "qa-repeat on" : "qa-repeat"}>
          <input
            type="checkbox"
            checked={repeat}
            onChange={(e) => setRepeat(e.target.checked)}
          />
          <i className="ti ti-refresh" aria-hidden="true" />
          Repeat
        </label>

        {repeat ? <RecurrenceFields /> : null}
      </div>

      {repeat ? (
        <p className="qa-hint">
          <i className="ti ti-info-circle" aria-hidden="true" />
          Creates a repeating rule — the first task is generated by tonight’s run.
        </p>
      ) : null}

      {state.error ? (
        <p role="alert" className="quick-add-error">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
