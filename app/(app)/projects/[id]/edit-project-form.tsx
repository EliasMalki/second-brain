"use client";

import { useFormState, useFormStatus } from "react-dom";
import { archiveProjectAction, updateProjectAction } from "../actions";
import { ColorSwatches } from "../color-swatches";
import type { Project } from "@/lib/db/projects";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

export function EditProjectForm({
  project,
  areas,
}: {
  project: Project;
  areas: { id: string; name: string }[];
}) {
  const [state, formAction] = useFormState(updateProjectAction, {});

  return (
    <div className="stack">
      <form action={formAction} className="form card">
        <input type="hidden" name="id" value={project.id} />
        <div className="field">
          <label htmlFor="name" className="label">
            Name
          </label>
          <input
            id="name"
            name="name"
            className="input"
            required
            defaultValue={project.name}
          />
        </div>
        {areas.length > 0 ? (
          <div className="field">
            <label htmlFor="area_id" className="label">
              Area
            </label>
            <select
              id="area_id"
              name="area_id"
              className="select"
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
        <div className="field">
          <label htmlFor="description" className="label">
            Description <span className="help">(markdown)</span>
          </label>
          <textarea
            id="description"
            name="description"
            className="textarea"
            defaultValue={project.description ?? ""}
          />
        </div>
        <div className="field">
          <span className="label">Color</span>
          <ColorSwatches defaultValue={project.color} />
        </div>
        <div className="field">
          <label htmlFor="availability_default" className="label">
            Default availability
          </label>
          <select
            id="availability_default"
            name="availability_default"
            className="select"
            defaultValue={project.availability_default}
          >
            <option value="anytime">Anytime</option>
            <option value="business_hours">Business hours (9–5)</option>
          </select>
          <p className="help">
            Tasks in this project inherit this unless they set their own.
          </p>
        </div>
        <div className="field">
          <label htmlFor="status" className="label">
            Status
          </label>
          <select
            id="status"
            name="status"
            className="select"
            defaultValue={project.status}
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="archived">Archived</option>
          </select>
          <p className="help">
            Paused projects are excluded from briefs; archived ones are hidden.
          </p>
        </div>
        <div className="form-actions">
          <SaveButton />
          {state.error ? (
            <p role="alert" className="error">
              {state.error}
            </p>
          ) : null}
        </div>
      </form>

      {project.status !== "archived" ? (
        <form action={archiveProjectAction} className="form-actions">
          <input type="hidden" name="id" value={project.id} />
          <button type="submit" className="btn btn-danger">
            Archive project
          </button>
          <span className="help">
            Hides it from lists. Nothing is deleted; unarchive via status.
          </span>
        </form>
      ) : null}
    </div>
  );
}
