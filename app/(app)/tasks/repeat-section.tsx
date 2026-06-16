"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { RecurrenceFields } from "./recurrence-fields";
import { upsertTaskRecurrenceAction, type FormState } from "./recurrence-actions";
import type { Recurrence } from "@/lib/db/recurrences";

function SaveButton({ repeat }: { repeat: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-pill go" disabled={pending}>
      {pending ? "Saving…" : repeat ? "Save repeat" : "Turn off repeat"}
    </button>
  );
}

/**
 * The detail-page "Repeat" toggle. Off by default; turning it on reveals the
 * recurrence sentence-builder. Submitting calls upsertTaskRecurrenceAction,
 * which creates/updates a FIXED rule (the nightly job makes future instances)
 * or deactivates it. Prefilled from the task's existing active rule, if any.
 */
export function RepeatSection({
  taskId,
  recurrence,
}: {
  taskId: string;
  recurrence: Recurrence | null;
}) {
  const active = !!recurrence && recurrence.active;
  const [repeat, setRepeat] = useState(active);
  const [state, formAction] = useFormState<FormState, FormData>(
    upsertTaskRecurrenceAction,
    {},
  );

  return (
    <div className="card">
      <p className="card-label">
        <i className="ti ti-refresh" aria-hidden="true" />
        Repeat
      </p>
      <form action={formAction} className="repeat-form">
        <input type="hidden" name="task_id" value={taskId} />
        <input type="hidden" name="repeat" value={repeat ? "1" : "0"} />

        <label className={repeat ? "qa-repeat on" : "qa-repeat"}>
          <input
            type="checkbox"
            checked={repeat}
            onChange={(e) => setRepeat(e.target.checked)}
          />
          <i className="ti ti-refresh" aria-hidden="true" />
          {repeat ? "Repeats" : "Does not repeat"}
        </label>

        {repeat ? (
          <RecurrenceFields
            defaultFreq={recurrence?.freq ?? "weekly"}
            defaultInterval={recurrence?.interval ?? 1}
            defaultByday={recurrence?.byday ?? []}
          />
        ) : null}

        <div className="form-actions">
          {repeat !== active || repeat ? <SaveButton repeat={repeat} /> : null}
          {state.error ? (
            <p role="alert" className="error">
              {state.error}
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}
