"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createRecordTypeAction, type FormState } from "./actions";

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Creating…" : "Create record type"}
    </button>
  );
}

/** §10 setup: label + ordered stages + intake checklist. Once per project. */
export function RecordTypeForm({ projectId }: { projectId: string }) {
  const [state, formAction] = useFormState<FormState, FormData>(
    createRecordTypeAction,
    {},
  );

  return (
    <form action={formAction} className="form">
      <input type="hidden" name="project_id" value={projectId} />
      <div className="field-row">
        <div className="field">
          <label htmlFor="label_singular" className="label">
            What is one of these called?
          </label>
          <input
            id="label_singular"
            name="label_singular"
            className="input"
            required
            placeholder="Car / Client / Job"
          />
        </div>
        <div className="field">
          <label htmlFor="label_plural" className="label">
            And several?
          </label>
          <input
            id="label_plural"
            name="label_plural"
            className="input"
            required
            placeholder="Cars / Clients / Jobs"
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="stages" className="label">
          Stages <span className="help">(one per line, in pipeline order)</span>
        </label>
        <textarea
          id="stages"
          name="stages"
          className="textarea"
          required
          placeholder={"in stock\nreserved\nsold"}
        />
      </div>
      <div className="field">
        <label htmlFor="checklist" className="label">
          Intake checklist{" "}
          <span className="help">
            (one task per line: Title | quick or deep | A–D — both optional)
          </span>
        </label>
        <textarea
          id="checklist"
          name="checklist"
          className="textarea"
          placeholder={"Safety inspection | deep | A\nTake photos | quick"}
        />
        <p className="help">
          Each new record spawns these as tasks automatically.
        </p>
      </div>
      <div className="form-actions">
        <CreateButton />
        {state.error ? (
          <p role="alert" className="error">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
