"use client";

import { useEffect, useRef, useState } from "react";
import type { Note } from "@/lib/db/notes";

type SaveStatus = "idle" | "saving" | "saved";

/**
 * Pane 3 — the editor. Markdown body (v0.5 is markdown-only by spec — no
 * rich-text/block editor) with a title, auto-saving ~600ms after you stop
 * typing. Mounted with key={note.id} by the workspace, so each note gets fresh
 * local state; a pending save is flushed on unmount when you switch notes.
 */
export function NoteEditor({
  note,
  folderLabel,
  onSave,
  onTogglePin,
  onArchive,
  onBack,
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
}) {
  const [title, setTitle] = useState(note.title ?? "");
  const [body, setBody] = useState(note.body);
  const [status, setStatus] = useState<SaveStatus>("idle");

  const titleRef = useRef<HTMLInputElement>(null);
  const firstRun = useRef(true);
  // Latest values + last-persisted values, read by the flush helper without
  // re-subscribing effects on every keystroke.
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

  // Focus a brand-new (empty) note's title so you can type immediately.
  useEffect(() => {
    if (!note.title && !note.body) titleRef.current?.focus();
    // mount only — key={note.id} remounts per note
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const statusLabel =
    status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "";

  return (
    <div className="note-editor">
      <header className="note-editor-head">
        {/* mobile: back to the note list */}
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
        ref={titleRef}
        className="note-editor-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        aria-label="Note title"
      />

      <textarea
        className="note-editor-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Start writing… markdown welcome"
        aria-label="Note body"
      />
    </div>
  );
}
