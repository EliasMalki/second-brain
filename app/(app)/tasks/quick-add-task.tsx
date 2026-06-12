"use client";

import { useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createTaskAction, type FormState } from "./actions";

type ProjectOption = { id: string; name: string };

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="qa-btn primary"
      disabled={pending}
      title="Add task (Enter)"
      aria-label="Add task"
    >
      <i className="ti ti-plus" aria-hidden="true" />
    </button>
  );
}

/**
 * One-line task creation: type a title, Enter to add. The adjustments toggle
 * reveals a compact strip for project / priority / dates / effort — details on
 * demand instead of a seven-field form. Reuses createTaskAction unchanged.
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

  const action = async (prev: FormState, formData: FormData) => {
    const result = await createTaskAction(prev, formData);
    if (!result.error) {
      formRef.current?.reset();
      titleRef.current?.focus();
    }
    return result;
  };
  const [state, formAction] = useFormState(action, {});

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
        <input
          type="date"
          name="scheduled_for"
          aria-label="Scheduled for"
          title="Scheduled for"
        />
        <input type="date" name="due_date" aria-label="Due date" title="Due date" />
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
