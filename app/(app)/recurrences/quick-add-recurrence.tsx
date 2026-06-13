"use client";

import { useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createRecurrenceAction, type FormState } from "./actions";
import type { Project } from "@/lib/db/projects";

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="qa-btn primary"
      disabled={pending}
      title="Create recurrence"
      aria-label="Create recurrence"
    >
      <i className="ti ti-plus" aria-hidden="true" />
    </button>
  );
}

/**
 * Recurrence creation as one readable sentence — “<title> every <n> <freq>
 * starting <date>” — with until/project/priority/effort behind the toggle.
 * Reuses createRecurrenceAction unchanged (fixed-anchor only in v0.5).
 */
export function QuickAddRecurrence({ projects }: { projects: Project[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

  const action = async (prev: FormState, formData: FormData) => {
    const result = await createRecurrenceAction(prev, formData);
    if (!result.error) {
      formRef.current?.reset();
      titleRef.current?.focus();
    }
    return result;
  };
  const [state, formAction] = useFormState(action, {});

  return (
    <form ref={formRef} action={formAction} className="quick-add">
      <div className="quick-add-row" style={{ flexWrap: "wrap" }}>
        <i className="ti ti-refresh" aria-hidden="true" />
        <input
          ref={titleRef}
          type="text"
          name="title"
          required
          placeholder="Repeat a task… e.g. Water the plants"
          aria-label="Recurring task title"
          style={{ flex: "1 1 12rem" }}
        />
        <span className="qa-word">every</span>
        <input
          type="number"
          name="interval"
          min={1}
          max={365}
          defaultValue={1}
          aria-label="Interval"
          style={{
            width: "3.4rem",
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: "var(--border-radius-md)",
            padding: "4px 6px",
            fontSize: 12,
            flex: "none",
          }}
        />
        <select
          name="freq"
          defaultValue="weekly"
          aria-label="Frequency"
          style={{
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: "var(--border-radius-md)",
            padding: "4px 6px",
            fontSize: 12,
            background: "var(--color-background-primary)",
            color: "var(--color-text-secondary)",
            flex: "none",
          }}
        >
          <option value="daily">day(s)</option>
          <option value="weekly">week(s)</option>
          <option value="monthly">month(s)</option>
          <option value="yearly">year(s)</option>
        </select>
        <span className="qa-word">starting</span>
        <input
          type="date"
          name="start_date"
          required
          aria-label="Start date"
          style={{
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: "var(--border-radius-md)",
            padding: "4px 6px",
            fontSize: 12,
            color: "var(--color-text-secondary)",
            flex: "none",
          }}
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

      <div className="quick-add-options" hidden={!open}>
        <span className="qa-word">until</span>
        <input type="date" name="until" aria-label="Until" title="Until (optional)" />
        <select name="project_id" defaultValue="" aria-label="Project" title="Project">
          <option value="">No project (Inbox)</option>
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
        <select name="effort" defaultValue="" aria-label="Effort" title="Effort">
          <option value="">Effort</option>
          <option value="quick">Quick</option>
          <option value="deep">Deep</option>
        </select>
      </div>

      {state.error ? (
        <p role="alert" className="quick-add-error">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
