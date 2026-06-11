"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { captureAction, type CaptureState } from "./capture-box-actions";

function CaptureButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Capturing…" : "Capture"}
    </button>
  );
}

/**
 * Quick capture. Never blocks: the thought is written and filed to the Inbox
 * immediately. Self-contained so the Week-2 offline queue can wrap it.
 */
export function CaptureBox() {
  const [state, formAction] = useFormState(captureAction, {} as CaptureState);
  const formRef = useRef<HTMLFormElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // On a successful capture: clear and refocus for rapid entry.
  useEffect(() => {
    if (state.noteId) {
      formRef.current?.reset();
      textRef.current?.focus();
    }
  }, [state.noteId]);

  return (
    <div className="card capture-card">
      <form ref={formRef} action={formAction} className="capture-form">
        <textarea
          ref={textRef}
          name="text"
          className="textarea capture-input"
          required
          placeholder="Capture a thought, task, or note… it lands in your Inbox."
          aria-label="Capture"
        />
        <div className="capture-foot">
          <span className="capture-status" aria-live="polite">
            {state.noteId ? (
              <>
                Captured ✓ — in your{" "}
                <Link href="/notes?view=inbox">Inbox</Link>
              </>
            ) : state.error ? (
              <span className="error">{state.error}</span>
            ) : null}
          </span>
          <CaptureButton />
        </div>
      </form>
    </div>
  );
}
