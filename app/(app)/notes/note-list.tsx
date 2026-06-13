"use client";

import type { Note } from "@/lib/db/notes";

/** Strip markdown markers from a single line for the preview row. */
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
 * Pane 2 — the note list for the selected folder. Rows show title + a 1–2 line
 * markdown-stripped preview + last-edited date. Pinned notes float to the top
 * (the parent already sorts them) with a pin icon. A "+ New note" affordance in
 * the header creates a note in the current folder.
 */
export function NoteList({
  notes,
  selectedId,
  title,
  orgCollapsed,
  onSelect,
  onNewNote,
  onToggleOrg,
}: {
  notes: Note[];
  selectedId: string | null;
  title: string;
  orgCollapsed: boolean;
  onSelect: (id: string) => void;
  onNewNote: () => void;
  onToggleOrg: () => void;
}) {
  return (
    <section className="notes-list">
      <div className="note-list-head">
        <button
          type="button"
          className="note-icon-btn"
          onClick={onToggleOrg}
          aria-label={orgCollapsed ? "Show folders" : "Hide folders"}
          title={orgCollapsed ? "Show folders" : "Hide folders"}
        >
          <i
            className={
              "ti " +
              (orgCollapsed
                ? "ti-layout-sidebar-left-expand"
                : "ti-layout-sidebar-left-collapse")
            }
            aria-hidden="true"
          />
        </button>
        <span className="note-list-title">{title}</span>
        <button
          type="button"
          className="note-icon-btn"
          onClick={onNewNote}
          aria-label="New note"
          title="New note"
        >
          <i className="ti ti-pencil-plus" aria-hidden="true" />
        </button>
      </div>

      {notes.length === 0 ? (
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
