"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { updateProjectAction, type FormState } from "../actions";
import { ColorSwatches } from "../color-swatches";
import { projectColorVars } from "@/lib/colors";
import type { Project } from "@/lib/db/projects";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="pm-btn primary" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

/**
 * The edit-project modal body: a solid project-color header band (echoes the
 * hero, live-updates when a new color is picked), the fields, and a footer
 * with Delete far left + Cancel + Save. The parent renders the backdrop and
 * owns open/close + the delete confirmation.
 */
export function EditProjectForm({
  project,
  areas,
  onSaved,
  onCancel,
  onDelete,
}: {
  project: Project;
  areas: { id: string; name: string }[];
  onSaved?: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const action = async (prev: FormState, formData: FormData) => {
    const result = await updateProjectAction(prev, formData);
    if (!result.error) onSaved?.();
    return result;
  };
  const [state, formAction] = useFormState(action, {});
  // picked color drives the header band live; Save persists it via the form
  const [color, setColor] = useState<string | null>(project.color);

  return (
    <div
      className="pm-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Edit project"
      style={projectColorVars(color)}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="pm-head">
        <span className="pm-heic">
          <i className="ti ti-pencil" aria-hidden="true" />
        </span>
        <div className="pm-titlewrap">
          <span className="pm-title">Edit project</span>
          <span className="pm-sub">{project.name}</span>
        </div>
        <button
          type="button"
          className="pm-x"
          aria-label="Close"
          onClick={onCancel}
        >
          <i className="ti ti-x" aria-hidden="true" />
        </button>
      </div>

      <form action={formAction}>
        <input type="hidden" name="id" value={project.id} />
        {/* status is owned by the hero toggle — preserve it on save */}
        <input type="hidden" name="status" value={project.status} />

        <div className="pm-body">
          <div className="pm-field">
            <label htmlFor="name" className="pm-label">
              Name
            </label>
            <input
              id="name"
              name="name"
              className="pm-input"
              required
              defaultValue={project.name}
            />
          </div>
          {areas.length > 0 ? (
            <div className="pm-field">
              <label htmlFor="area_id" className="pm-label">
                Area
              </label>
              <select
                id="area_id"
                name="area_id"
                className="pm-select"
                defaultValue={project.area_id ?? ""}
              >
                <option value="">None</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="pm-field">
            <label htmlFor="description" className="pm-label">
              Description <span className="hint">(markdown)</span>
            </label>
            <textarea
              id="description"
              name="description"
              className="pm-textarea"
              defaultValue={project.description ?? ""}
            />
          </div>
          <div className="pm-field">
            <span className="pm-label">Color</span>
            <ColorSwatches defaultValue={project.color} onPick={setColor} />
          </div>
          <div className="pm-field">
            <label htmlFor="availability_default" className="pm-label">
              Default availability
            </label>
            <select
              id="availability_default"
              name="availability_default"
              className="pm-select"
              defaultValue={project.availability_default}
            >
              <option value="anytime">Anytime</option>
              <option value="business_hours">Business hours (9–5)</option>
            </select>
            <p className="pm-help">
              Tasks in this project inherit this unless they set their own.
            </p>
          </div>
          {state.error ? (
            <p role="alert" className="pm-error">
              {state.error}
            </p>
          ) : null}
        </div>

        <div className="pm-foot">
          <button type="button" className="pm-btn danger" onClick={onDelete}>
            <i className="ti ti-trash" aria-hidden="true" />
            Delete
          </button>
          <button type="button" className="pm-btn" onClick={onCancel}>
            Cancel
          </button>
          <SaveButton />
        </div>
      </form>
    </div>
  );
}
