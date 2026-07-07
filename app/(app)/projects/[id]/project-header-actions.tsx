"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setProjectStatusAction } from "../actions";
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
 * The solid-color hero of the project detail page: name + status pill,
 * description, meta chips, then an actions row — Active⇄Pause segmented
 * toggle on the left, the white Edit button anchored bottom-right. No ⋯
 * overflow menu: Delete and change-color live inside the Edit modal.
 * Status changes are optimistic with an undo toast; Delete is confirm-gated
 * and (per the project's no-hard-delete rule) archives.
 */
export function ProjectHero({
  project,
  areas,
  areaName,
  availabilityLabel,
  updatedAgo,
}: {
  project: Project;
  areas: Area[];
  areaName: string | null;
  availabilityLabel: string;
  updatedAgo: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [, startTransition] = useTransition();

  // auto-dismiss the undo toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  // Esc dismisses whichever modal is open
  useEffect(() => {
    if (!editOpen && !confirmOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setEditOpen(false);
        setConfirmOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editOpen, confirmOpen]);

  const persistStatus = (next: ProjectStatus) =>
    startTransition(async () => {
      await setProjectStatusAction(fd({ id: project.id, status: next }));
    });

  const changeStatus = (next: ProjectStatus, msg: string, withUndo = true) => {
    const prev = status;
    setStatus(next);
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

  const confirmDelete = () => {
    setConfirmOpen(false);
    setStatus("archived");
    persistStatus("archived");
    router.push("/projects");
  };

  return (
    <>
      <div className="p2-hero">
        <div className="p2-hero-top">
          <div className="p2-id">
            <div className="p2-namerow">
              <span className="p2-name">{project.name}</span>
              <span className={`pill pill-${status}`}>{statusLabel}</span>
            </div>
            {project.description ? (
              <p className="p2-desc">{project.description}</p>
            ) : null}
            <div className="p2-meta">
              {areaName ? (
                <span className="p2-metachip">
                  <i className="ti ti-briefcase" aria-hidden="true" />
                  {areaName}
                </span>
              ) : null}
              <span className="p2-metachip">
                <i className="ti ti-clock" aria-hidden="true" />
                {availabilityLabel}
              </span>
              <span className="p2-metachip">
                <i className="ti ti-history" aria-hidden="true" />
                Updated {updatedAgo}
              </span>
            </div>
          </div>
        </div>

        <div className="p2-actions">
          {!isArchived ? (
            <div className="p2-seg" role="group" aria-label="Active or paused">
              <button
                type="button"
                className={isPaused ? "" : "on"}
                aria-pressed={!isPaused}
                onClick={() => {
                  if (isPaused) changeStatus("active", "Project resumed");
                }}
              >
                <i className="ti ti-circle-check" aria-hidden="true" />
                Active
              </button>
              <button
                type="button"
                className={isPaused ? "on" : ""}
                aria-pressed={isPaused}
                onClick={() => {
                  if (!isPaused) changeStatus("paused", "Project paused");
                }}
              >
                <i className="ti ti-player-pause" aria-hidden="true" />
                Pause
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="p2-abtn"
              onClick={() => changeStatus("active", "Project reactivated")}
            >
              <i className="ti ti-player-play" aria-hidden="true" />
              Reactivate
            </button>
          )}
          <span className="p2-spacer" />
          <button
            type="button"
            className="p2-abtn p2-edit"
            onClick={() => setEditOpen(true)}
          >
            <i className="ti ti-pencil" aria-hidden="true" />
            Edit
          </button>
        </div>
      </div>

      {/* edit modal */}
      {editOpen ? (
        <div
          className="pm-backdrop"
          onClick={() => setEditOpen(false)}
          role="presentation"
        >
          <EditProjectForm
            project={project}
            areas={areas}
            onSaved={() => setEditOpen(false)}
            onCancel={() => setEditOpen(false)}
            onDelete={() => {
              setEditOpen(false);
              setConfirmOpen(true);
            }}
          />
        </div>
      ) : null}

      {/* delete confirmation — archives (nothing is permanently destroyed) */}
      {confirmOpen ? (
        <div
          className="pm-backdrop"
          onClick={() => setConfirmOpen(false)}
          role="presentation"
        >
          <div
            className="pm-modal sm"
            role="alertdialog"
            aria-modal="true"
            aria-label="Delete project"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pm-head danger">
              <span className="pm-heic">
                <i className="ti ti-trash" aria-hidden="true" />
              </span>
              <div className="pm-titlewrap">
                <span className="pm-title">Delete this project?</span>
              </div>
              <button
                type="button"
                className="pm-x"
                aria-label="Close"
                onClick={() => setConfirmOpen(false)}
              >
                <i className="ti ti-x" aria-hidden="true" />
              </button>
            </div>
            <div className="pm-body">
              <p className="pm-copy">
                This archives <strong>{project.name}</strong> and everything in
                it. Nothing is permanently deleted — restore it any time from{" "}
                <em>Show archived</em>.
              </p>
            </div>
            <div className="pm-foot">
              <button
                type="button"
                className="pm-btn"
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="pm-btn solid-danger"
                onClick={confirmDelete}
              >
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
    </>
  );
}
