"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Note } from "@/lib/db/notes";
import { MoveMenu, type MoveTarget } from "./move-menu";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "@second-brain/editor/web";
import {
  createAutosaveController,
  type SaveState,
} from "@second-brain/editor/save";
import { noteDrafts, readNoteDraftSync } from "@/lib/note-drafts";

const STATUS_LABEL: Record<SaveState, string> = {
  saved: "Saved",
  dirty: "Saving…",
  saving: "Saving…",
  error: "Not saved — retrying",
  offline: "Offline — will sync",
};

/**
 * Pane 3 — the note, on the shared live-preview editor (@second-brain/editor).
 * One modeless surface: always styled, always editable — the old edit⇄preview
 * split is gone. Saves run through the package's autosave contract: ~1s
 * debounce, flush on blur/note-switch/tab-hide/Mod-S, retry with backoff,
 * offline-aware, and a localStorage draft written through on every edit so
 * input survives crashes. Conflict stance: last-write-wins (single-user).
 * The workspace remounts this with key={note.id} when switching notes.
 */
export function NoteEditor({
  note,
  folderLabel,
  onSave,
  onTogglePin,
  onArchive,
  onUnarchive,
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
  onUnarchive?: (id: string) => void;
  onBack: () => void;
  moveTargets: MoveTarget[];
  onMove: (id: string, projectId: string | null) => void;
}) {
  // Restore flow: a draft newer than the server row with different content
  // seeds the buffer (autosave then pushes it — last-write-wins by design).
  const [initial] = useState(() => {
    const draft = readNoteDraftSync(note.id);
    if (
      draft &&
      draft.savedAt > note.updated_at &&
      (draft.body !== note.body ||
        (draft.title ?? null) !== (note.title ?? null))
    )
      return { title: draft.title ?? "", body: draft.body, restored: true };
    return { title: note.title ?? "", body: note.body, restored: false };
  });

  const [title, setTitle] = useState(initial.title);
  const [status, setStatus] = useState<SaveState | null>(null);
  const editor = useRef<MarkdownEditorHandle | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const latestTitle = useRef(initial.title);
  latestTitle.current = title;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const controller = useMemo(
    () =>
      createAutosaveController({
        save: (doc) => onSaveRef.current(note.id, doc),
        initial: { title: note.title ?? null, body: note.body },
        drafts: noteDrafts,
        noteId: note.id,
        onState: setStatus,
      }),
    // The note's identity is fixed for this mount (key={note.id}).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function edited(nextTitle?: string) {
    controller.noteEdited({
      title: (nextTitle ?? latestTitle.current).trim() || null,
      body: editor.current?.getDoc() ?? initial.body,
    });
  }

  useEffect(() => {
    if (initial.restored) edited(); // push the restored draft
    if (!initial.title && !initial.body) titleRef.current?.focus();

    controller.setOnline(navigator.onLine);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void controller.flush();
    };
    const online = () => controller.setOnline(true);
    const offline = () => controller.setOnline(false);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      // Flush the pending edit when switching notes, then stop the timers.
      void controller.flush().finally(() => controller.dispose());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <span
          className={
            "note-editor-status" +
            (status === "error" || status === "offline" ? " err" : "")
          }
          aria-live="polite"
        >
          {status ? STATUS_LABEL[status] : ""}
        </span>
        <div className="note-editor-actions">
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
          {note.archived && onUnarchive ? (
            <button
              type="button"
              className="note-icon-btn"
              onClick={() => onUnarchive(note.id)}
              aria-label="Unarchive"
              title="Unarchive"
            >
              <i className="ti ti-archive-off" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              className="note-icon-btn"
              onClick={() => onArchive(note.id)}
              aria-label="Archive"
              title="Archive"
            >
              <i className="ti ti-archive" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      <input
        ref={titleRef}
        className="note-editor-title"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          edited(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "ArrowDown") {
            e.preventDefault();
            editor.current?.focus();
          }
        }}
        onBlur={() => void controller.flush()}
        placeholder="Title"
        aria-label="Note title"
      />

      <div className="note-editor-cm">
        <MarkdownEditor
          doc={initial.body}
          placeholder="Start writing…"
          onDocChanged={() => edited()}
          onFocusChange={(focused) => {
            if (!focused) void controller.flush();
          }}
          onRequestSave={() => void controller.flush()}
          onReady={(handle) => {
            editor.current = handle;
          }}
        />
      </div>
    </div>
  );
}
