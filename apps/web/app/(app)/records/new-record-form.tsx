"use client";

import { useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createRecordAction, type FormState } from "./actions";

function AddButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Adding…" : `Add ${label.toLowerCase()}`}
    </button>
  );
}

export function NewRecordForm({
  projectId,
  labelSingular,
  stages,
}: {
  projectId: string;
  labelSingular: string;
  stages: string[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useFormState<FormState, FormData>(
    async (prev, formData) => {
      const result = await createRecordAction(prev, formData);
      if (!result.error) formRef.current?.reset();
      return result;
    },
    {},
  );

  return (
    <form ref={formRef} action={formAction} className="form">
      <input type="hidden" name="project_id" value={projectId} />
      <div className="field-row">
        <div className="field">
          <label htmlFor="record-name" className="label">
            {labelSingular} name
          </label>
          <input
            id="record-name"
            name="name"
            className="input"
            required
            placeholder="2019 Civic / Ahmed K. / Smith kitchen"
          />
        </div>
        <div className="field">
          <label htmlFor="record-stage" className="label">
            Stage
          </label>
          <select
            id="record-stage"
            name="stage"
            className="select"
            defaultValue={stages[0]}
          >
            {stages.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-actions">
        <AddButton label={labelSingular} />
        {state.error ? (
          <p role="alert" className="error">
            {state.error}
          </p>
        ) : null}
      </div>
      <p className="help">Creating one spawns its intake checklist as tasks.</p>
    </form>
  );
}
