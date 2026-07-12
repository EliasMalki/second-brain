"use client";

import { useRef, useTransition } from "react";
import { updateRecordStageAction } from "./actions";
import { UndoToast, useUndoToast } from "../undo-toast";

/** The §10 stage dropdown: change = save, no separate button. Offers an undo
 *  toast so an accidental pick is reversible (matches the rest of the app). */
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
  const committed = useRef(stage ?? "");
  const undo = useUndoToast();

  const submit = () =>
    startTransition(() => {
      formRef.current?.requestSubmit();
    });

  return (
    <>
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
          onChange={(e) => {
            const next = e.target.value;
            const prev = committed.current;
            committed.current = next;
            submit();
            if (prev && prev !== next) {
              undo.show({
                msg: `Stage → ${next}`,
                undo: () => {
                  const sel = formRef.current?.querySelector("select");
                  if (sel) sel.value = prev;
                  committed.current = prev;
                  submit();
                },
              });
            }
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
      <UndoToast toast={undo.toast} onClear={undo.clear} />
    </>
  );
}
