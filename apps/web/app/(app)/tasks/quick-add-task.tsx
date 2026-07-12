"use client";

import { useRef, useState } from "react";
import { useFormState } from "react-dom";
import { createTaskAction, type FormState } from "./actions";
import { RecurrenceFields } from "./recurrence-fields";
import { addDaysISO, endOfWeekISO, todayISO } from "@second-brain/shared/domain/dates";

type ProjectOption = { id: string; name: string };
type QuickKey = "none" | "today" | "tomorrow" | "eow" | "pick";

/** Combine a YYYY-MM-DD + HH:MM (browser/user tz) into an ISO instant, or "". */
function combineISO(dateISO: string, time: string): string {
  if (!dateISO || !time) return "";
  const d = new Date(`${dateISO}T${time}`);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}
/** start + 60 min, as ISO. */
function plusHourISO(startISO: string): string {
  if (!startISO) return "";
  return new Date(new Date(startISO).getTime() + 3_600_000).toISOString();
}

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
  defaultScheduledFor,
  defaultStartTime,
  recordsByProject = {},
  recordLabelByProject = {},
  onCreated,
  variant,
}: {
  projects: ProjectOption[];
  defaultProjectId?: string;
  /** Pre-fill the schedule (the Calendar pre-fills the clicked day). */
  defaultScheduledFor?: string;
  /** Pre-fill a start time HH:MM (the Calendar pre-fills the clicked hour). */
  defaultStartTime?: string;
  recordsByProject?: Record<string, { id: string; name: string }[]>;
  recordLabelByProject?: Record<string, string>;
  /** Called after a successful create (the Calendar closes its popover). */
  onCreated?: () => void;
  /** "command" = the Tasks command-center look (--tech plus, focus ring). The
   *  DOM and behaviour are identical; only the skin changes, so the shared
   *  project/calendar usages keep the default bar. */
  variant?: "command";
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(!!defaultStartTime);
  const [hasText, setHasText] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [quick, setQuick] = useState<QuickKey>(defaultScheduledFor ? "pick" : "none");
  const [pickDate, setPickDate] = useState(defaultScheduledFor ?? "");
  const [timeStr, setTimeStr] = useState(defaultStartTime ?? "");
  // project + record are controlled so the record list can follow the project
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [recordId, setRecordId] = useState("");

  const recordOptions = recordsByProject[projectId] ?? [];
  const recordLabel = recordLabelByProject[projectId] ?? "record";

  // Progressive disclosure: the quick-date chips + the advanced toggle stay
  // hidden until you start typing a title (or the Calendar/day pre-fills a
  // schedule); the advanced panel slides open on the first character. Matches
  // the Projects composer. Pre-fills keep everything revealed so calendar
  // slot/day clicks don't regress.
  const reveal =
    hasText || open || Boolean(defaultScheduledFor) || Boolean(defaultStartTime);

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

  // A time turns the task into a timed appointment (start_at); a date is
  // required (the time input alone does nothing without a day). 60-min default.
  const startAtISO = combineISO(scheduledFor, timeStr);
  const endAtISO = plusHourISO(startAtISO);

  const action = async (prev: FormState, formData: FormData) => {
    const result = await createTaskAction(prev, formData);
    if (!result.error) {
      formRef.current?.reset();
      setQuick("none");
      setPickDate("");
      setTimeStr("");
      setRepeat(false);
      setProjectId(defaultProjectId ?? "");
      setRecordId("");
      setHasText(false);
      setOpen(false); // collapse back to the clean bar after a create
      titleRef.current?.focus();
      onCreated?.();
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
    <form
      ref={formRef}
      action={formAction}
      className={variant === "command" ? "add-bar add-bar--cmd" : "add-bar"}
    >
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
          onChange={(e) => {
            const nowHas = e.target.value.trim().length > 0;
            if (nowHas === hasText) return; // only act on the empty⇄non-empty flip
            setHasText(nowHas);
            setOpen(nowHas); // first char → slide options open; cleared → collapse
          }}
        />

        <div className="qd" role="group" aria-label="Quick schedule" hidden={!reveal}>
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
          hidden={!reveal}
          onClick={() => setOpen((v) => !v)}
          title="More options"
          aria-label="More options"
          aria-expanded={open}
        >
          <i className="ti ti-adjustments-horizontal" aria-hidden="true" />
        </button>
      </div>

      <input type="hidden" name="scheduled_for" value={scheduledFor} />
      <input type="hidden" name="start_at" value={startAtISO} />
      <input type="hidden" name="end_at" value={endAtISO} />
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
        <span className="qa-word">at</span>
        <input
          type="time"
          value={timeStr}
          onChange={(e) => setTimeStr(e.target.value)}
          aria-label="Start time"
          title="Start time — makes it a timed appointment (needs a scheduled day)"
        />
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
