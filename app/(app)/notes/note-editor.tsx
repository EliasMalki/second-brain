"use client";

import { useEffect, useRef, useState } from "react";
import type { Note } from "@/lib/db/notes";
import { MoveMenu, type MoveTarget } from "./move-menu";
import { Markdown } from "./markdown";

type SaveStatus = "idle" | "saving" | "saved";

/**
 * Pane 3 — the note. Shows a rendered markdown PREVIEW that reflows to the pane
 * width (so nothing scrolls horizontally); double-click the body or hit the
 * pencil to drop into the markdown editor (v0.5 is markdown-only by spec — no
 * rich-text editor). New/empty notes open straight in edit mode. Either way it
 * auto-saves ~600ms after you stop typing; a pending save flushes on unmount
 * when you switch notes (the workspace remounts this with key={note.id}).
 */
export function NoteEditor({
  note,
  folderLabel,
  onSave,
  onTogglePin,
  onArchive,
  onBack,
  moveTargets,
  onMove,
}: {
  note: Note;
  folderLabel: string;
  onSave: (
    id: string,
    patch: { title: string | null; body: string },
  ) => Promise<void>;
  onTogglePin: (id: string, pinned: boolean) => void;
  onArchive: (id: string) => void;
  onBack: () => void;
  moveTargets: MoveTarget[];
  onMove: (id: string, projectId: string | null) => void;
}) {
  const [title, setTitle] = useState(note.title ?? "");
  const [body, setBody] = useState(note.body);
  const [status, setStatus] = useState<SaveStatus>("idle");
  // Existing notes open as a preview; a brand-new empty note opens in edit mode.
  const [editing, setEditing] = useState(!note.title && !note.body);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const firstRun = useRef(true);
  const latest = useRef({ title, body });
  latest.current = { title, body };
  const saved = useRef({ title: note.title ?? "", body: note.body });

  async function flush() {
    const cur = latest.current;
    if (cur.title === saved.current.title && cur.body === saved.current.body)
      return;
    setStatus("saving");
    await onSave(note.id, { title: cur.title.trim() || null, body: cur.body });
    saved.current = { title: cur.title, body: cur.body };
    setStatus("saved");
  }

  // Focus the textarea whenever we enter edit mode.
  useEffect(() => {
    if (editing) bodyRef.current?.focus();
  }, [editing]);

  // Debounced auto-save on edits.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setStatus("saving");
    const t = setTimeout(() => {
      void flush();
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body]);

  // Flush any pending edit when switching away from this note.
  useEffect(() => {
    return () => {
      void flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showPreview() {
    void flush();
    setEditing(false);
  }

  const statusLabel =
    status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "";

  return (
    <div className="note-editor">
      <header className="note-editor-head">
        <button
          type="button"
          className="note-icon-btn note-back"
          onClick={onBack}
          aria-label="Back to notes"
        >
          <i className="ti ti-chevron-left" aria-hidden="true" />
        </button>
        <span className="note-editor-folder">
          <i className="ti ti-folder" aria-hidden="true" />
          {folderLabel}
        </span>
        <span className="note-editor-status" aria-live="polite">
          {statusLabel}
        </span>
        <div className="note-editor-actions">
          <button
            type="button"
            className={"note-icon-btn" + (editing ? " on" : "")}
            onClick={() => (editing ? showPreview() : setEditing(true))}
            aria-label={editing ? "Preview" : "Edit"}
            title={editing ? "Preview" : "Edit"}
          >
            <i
              className={"ti " + (editing ? "ti-eye" : "ti-pencil")}
              aria-hidden="true"
            />
          </button>
          <MoveMenu
            currentProjectId={note.project_id}
            targets={moveTargets}
            onMove={(projectId) => onMove(note.id, projectId)}
          />
          <button
            type="button"
            className={"note-icon-btn" + (note.pinned ? " on" : "")}
            onClick={() => onTogglePin(note.id, !note.pinned)}
            aria-label={note.pinned ? "Unpin" : "Pin"}
            title={note.pinned ? "Unpin" : "Pin"}
          >
            <i className="ti ti-pin" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="note-icon-btn"
            onClick={() => onArchive(note.id)}
            aria-label="Archive"
            title="Archive"
          >
            <i className="ti ti-archive" aria-hidden="true" />
          </button>
        </div>
      </header>

      <input
        className="note-editor-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        aria-label="Note title"
      />

      {editing ? (
        <textarea
          ref={bodyRef}
          className="note-editor-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Start writing… markdown welcome"
          aria-label="Note body"
        />
      ) : (
        <div
          className="note-editor-preview"
          onDoubleClick={() => setEditing(true)}
          title="Double-click to edit"
        >
          {body.trim() ? (
            <Markdown>{body}</Markdown>
          ) : (
            <p className="note-editor-placeholder">
              Empty note — double-click here, or hit the pencil, to write.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
