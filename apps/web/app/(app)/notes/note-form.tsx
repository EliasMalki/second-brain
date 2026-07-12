"use client";

import { useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  createNoteAction,
  updateNoteAction,
  type FormState,
} from "./actions";
import { tagsToInput } from "@second-brain/shared/domain/tags";
import type { Note } from "@/lib/db/notes";

type ProjectOption = { id: string; name: string };

function SubmitButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

/** Shared create/edit form. Pass `note` to edit; omit to create (resets after). */
export function NoteForm({
  note,
  projects,
  defaultProjectId,
}: {
  note?: Note;
  projects: ProjectOption[];
  defaultProjectId?: string;
}) {
  const isEdit = !!note;
  const formRef = useRef<HTMLFormElement>(null);

  const action = async (prev: FormState, formData: FormData) => {
    const result = isEdit
      ? await updateNoteAction(prev, formData)
      : await createNoteAction(prev, formData);
    if (!isEdit && !result.error) formRef.current?.reset();
    return result;
  };
  const [state, formAction] = useFormState(action, {});

  return (
    <form ref={formRef} action={formAction} className="form">
      {isEdit ? <input type="hidden" name="id" value={note.id} /> : null}

      <div className="field">
        <label htmlFor="title" className="label">
          Title <span className="help">(optional)</span>
        </label>
        <input
          id="title"
          name="title"
          className="input"
          defaultValue={note?.title ?? ""}
          placeholder="Untitled"
        />
      </div>

      <div className="field">
        <label htmlFor="body" className="label">
          Body <span className="help">(markdown)</span>
        </label>
        <textarea
          id="body"
          name="body"
          className="textarea"
          required
          defaultValue={note?.body ?? ""}
          placeholder="# Heading, - lists, **bold**, - [ ] checkboxes…"
          style={{ minHeight: "10rem" }}
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
            defaultValue={note?.project_id ?? defaultProjectId ?? ""}
          >
            <option value="">— Inbox (unfiled) —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="kind" className="label">
            Kind
          </label>
          <select
            id="kind"
            name="kind"
            className="select"
            defaultValue={note?.kind ?? "quick"}
          >
            <option value="quick">Quick</option>
            <option value="journal">Journal</option>
            <option value="reference">Reference</option>
            <option value="meeting">Meeting</option>
            <option value="workflow">Workflow</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="tags" className="label">
          Tags <span className="help">(comma-separated)</span>
        </label>
        <input
          id="tags"
          name="tags"
          className="input"
          defaultValue={note ? tagsToInput(note.tags) : ""}
          placeholder="invoices, q3, urgent"
        />
      </div>

      <label className="checkbox">
        <input
          type="checkbox"
          name="pinned"
          defaultChecked={note?.pinned ?? false}
        />
        Pin to top
      </label>

      <div className="form-actions">
        <SubmitButton
          label={isEdit ? "Save changes" : "Add note"}
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
