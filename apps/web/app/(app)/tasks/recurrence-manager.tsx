"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { RecurrenceFields } from "./recurrence-fields";
import {
  deleteRecurrenceAction,
  toggleRecurrenceAction,
  updateRecurrenceAction,
  type FormState,
} from "./recurrence-actions";
import { fmtShort } from "@/lib/dates";
import type { Recurrence } from "@/lib/db/recurrences";

type ProjectOption = { id: string; name: string };

const DOW_LABEL: Record<string, string> = {
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
  SU: "Sun",
};

/** "every 2 weeks", "every week on Mon, Wed", "every month". */
function cadence(r: Recurrence): string {
  const unit = r.freq.replace("ly", r.interval > 1 ? "s" : "");
  const base = `every ${r.interval > 1 ? `${r.interval} ` : ""}${unit}`;
  if (r.freq === "weekly" && r.byday && r.byday.length > 0) {
    return `${base} on ${r.byday.map((d) => DOW_LABEL[d] ?? d).join(", ")}`;
  }
  return base;
}

export function RecurrenceManager({
  recurrences,
  projects,
}: {
  recurrences: Recurrence[];
  projects: ProjectOption[];
}) {
  const projectName = (id: string | null) =>
    id ? projects.find((p) => p.id === id)?.name ?? null : null;

  if (recurrences.length === 0) {
    return (
      <div className="card empty">
        <i className="ti ti-refresh" aria-hidden="true" />
        No recurring rules yet — add a task above and turn on{" "}
        <strong style={{ fontWeight: 500 }}>Repeat</strong>.
      </div>
    );
  }

  return (
    <ul className="tasks">
      {recurrences.map((r) => (
        <RuleItem
          key={r.id}
          rule={r}
          projects={projects}
          projectLabel={projectName(r.project_id)}
        />
      ))}
    </ul>
  );
}

function RuleItem({
  rule,
  projects,
  projectLabel,
}: {
  rule: Recurrence;
  projects: ProjectOption[];
  projectLabel: string | null;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="task-item rule-edit">
        <RuleEditForm
          rule={rule}
          projects={projects}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  const meta = [
    cadence(rule),
    projectLabel,
    `from ${fmtShort(rule.start_date)}`,
    rule.until ? `until ${fmtShort(rule.until)}` : null,
    rule.last_materialized_through
      ? `made to ${fmtShort(rule.last_materialized_through)}`
      : "not made yet",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="task-item" style={{ alignItems: "center" }}>
      <span className={`chip chip-${rule.default_priority}`}>
        {rule.default_priority}
      </span>
      <div className="task-body" style={{ opacity: rule.active ? 1 : 0.5 }}>
        <p className="task-title">
          {rule.title_template}
          {rule.active ? null : <span className="rule-paused"> · paused</span>}
        </p>
        <div className="task-meta">
          <span>{meta}</span>
        </div>
      </div>
      <div className="tl-actions tl-actions-static">
        <button
          type="button"
          className="tl-act"
          onClick={() => setEditing(true)}
          title="Edit rule"
          aria-label="Edit rule"
        >
          <i className="ti ti-pencil" aria-hidden="true" />
        </button>
        <form action={toggleRecurrenceAction}>
          <input type="hidden" name="id" value={rule.id} />
          <input type="hidden" name="active" value={rule.active ? "0" : "1"} />
          <button type="submit" className="btn-pill">
            {rule.active ? "Pause" : "Resume"}
          </button>
        </form>
        <form
          action={deleteRecurrenceAction}
          onSubmit={(e) => {
            if (
              !confirm(
                "Delete this rule? Tasks already created from it stay; no new ones are made.",
              )
            ) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={rule.id} />
          <button type="submit" className="tl-act tl-danger" title="Delete rule" aria-label="Delete rule">
            <i className="ti ti-trash" aria-hidden="true" />
          </button>
        </form>
      </div>
    </li>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-pill go" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

function RuleEditForm({
  rule,
  projects,
  onDone,
}: {
  rule: Recurrence;
  projects: ProjectOption[];
  onDone: () => void;
}) {
  const action = async (prev: FormState, formData: FormData) => {
    const result = await updateRecurrenceAction(prev, formData);
    if (!result.error) onDone();
    return result;
  };
  const [state, formAction] = useFormState(action, {});

  return (
    <form action={formAction} className="rule-form">
      <input type="hidden" name="id" value={rule.id} />
      <input
        type="text"
        name="title"
        required
        defaultValue={rule.title_template}
        aria-label="Rule title"
        className="rule-title-input"
      />
      <RecurrenceFields
        defaultFreq={rule.freq}
        defaultInterval={rule.interval}
        defaultByday={rule.byday ?? []}
      />
      <div className="control-strip">
        <select name="project_id" defaultValue={rule.project_id ?? ""} aria-label="Project">
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select name="priority" defaultValue={rule.default_priority} aria-label="Priority">
          <option value="A">A — critical</option>
          <option value="B">B — important</option>
          <option value="C">C — normal</option>
          <option value="D">D — someday</option>
        </select>
        <select name="effort" defaultValue={rule.default_effort ?? ""} aria-label="Effort">
          <option value="">Effort</option>
          <option value="quick">Quick</option>
          <option value="deep">Deep</option>
        </select>
      </div>
      <div className="form-actions">
        <SaveButton />
        <button type="button" className="btn-pill" onClick={onDone}>
          Cancel
        </button>
        {state.error ? (
          <p role="alert" className="error">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
