"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateTaskAction, type FormState } from "./actions";
import type { Task } from "@/lib/db/tasks";

type ProjectOption = { id: string; name: string };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

/**
 * Compact edit form for the task detail page (creation moved to QuickAddTask).
 * Title up top, one strip of small controls, optional markdown body.
 */
export function TaskForm({
  task,
  projects,
}: {
  task: Task;
  projects: ProjectOption[];
}) {
  const [state, formAction] = useFormState(updateTaskAction, {});

  return (
    <form action={formAction} className="form">
      <input type="hidden" name="id" value={task.id} />

      <input
        id="title"
        name="title"
        className="input"
        required
        defaultValue={task.title}
        placeholder="What needs doing?"
        aria-label="Title"
        style={{ fontSize: 16, fontWeight: 500 }}
      />

      <div className="control-strip">
        <select
          name="project_id"
          defaultValue={task.project_id ?? ""}
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
        <select
          name="priority"
          defaultValue={task.priority}
          aria-label="Priority"
          title="Priority"
        >
          <option value="A">A — critical</option>
          <option value="B">B — important</option>
          <option value="C">C — normal</option>
          <option value="D">D — someday</option>
        </select>
        <select
          name="effort"
          defaultValue={task.effort ?? ""}
          aria-label="Effort"
          title="Effort"
        >
          <option value="">Effort</option>
          <option value="quick">Quick</option>
          <option value="deep">Deep</option>
        </select>
        <span className="qa-word">scheduled</span>
        <input
          type="date"
          name="scheduled_for"
          defaultValue={task.scheduled_for ?? ""}
          aria-label="Scheduled for"
          title="Scheduled for"
        />
        <span className="qa-word">due</span>
        <input
          type="date"
          name="due_date"
          defaultValue={task.due_date ?? ""}
          aria-label="Due date"
          title="Due date"
        />
      </div>

      <textarea
        name="body"
        className="textarea"
        defaultValue={task.body ?? ""}
        placeholder="Notes… (markdown)"
        aria-label="Notes"
        style={{ minHeight: "5.5rem" }}
      />

      <div className="form-actions">
        <SaveButton />
        {state.error ? (
          <p role="alert" className="error">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
