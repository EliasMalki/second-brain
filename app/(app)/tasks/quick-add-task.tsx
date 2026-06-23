"use client";

import { useRef, useState } from "react";
import { useFormState } from "react-dom";
import { createTaskAction, type FormState } from "./actions";
import { RecurrenceFields } from "./recurrence-fields";
import { addDaysISO, endOfWeekISO, todayISO } from "@/lib/dates";

type ProjectOption = { id: string; name: string };
type QuickKey = "none" | "today" | "tomorrow" | "eow" | "pick";

/**
 * The add-task bar (mockup v4): one calm band — a contained "+" submit, a single
 * task input, the four quick-date chips as a grouped set, and a single advanced
 * icon on the right. Advanced reveals due / priority / effort / availability and
 * the Repeat toggle (rule-only create; the nightly job makes the first task).
 * Reused on the project page, hence the stable {projects, defaultProjectId} props.
 */
export function QuickAddTask({
  projects,
  defaultProjectId,
  recordsByProject = {},
  recordLabelByProject = {},
}: {
  projects: ProjectOption[];
  defaultProjectId?: string;
  recordsByProject?: Record<string, { id: string; name: string }[]>;
  recordLabelByProject?: Record<string, string>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [quick, setQuick] = useState<QuickKey>("none");
  const [pickDate, setPickDate] = useState("");
  // project + record are controlled so the record list can follow the project
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [recordId, setRecordId] = useState("");

  const recordOptions = recordsByProject[projectId] ?? [];
  const recordLabel = recordLabelByProject[projectId] ?? "record";

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
      setProjectId(defaultProjectId ?? "");
      setRecordId("");
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
    <form ref={formRef} action={formAction} className="add-bar">
      <div className="add-main">
        <button type="submit" className="add-plus" title="Add task" aria-label="Add task">
          <i className="ti ti-plus" aria-hidden="true" />
        </button>
        <input
          ref={titleRef}
          type="text"
          name="title"
          required
          placeholder="Add a task…"
          aria-label="New task title"
          className="add-input"
        />

        <div className="qd" role="group" aria-label="Quick schedule">
          {dates.map((d) => (
            <button
              key={d.key}
              type="button"
              className={quick === d.key ? "dchip on" : "dchip"}
              aria-pressed={quick === d.key}
              onClick={() => setQuick(d.key)}
            >
              {d.label}
            </button>
          ))}
          <label
            className={quick === "pick" ? "dchip dchip-pick on" : "dchip dchip-pick"}
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

        <button
          type="button"
          className={open ? "add-opt on" : "add-opt"}
          onClick={() => setOpen((v) => !v)}
          title="More options"
          aria-label="More options"
          aria-expanded={open}
        >
          <i className="ti ti-adjustments-horizontal" aria-hidden="true" />
        </button>
      </div>

      <input type="hidden" name="scheduled_for" value={scheduledFor} />
      <input type="hidden" name="repeat" value={repeat ? "1" : "0"} />

      <div className="add-adv" hidden={!open}>
        <select
          name="project_id"
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value);
            setRecordId("");
          }}
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
        {recordOptions.length > 0 ? (
          <select
            name="record_id"
            value={recordId}
            onChange={(e) => setRecordId(e.target.value)}
            aria-label={recordLabel}
            title={recordLabel}
          >
            <option value="">No {recordLabel.toLowerCase()}</option>
            {recordOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        ) : null}
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
