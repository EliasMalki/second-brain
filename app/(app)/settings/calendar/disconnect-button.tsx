"use client";

import { useEffect, useState } from "react";
import { disconnectCalendarAction } from "./actions";

/**
 * Disconnecting revokes + deletes the stored OAuth tokens (irreversible short of
 * a full re-auth), so it's gated behind a confirm — matching the app's other
 * destructive actions. Reuses the .pm-modal styling.
 */
export function DisconnectCalendarButton({ label }: { label: string }) {
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
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        {label}
      </button>

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
            aria-label="Disconnect Google Calendar"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pm-head danger">
              <span className="pm-heic">
                <i className="ti ti-plug-connected-x" aria-hidden="true" />
              </span>
              <div className="pm-titlewrap">
                <span className="pm-title">Disconnect Google Calendar?</span>
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
                Your day&apos;s events will stop showing on Home and in the daily
                brief, and the stored access tokens are deleted. You can
                reconnect any time.
              </p>
            </div>
            <form action={disconnectCalendarAction}>
              <div className="pm-foot">
                <button
                  type="button"
                  className="pm-btn"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="pm-btn solid-danger">
                  Disconnect
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
