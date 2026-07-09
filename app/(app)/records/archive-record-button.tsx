"use client";

import { useEffect, useState } from "react";
import { archiveRecordAction } from "./actions";

/**
 * Archive a record behind a confirm step — the archive action redirects to the
 * project, so an undo toast can't survive the navigation; a confirm is the right
 * guard. Reuses the same .pm-modal styling as the project-delete confirm.
 */
export function ArchiveRecordButton({
  recordId,
  projectId,
  label,
}: {
  recordId: string;
  projectId: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="form-actions">
      <button
        type="button"
        className="btn btn-danger"
        onClick={() => setOpen(true)}
      >
        Archive {label}
      </button>
      <span className="help">
        Hides it from the list. Tasks and receipts are kept.
      </span>

      {open ? (
        <div
          className="pm-backdrop"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="pm-modal sm"
            role="alertdialog"
            aria-modal="true"
            aria-label={`Archive ${label}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pm-head danger">
              <span className="pm-heic">
                <i className="ti ti-archive" aria-hidden="true" />
              </span>
              <div className="pm-titlewrap">
                <span className="pm-title">Archive this {label}?</span>
              </div>
              <button
                type="button"
                className="pm-x"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                <i className="ti ti-x" aria-hidden="true" />
              </button>
            </div>
            <div className="pm-body">
              <p className="pm-copy">
                Hides it from the list. Tasks and receipts are kept — you can
                find it again later.
              </p>
            </div>
            <form action={archiveRecordAction}>
              <input type="hidden" name="id" value={recordId} />
              <input type="hidden" name="project_id" value={projectId} />
              <div className="pm-foot">
                <button
                  type="button"
                  className="pm-btn"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="pm-btn solid-danger">
                  Archive
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
