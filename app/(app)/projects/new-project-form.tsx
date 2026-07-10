"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createProjectAction } from "./actions";
import { ColorSwatches } from "./color-swatches";

/** Fired by the "+ New project" ghost card: opens this form with the options
 *  panel expanded and the area preset to the ghost's group. */
export const OPEN_NEW_PROJECT_EVENT = "second-brain:open-new-project";

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="plus"
      disabled={pending}
      title="Create project (Enter)"
      aria-label="Create project"
    >
      <i className="ti ti-plus" aria-hidden="true" />
    </button>
  );
}

/**
 * Quick-add for projects: name, Enter to create (redirects to the new
 * project). Area + description + color sit in an options panel ABOVE the input
 * row that slides down as soon as you start typing a name and collapses again
 * when the field is cleared (the adjustments toggle lets you fold it away while
 * a name is present). Empty field = just the clean bar.
 */
export function NewProjectForm({
  areas,
}: {
  areas: { id: string; name: string }[];
}) {
  const [state, formAction] = useFormState(createProjectAction, {});
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [areaId, setAreaId] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ areaId?: string }>).detail;
      if (detail?.areaId !== undefined) setAreaId(detail.areaId);
      setOpen(true);
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      nameRef.current?.focus();
    };
    window.addEventListener(OPEN_NEW_PROJECT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_NEW_PROJECT_EVENT, onOpen);
  }, []);

  const typed = name.trim().length > 0;

  return (
    <form ref={formRef} action={formAction} className="pl-add">
      {/* options sit ABOVE the input row */}
      <div className="pl-opts" hidden={!open}>
        {areas.length > 0 ? (
          <select
            name="area_id"
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
            aria-label="Area"
            title="Area"
          >
            <option value="">No area</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        ) : null}
        <input
          type="text"
          name="description"
          className="desc"
          placeholder="What this project is (helps the classifier)"
          aria-label="Description"
        />
        <div className="pl-color">
          <span className="pl-color-label">Color</span>
          <ColorSwatches />
        </div>
      </div>

      <div className="pl-add-row">
        <i className="ti ti-folder-plus" aria-hidden="true" />
        <input
          ref={nameRef}
          type="text"
          name="name"
          required
          value={name}
          onChange={(e) => {
            const next = e.target.value;
            const wasEmpty = name.trim().length === 0;
            const nowEmpty = next.trim().length === 0;
            setName(next);
            // slide the options panel down on the first character typed; collapse
            // when cleared. Mid-typing we leave `open` alone so a manual collapse
            // (the toggle) is respected.
            if (nowEmpty) setOpen(false);
            else if (wasEmpty) setOpen(true);
          }}
          placeholder="New project… e.g. Car flipping"
          aria-label="Project name"
        />
        <button
          type="button"
          className={open ? "opt active" : "opt"}
          hidden={!typed && !open}
          onClick={() => setOpen((v) => !v)}
          title="More options"
          aria-label="More options"
          aria-expanded={open}
        >
          <i className="ti ti-adjustments-horizontal" aria-hidden="true" />
        </button>
        <SendButton />
      </div>

      {state.error ? (
        <p role="alert" className="pl-error">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
