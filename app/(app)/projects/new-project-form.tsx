"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createProjectAction, type FormState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Creating…" : "Create project"}
    </button>
  );
}

export function NewProjectForm({
  areas,
}: {
  areas: { id: string; name: string }[];
}) {
  const [state, formAction] = useFormState(createProjectAction, {});

  return (
    <form action={formAction} className="form">
      <div className="field">
        <label htmlFor="name" className="label">
          Name
        </label>
        <input
          id="name"
          name="name"
          className="input"
          required
          placeholder="e.g. Car flipping"
        />
      </div>
      {areas.length > 0 ? (
        <div className="field">
          <label htmlFor="area_id" className="label">
            Area
          </label>
          <select id="area_id" name="area_id" className="select" defaultValue="">
            <option value="">None</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <p className="help">Groups this project in the sidebar.</p>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="description" className="label">
          Description <span className="help">(optional, markdown)</span>
        </label>
        <textarea
          id="description"
          name="description"
          className="textarea"
          placeholder="What this project is — also gives the classifier context later."
        />
      </div>
      <div className="form-actions">
        <SubmitButton />
        {state.error ? (
          <p role="alert" className="error">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
