"use client";

import { useRef, useTransition } from "react";
import { updateRecordStageAction } from "./actions";

/** The §10 stage dropdown: change = save, no separate button. */
export function StageSelect({
  recordId,
  stage,
  stages,
}: {
  recordId: string;
  stage: string | null;
  stages: string[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form ref={formRef} action={updateRecordStageAction}>
      <input type="hidden" name="id" value={recordId} />
      <select
        // uncontrolled + key: shows the user's pick instantly, remounts to the
        // server value after revalidation
        key={stage}
        name="stage"
        className="select select-sm"
        aria-label="Stage"
        defaultValue={stage ?? ""}
        disabled={pending}
        onChange={() => {
          startTransition(() => {
            formRef.current?.requestSubmit();
          });
        }}
      >
        {/* a record can hold a stage that was since renamed — keep it visible */}
        {stage && !stages.includes(stage) ? (
          <option value={stage}>{stage}</option>
        ) : null}
        {stages.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </form>
  );
}
