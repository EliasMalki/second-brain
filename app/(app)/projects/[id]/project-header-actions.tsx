"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setProjectColorAction,
  setProjectStatusAction,
} from "../actions";
import { ColorSwatches } from "../color-swatches";
import { EditProjectForm } from "./edit-project-form";
import type { Project, ProjectStatus } from "@/lib/db/projects";

type Area = { id: string; name: string };
type Toast = { msg: string; undo?: () => void } | null;

const fd = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

/**
 * The project header actions cluster: an Active⇄Pause segmented toggle, an Edit
 * button (modal), and a ⋯ overflow (Edit / Pause-Resume / Archive / Change
 * color / Delete). The status pill lives here too so it flips optimistically
 * with the toggle. Status changes are optimistic with an undo toast; Delete is
 * confirm-gated and (per the project's no-hard-delete rule) archives.
 */
export function ProjectHeaderActions({
  project,
  areas,
}: {
  project: Project;
  areas: Area[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  // close the ⋯ menu / color popover on any outside click
  useEffect(() => {
    if (!menuOpen && !colorOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setColorOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen, colorOpen]);

  // auto-dismiss the undo toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const persistStatus = (next: ProjectStatus) =>
    startTransition(async () => {
      await setProjectStatusAction(fd({ id: project.id, status: next }));
    });

  const changeStatus = (next: ProjectStatus, msg: string, withUndo = true) => {
    const prev = status;
    setStatus(next);
    setMenuOpen(false);
    persistStatus(next);
    setToast({
      msg,
      undo: withUndo
        ? () => {
            setStatus(prev);
            persistStatus(prev);
            setToast(null);
          }
        : undefined,
    });
  };

  const isPaused = status === "paused";
  const isArchived = status === "archived";
  const statusLabel = isArchived ? "Archived" : isPaused ? "Paused" : "Active";

  const toggle = () =>
    changeStatus(
      isPaused ? "active" : "paused",
      isPaused ? "Project resumed" : "Project paused",
    );

  const pickColor = (value: string | null) => {
    setColorOpen(false);
    setMenuOpen(false);
    startTransition(async () => {
      await setProjectColorAction(fd({ id: project.id, color: value ?? "" }));
      router.refresh();
    });
  };

  const confirmDelete = () => {
    setConfirmOpen(false);
    setStatus("archived");
    persistStatus("archived");
    router.push("/projects");
  };

  return (
    <div className="proj-actions-wrap">
      <span className={`pill pill-${status}`}>{statusLabel}</span>

      <div className="proj-actions">
        {!isArchived ? (
          <div className="proj-toggle" role="group" aria-label="Active or paused">
            <button
              type="button"
              className={isPaused ? "tg" : "tg on"}
              aria-pressed={!isPaused}
              onClick={() => {
                if (isPaused) toggle();
              }}
            >
              {isPaused ? (
                <>
                  <i className="ti ti-player-play" aria-hidden="true" />
                  Resume
                </>
              ) : (
                "Active"
              )}
            </button>
            <button
              type="button"
              className={isPaused ? "tg on pz" : "tg"}
              aria-pressed={isPaused}
              onClick={() => {
                if (!isPaused) toggle();
              }}
            >
              {isPaused ? (
                "Paused"
              ) : (
                <>
                  <i className="ti ti-player-pause" aria-hidden="true" />
                  Pause
                </>
              )}
            </button>
          </div>
        ) : null}

        <button
          type="button"
          className="btn proj-edit-btn"
          onClick={() => setEditOpen(true)}
        >
          <i className="ti ti-pencil" aria-hidden="true" />
          Edit
        </button>

        <div className="proj-menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="proj-icon-btn"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="More actions"
            onClick={() => {
              setMenuOpen((v) => !v);
              setColorOpen(false);
            }}
          >
            <i className="ti ti-dots" aria-hidden="true" />
          </button>

          {menuOpen ? (
            <div className="proj-menu" role="menu">
              <button
                type="button"
                className="proj-mi"
                role="menuitem"
                onClick={() => {
                  setEditOpen(true);
                  setMenuOpen(false);
                }}
              >
                <i className="ti ti-pencil" aria-hidden="true" />
                Edit project
              </button>

              {!isArchived ? (
                <button type="button" className="proj-mi" role="menuitem" onClick={toggle}>
                  <i
                    className={`ti ${isPaused ? "ti-player-play" : "ti-player-pause"}`}
                    aria-hidden="true"
                  />
                  {isPaused ? "Resume project" : "Pause project"}
                </button>
              ) : (
                <button
                  type="button"
                  className="proj-mi"
                  role="menuitem"
                  onClick={() => changeStatus("active", "Project reactivated")}
                >
                  <i className="ti ti-player-play" aria-hidden="true" />
                  Reactivate
                </button>
              )}

              {!isArchived ? (
                <button
                  type="button"
                  className="proj-mi"
                  role="menuitem"
                  onClick={() => changeStatus("archived", "Project archived")}
                >
                  <i className="ti ti-archive" aria-hidden="true" />
                  Archive
                </button>
              ) : null}

              <button
                type="button"
                className="proj-mi"
                role="menuitem"
                onClick={() => setColorOpen((v) => !v)}
              >
                <i className="ti ti-color-swatch" aria-hidden="true" />
                Change color
              </button>

              {colorOpen ? (
                <div className="proj-color-pop">
                  <ColorSwatches defaultValue={project.color} onPick={pickColor} />
                </div>
              ) : null}

              <button
                type="button"
                className="proj-mi danger"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmOpen(true);
                }}
              >
                <i className="ti ti-trash" aria-hidden="true" />
                Delete
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* edit modal */}
      {editOpen ? (
        <div
          className="modal-backdrop"
          onClick={() => setEditOpen(false)}
          role="presentation"
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Edit project"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <span className="modal-title">Edit project</span>
              <button
                type="button"
                className="proj-icon-btn"
                aria-label="Close"
                onClick={() => setEditOpen(false)}
              >
                <i className="ti ti-x" aria-hidden="true" />
              </button>
            </div>
            <EditProjectForm
              project={project}
              areas={areas}
              onSaved={() => setEditOpen(false)}
            />
          </div>
        </div>
      ) : null}

      {/* delete confirmation — archives (nothing is permanently destroyed) */}
      {confirmOpen ? (
        <div
          className="modal-backdrop"
          onClick={() => setConfirmOpen(false)}
          role="presentation"
        >
          <div
            className="modal modal-sm"
            role="alertdialog"
            aria-modal="true"
            aria-label="Delete project"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <span className="modal-title">Delete this project?</span>
            </div>
            <p className="help" style={{ margin: "0 0 var(--space-4)" }}>
              This archives <strong>{project.name}</strong> and everything in it.
              Nothing is permanently deleted — restore it any time from{" "}
              <em>Show archived</em>.
            </p>
            <div className="form-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={confirmDelete}>
                Delete project
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* undo toast */}
      {toast ? (
        <div className="undo-toast" role="status">
          <span>{toast.msg}</span>
          {toast.undo ? (
            <button type="button" className="undo-btn" onClick={toast.undo}>
              Undo
            </button>
          ) : null}
          <button
            type="button"
            className="undo-x"
            aria-label="Dismiss"
            onClick={() => setToast(null)}
          >
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
