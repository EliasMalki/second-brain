"use client";

import { OPEN_NEW_PROJECT_EVENT } from "./new-project-form";

/**
 * The dashed "+ New project" ghost card ending the last group. Opens the
 * create bar with its options pre-expanded and the area preset to this
 * ghost's group (Business/Personal), name field focused.
 */
export function NewProjectGhost({ areaId }: { areaId: string }) {
  return (
    <button
      type="button"
      className="pc-ghost"
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent(OPEN_NEW_PROJECT_EVENT, { detail: { areaId } }),
        )
      }
    >
      <i className="ti ti-plus" aria-hidden="true" />
      New project
    </button>
  );
}
