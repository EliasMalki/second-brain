"use client";

import { useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createNoteAction, type FormState } from "./actions";

type ProjectOption = { id: string; name: string };

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="qa-btn primary"
      disabled={pending}
      title="Add note (Enter)"
      aria-label="Add note"
    >
      <i className="ti ti-plus" aria-hidden="true" />
    </button>
  );
}

/**
 * One-line note creation: write, Enter to save (Shift+Enter for a newline).
 * The toggle reveals project / kind / tags. Title stays blank — the list
 * previews the first line. Reuses createNoteAction unchanged.
 */
export function QuickAddNote({
  projects,
  defaultProjectId,
}: {
  projects: ProjectOption[];
  defaultProjectId?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);

  const action = async (prev: FormState, formData: FormData) => {
    const result = await createNoteAction(prev, formData);
    if (!result.error) {
      formRef.current?.reset();
      if (bodyRef.current) {
        bodyRef.current.style.height = "auto";
        bodyRef.current.focus();
      }
    }
    return result;
  };
  const [state, formAction] = useFormState(action, {});

  function autoGrow() {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  return (
    <form ref={formRef} action={formAction} className="quick-add">
      <div className="quick-add-row">
        <i className="ti ti-bulb" aria-hidden="true" />
        <textarea
          ref={bodyRef}
          name="body"
          rows={1}
          required
          placeholder="Write a note… markdown welcome"
          aria-label="New note"
          onInput={autoGrow}
          onKeyDown={onKeyDown}
          style={{ maxHeight: "10rem", overflowY: "auto" }}
        />
        <button
          type="button"
          className={open ? "qa-btn active" : "qa-btn"}
          onClick={() => setOpen((v) => !v)}
          title="More options"
          aria-label="More options"
          aria-expanded={open}
        >
          <i className="ti ti-adjustments-horizontal" aria-hidden="true" />
        </button>
        <SendButton />
      </div>

      <div className="quick-add-options" hidden={!open}>
        <select
          name="project_id"
          defaultValue={defaultProjectId ?? ""}
          aria-label="Project"
          title="Project"
        >
          <option value="">Inbox (unfiled)</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select name="kind" defaultValue="quick" aria-label="Kind" title="Kind">
          <option value="quick">Quick</option>
          <option value="journal">Journal</option>
          <option value="reference">Reference</option>
          <option value="meeting">Meeting</option>
          <option value="workflow">Workflow</option>
        </select>
        <input
          type="text"
          name="title"
          placeholder="Title (optional)"
          aria-label="Title"
        />
        <input
          type="text"
          name="tags"
          placeholder="tags, comma, separated"
          aria-label="Tags"
        />
      </div>

      {state.error ? (
        <p role="alert" className="quick-add-error">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
