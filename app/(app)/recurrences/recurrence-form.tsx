"use client";

import { useFormState } from "react-dom";
import { createRecurrenceAction, type FormState } from "./actions";
import type { Project } from "@/lib/db/projects";

/**
 * Create a FIXED recurrence (v0.5: fixed anchor only). Weekly rules fire on
 * the start date's weekday; monthly on its month-day.
 */
export function RecurrenceForm({ projects }: { projects: Project[] }) {
  const [state, formAction] = useFormState<FormState, FormData>(
    createRecurrenceAction,
    {},
  );

  return (
    <form action={formAction} className="card stack form">
      <div className="field">
        <label htmlFor="rec-title">Task title</label>
        <input
          id="rec-title"
          name="title"
          type="text"
          placeholder="e.g. Water the plants"
          required
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="rec-freq">Every</label>
          <div className="inline-form">
            <input
              id="rec-interval"
              name="interval"
              type="number"
              min={1}
              max={365}
              defaultValue={1}
              style={{ width: "5rem" }}
            />
            <select id="rec-freq" name="freq" defaultValue="weekly">
              <option value="daily">day(s)</option>
              <option value="weekly">week(s)</option>
              <option value="monthly">month(s)</option>
              <option value="yearly">year(s)</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="rec-start">Starting</label>
          <input id="rec-start" name="start_date" type="date" required />
        </div>
        <div className="field">
          <label htmlFor="rec-until">Until (optional)</label>
          <input id="rec-until" name="until" type="date" />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="rec-project">Project</label>
          <select id="rec-project" name="project_id" defaultValue="">
            <option value="">— none (Inbox) —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="rec-priority">Priority</label>
          <select id="rec-priority" name="priority" defaultValue="C">
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="D">D</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="rec-effort">Effort</label>
          <select id="rec-effort" name="effort" defaultValue="">
            <option value="">—</option>
            <option value="quick">quick</option>
            <option value="deep">deep</option>
          </select>
        </div>
      </div>

      {state.error ? <p className="form-error">{state.error}</p> : null}
      <div>
        <button type="submit" className="btn btn-primary">
          Create recurrence
        </button>
      </div>
    </form>
  );
}
