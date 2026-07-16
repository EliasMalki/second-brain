"use client";

import { useEffect, useRef, useState } from "react";
import { useDismissable } from "../use-dismissable";
import { projectColorVars } from "@/lib/colors";

/** A move destination: a project (with its quiet color), or null for
 *  Inbox/unfiled. */
export type MoveTarget = { id: string | null; name: string; color: string | null };

/**
 * "Move to folder" menu in the editor header — the Apple-Notes equivalent of
 * dragging a note between folders. Picking a project sets the note's
 * project_id; picking Inbox clears it. Filing an unfiled note is the same
 * action (Inbox note → project). Drag-and-drop is intentionally skipped; this
 * menu is enough per spec.
 */
export function MoveMenu({
  currentProjectId,
  targets,
  onMove,
}: {
  currentProjectId: string | null;
  targets: MoveTarget[];
  onMove: (projectId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  // exit mirrors the pop-in entrance (§7); requestClose plays it, then
  // unmounts; cancelClose lets a click during the closing beat reopen
  const { closing, requestClose, cancelClose } = useDismissable(() =>
    setOpen(false),
  );
  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open)
      popRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  return (
    <div className="move-menu">
      <button
        type="button"
        className="note-icon-btn"
        onClick={() => {
          if (!open) setOpen(true);
          else if (closing) cancelClose(); // mid-close click = keep it open
          else requestClose();
        }}
        aria-label="Move to folder"
        title="Move to folder"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <i className="ti ti-folder-share" aria-hidden="true" />
      </button>

      {open ? (
        <>
          <div
            className={`move-menu-backdrop${closing ? " is-closing" : ""}`}
            onClick={requestClose}
            aria-hidden="true"
          />
          <div
            ref={popRef}
            className={`move-menu-pop${closing ? " is-closing" : ""}`}
            role="menu"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                requestClose();
              }
            }}
          >
            <p className="move-menu-label">Move to</p>
            {targets.map((t) => {
              const active = (t.id ?? null) === currentProjectId;
              return (
                <button
                  key={t.id ?? "__inbox"}
                  type="button"
                  role="menuitem"
                  className={"move-menu-item" + (active ? " on" : "")}
                  onClick={() => {
                    if (!active) onMove(t.id);
                    requestClose();
                  }}
                >
                  {t.id === null ? (
                    <i className="ti ti-inbox" aria-hidden="true" />
                  ) : (
                    <span
                      className="move-menu-dot"
                      style={projectColorVars(t.color)}
                      aria-hidden="true"
                    />
                  )}
                  <span className="move-menu-name">{t.name}</span>
                  {active ? (
                    <i
                      className="ti ti-check move-menu-check"
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
