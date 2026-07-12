"use client";

import { useEffect, useState } from "react";
import { archiveRecordAction } from "./actions";
import { useDismissable } from "../use-dismissable";

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
  // exit mirrors the entrance (§7): requestClose plays it, then unmounts
  const { closing, requestClose } = useDismissable(() => setOpen(false));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, requestClose]);

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
          className={`pm-backdrop${closing ? " is-closing" : ""}`}
          onClick={requestClose}
          role="presentation"
        >
          <div
            className={`pm-modal sm${closing ? " is-closing" : ""}`}
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
                onClick={requestClose}
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
                  onClick={requestClose}
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
