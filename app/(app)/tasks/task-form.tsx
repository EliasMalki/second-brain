"use client";

import { useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  createTaskAction,
  updateTaskAction,
  type FormState,
} from "./actions";
import type { Task } from "@/lib/db/tasks";

type ProjectOption = { id: string; name: string };

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

/**
 * Shared create/edit form. Pass `task` to edit; omit it to create.
 * On create the form resets so several tasks can be added in a row.
 */
export function TaskForm({
  task,
  projects,
}: {
  task?: Task;
  projects: ProjectOption[];
}) {
  const isEdit = !!task;
  const formRef = useRef<HTMLFormElement>(null);

  const action = async (prev: FormState, formData: FormData) => {
    const result = isEdit
      ? await updateTaskAction(prev, formData)
      : await createTaskAction(prev, formData);
    if (!isEdit && !result.error) formRef.current?.reset();
    return result;
  };
  const [state, formAction] = useFormState(action, {});

  return (
    <form ref={formRef} action={formAction} className="form">
      {isEdit ? <input type="hidden" name="id" value={task.id} /> : null}

      <div className="field">
        <label htmlFor="title" className="label">
          Title
        </label>
        <input
          id="title"
          name="title"
          className="input"
          required
          defaultValue={task?.title ?? ""}
          placeholder="What needs doing?"
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="project_id" className="label">
            Project
          </label>
          <select
            id="project_id"
            name="project_id"
            className="select"
            defaultValue={task?.project_id ?? ""}
          >
            <option value="">— none —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="priority" className="label">
            Priority
          </label>
          <select
            id="priority"
            name="priority"
            className="select"
            defaultValue={task?.priority ?? "C"}
          >
            <option value="A">A — critical</option>
            <option value="B">B — important</option>
            <option value="C">C — normal</option>
            <option value="D">D — someday</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="effort" className="label">
            Effort
          </label>
          <select
            id="effort"
            name="effort"
            className="select"
            defaultValue={task?.effort ?? ""}
          >
            <option value="">—</option>
            <option value="quick">Quick</option>
            <option value="deep">Deep</option>
          </select>
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="scheduled_for" className="label">
            Scheduled for
          </label>
          <input
            id="scheduled_for"
            name="scheduled_for"
            type="date"
            className="input"
            defaultValue={task?.scheduled_for ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="due_date" className="label">
            Due date
          </label>
          <input
            id="due_date"
            name="due_date"
            type="date"
            className="input"
            defaultValue={task?.due_date ?? ""}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="body" className="label">
          Notes <span className="help">(optional, markdown)</span>
        </label>
        <textarea
          id="body"
          name="body"
          className="textarea"
          defaultValue={task?.body ?? ""}
        />
      </div>

      <div className="form-actions">
        <SubmitButton
          label={isEdit ? "Save changes" : "Add task"}
          pendingLabel={isEdit ? "Saving…" : "Adding…"}
        />
        {state.error ? (
          <p role="alert" className="error">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
