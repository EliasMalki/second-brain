"use client";

import { useEffect, useState } from "react";
import type { Note } from "@/lib/db/notes";
import { NoteGallery } from "./note-gallery";
import type { Folder, FolderGroup } from "./workspace-types";
import type { MoveTarget } from "./move-menu";

const VIEW_KEY = "sb_notes_view";
type NotesView = "cards" | "list";

/** Strip markdown markers from a single line for the compact row preview. */
function stripLine(line: string): string {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links -> text
    .replace(/^[#>\s]*/, "") // leading heading / quote markers
    .replace(/^[-*+]\s+(\[[ xX]\]\s+)?/, "") // list / checkbox markers
    .replace(/[*_`~]/g, "") // inline emphasis / code
    .trim();
}

/**
 * Apple-Notes row text: the title line + a preview line. If the note has an
 * explicit title we preview the whole body; otherwise the first non-empty line
 * becomes the title and the rest is the preview.
 */
function rowText(note: Note): { title: string; preview: string } {
  const explicit = note.title?.trim();
  const lines = note.body
    .split("\n")
    .map(stripLine)
    .filter((l) => l.length > 0);

  if (explicit) return { title: explicit, preview: lines.join("  ") };
  return {
    title: lines[0] ?? "New Note",
    preview: lines.slice(1).join("  "),
  };
}

/** "3:42 PM" if edited today, else "Jun 16". Client-only formatting. */
function editedLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * Pane 2 — the notes for the selected folder, as a card GALLERY by default
 * (browse mode widens this pane when no note is open) with the compact rows
 * view a toggle away. The choice persists (localStorage; SSR renders the
 * "cards" default for a stable first paint, the saved choice adopts on
 * mount — same pattern as the Tasks board toggle).
 */
export function NoteList({
  notes,
  folder,
  folderGroups,
  selectedId,
  title,
  orgCollapsed,
  moveTargets,
  onSelect,
  onNewNote,
  onTogglePin,
  onArchive,
  onUnarchive,
  onMove,
  onExpandOrg,
  onBack,
}: {
  notes: Note[];
  folder: Folder;
  folderGroups: FolderGroup[];
  selectedId: string | null;
  title: string;
  orgCollapsed: boolean;
  moveTargets: MoveTarget[];
  onSelect: (id: string) => void;
  onNewNote: (projectId: string | null) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onArchive: (id: string) => void;
  onUnarchive?: (id: string) => void;
  onMove: (id: string, projectId: string | null) => void;
  onExpandOrg: () => void;
  onBack: () => void;
}) {
  const [view, setView] = useState<NotesView>("cards");
  useEffect(() => {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === "cards" || saved === "list") setView(saved);
  }, []);
  const chooseView = (v: NotesView) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* storage disabled — the in-memory choice still applies */
    }
  };

  const defaultNewTarget = folder.kind === "project" ? folder.id : null;

  return (
    <section className="notes-list">
      <div className="note-list-head">
        {/* mobile: back to folders */}
        <button
          type="button"
          className="note-icon-btn note-back"
          onClick={onBack}
          aria-label="Back to folders"
        >
          <i className="ti ti-chevron-left" aria-hidden="true" />
        </button>
        {/* desktop: re-open the folders pane when it's collapsed */}
        {orgCollapsed ? (
          <button
            type="button"
            className="note-icon-btn note-expand"
            onClick={onExpandOrg}
            aria-label="Show folders"
            title="Show folders"
          >
            <i
              className="ti ti-layout-sidebar-left-expand"
              aria-hidden="true"
            />
          </button>
        ) : null}
        <span className="note-list-title">{title}</span>
        <div className="t-toggle notes-toggle" role="group" aria-label="View">
          <button
            type="button"
            className={view === "cards" ? "on" : undefined}
            aria-pressed={view === "cards"}
            aria-label="Card view"
            title="Cards"
            onClick={() => chooseView("cards")}
          >
            <i className="ti ti-layout-grid" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={view === "list" ? "on" : undefined}
            aria-pressed={view === "list"}
            aria-label="List view"
            title="List"
            onClick={() => chooseView("list")}
          >
            <i className="ti ti-list" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          className="note-icon-btn"
          onClick={() => onNewNote(defaultNewTarget)}
          aria-label="New note"
          title="New note"
        >
          <i className="ti ti-pencil-plus" aria-hidden="true" />
        </button>
      </div>

      {view === "cards" ? (
        <NoteGallery
          notes={notes}
          folder={folder}
          folderGroups={folderGroups}
          selectedId={selectedId}
          moveTargets={moveTargets}
          onSelect={onSelect}
          onNewNote={onNewNote}
          onTogglePin={onTogglePin}
          onArchive={onArchive}
          onUnarchive={onUnarchive}
          onMove={onMove}
        />
      ) : notes.length === 0 ? (
        <div className="note-list-empty">
          <i className="ti ti-note" aria-hidden="true" />
          <span>No notes here yet</span>
        </div>
      ) : (
        <ul className="note-rows">
          {notes.map((n) => {
            const { title: rt, preview } = rowText(n);
            return (
              <li key={n.id}>
                <button
                  type="button"
                  className={"note-row" + (n.id === selectedId ? " on" : "")}
                  onClick={() => onSelect(n.id)}
                >
                  <span className="note-row-title">
                    {n.pinned ? (
                      <i
                        className="ti ti-pin note-row-pin"
                        aria-hidden="true"
                      />
                    ) : null}
                    {rt}
                  </span>
                  <span className="note-row-sub">
                    <span className="note-row-date" suppressHydrationWarning>
                      {editedLabel(n.updated_at)}
                    </span>
                    <span className="note-row-preview">
                      {preview || "No additional text"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
