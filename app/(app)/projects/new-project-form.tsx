"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createProjectAction, type FormState } from "./actions";

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="qa-btn primary"
      disabled={pending}
      title="Create project (Enter)"
      aria-label="Create project"
    >
      <i className="ti ti-plus" aria-hidden="true" />
    </button>
  );
}

/**
 * Quick-add for projects: name, Enter to create (redirects to the new
 * project). Area + description live behind the toggle.
 */
export function NewProjectForm({
  areas,
}: {
  areas: { id: string; name: string }[];
}) {
  const [state, formAction] = useFormState(createProjectAction, {});
  const [open, setOpen] = useState(false);

  return (
    <form action={formAction} className="quick-add">
      <div className="quick-add-row">
        <i className="ti ti-folder-plus" aria-hidden="true" />
        <input
          type="text"
          name="name"
          required
          placeholder="New project… e.g. Car flipping"
          aria-label="Project name"
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
        {areas.length > 0 ? (
          <select name="area_id" defaultValue="" aria-label="Area" title="Area">
            <option value="">No area</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        ) : null}
        <input
          type="text"
          name="description"
          placeholder="What this project is (helps the classifier)"
          aria-label="Description"
          style={{ flex: 1, minWidth: "14rem" }}
        />
      </div>

      {state.error ? (
        <p role="alert" className="quick-add-error">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
