"use client";

import { useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createRecordAction, type FormState } from "./actions";

function AddButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
      {pending ? "Adding…" : `Add ${label}`}
    </button>
  );
}

/**
 * Per-column "Add [record]" affordance on the board. Collapsed to a quiet
 * button; clicking reveals a compact name field with the stage preset to this
 * column. Submitting reuses createRecordAction — which spawns the record_type's
 * intake checklist as tasks — and revalidation drops the new card in place.
 */
export function AddRecordCard({
  projectId,
  labelSingular,
  stage,
}: {
  projectId: string;
  labelSingular: string;
  stage: string;
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useFormState<FormState, FormData>(
    async (prev, formData) => {
      const result = await createRecordAction(prev, formData);
      if (!result.error) {
        formRef.current?.reset();
        setOpen(false);
      }
      return result;
    },
    {},
  );

  const label = labelSingular.toLowerCase();

  if (!open) {
    return (
      <button
        type="button"
        className="bcol-add"
        onClick={() => setOpen(true)}
      >
        <i className="ti ti-plus" aria-hidden="true" />
        Add {label}
      </button>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="bcol-add-form form">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="stage" value={stage} />
      <input
        name="name"
        className="input"
        required
        autoFocus
        placeholder={`${labelSingular} name`}
        aria-label={`${labelSingular} name`}
      />
      <div className="bcol-add-actions">
        <AddButton label={label} />
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
      {state.error ? (
        <p role="alert" className="error">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
