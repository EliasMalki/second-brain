"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Note } from "@/lib/db/notes";
import {
  deriveNotePreview,
  stripMarkdownToText,
} from "@second-brain/shared/domain/markdown";
import { fmtAgo } from "@second-brain/shared/domain/dates";
import { projectColorVars } from "@/lib/colors";
import { useDismissable } from "../use-dismissable";
import type { Folder, FolderGroup } from "./workspace-types";
import type { MoveTarget } from "./move-menu";

/**
 * The card gallery — the default note-list view (reference: Apple Notes
 * gallery). Cards carry real content: title + up to 6 preview lines derived
 * from body_text (list items as their own lines, title deduped), a relative
 * timestamp, and a quiet ⋯ menu (pin / move / archive). Sections group
 * Pinned first, then Inbox, then projects in folder-pane order, each header
 * with the project's quiet color dot and a per-section "+". A dashed ghost
 * card leads the first section. Discipline over decoration: hairlines,
 * whitespace, primary surface on the recessed pane — no fills, no thumbnails.
 */

type Section = {
  key: string;
  label: string | null;
  icon: "pin" | "inbox" | null;
  color: string | null;
  /** Target for the section "+" (undefined = no "+" on this section). */
  newTarget: string | null | undefined;
  notes: Note[];
};

function buildSections(
  notes: Note[],
  folder: Folder,
  groups: FolderGroup[],
): Section[] {
  const pinned = notes.filter((n) => n.pinned);
  const rest = notes.filter((n) => !n.pinned);

  // Flat single-section folders: Pinned (all pinned) and Archived.
  if (folder.kind === "pinned" || folder.kind === "archived")
    return [
      {
        key: folder.kind,
        label: null,
        icon: null,
        color: null,
        newTarget: undefined,
        notes,
      },
    ];

  const sections: Section[] = [];
  if (pinned.length > 0)
    sections.push({
      key: "pinned",
      label: "Pinned",
      icon: "pin",
      color: null,
      newTarget: undefined,
      notes: pinned,
    });

  if (folder.kind === "inbox" || folder.kind === "project") {
    sections.push({
      key: "rest",
      label: pinned.length > 0 ? "Notes" : null,
      icon: null,
      color: null,
      newTarget: folder.kind === "project" ? folder.id : null,
      notes: rest,
    });
    return sections;
  }

  // "All Notes": Inbox first, then projects in folder-pane order.
  const inbox = rest.filter((n) => n.project_id === null);
  if (inbox.length > 0)
    sections.push({
      key: "inbox",
      label: "Inbox",
      icon: "inbox",
      color: null,
      newTarget: null,
      notes: inbox,
    });
  const byProject = new Map<string, Note[]>();
  for (const n of rest) {
    if (!n.project_id) continue;
    const list = byProject.get(n.project_id) ?? [];
    list.push(n);
    byProject.set(n.project_id, list);
  }
  for (const group of groups) {
    for (const p of group.projects) {
      const list = byProject.get(p.id);
      if (!list) continue;
      byProject.delete(p.id);
      sections.push({
        key: p.id,
        label: p.name,
        icon: null,
        color: p.color,
        newTarget: p.id,
        notes: list,
      });
    }
  }
  // Notes whose project isn't in the folder groups (e.g. archived project).
  const leftovers = [...byProject.values()].flat();
  if (leftovers.length > 0)
    sections.push({
      key: "other",
      label: "Other",
      icon: null,
      color: null,
      newTarget: undefined,
      notes: leftovers,
    });
  return sections;
}

/** Arrow-key spatial navigation across the card grid: from `cur`, pick the
 *  nearest focusable card/ghost in `dir` by geometry (handles the responsive,
 *  multi-section grid without hard-coding a column count). */
function pickInDirection(
  items: HTMLElement[],
  cur: HTMLElement,
  dir: "left" | "right" | "up" | "down",
): HTMLElement | null {
  const cr = cur.getBoundingClientRect();
  const cx = cr.left + cr.width / 2;
  const cy = cr.top + cr.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of items) {
    if (el === cur) continue;
    const r = el.getBoundingClientRect();
    const dx = r.left + r.width / 2 - cx;
    const dy = r.top + r.height / 2 - cy;
    let ok = false;
    let primary = 0;
    let cross = 0;
    if (dir === "right") ((ok = dx > 4), (primary = dx), (cross = Math.abs(dy)));
    else if (dir === "left")
      ((ok = dx < -4), (primary = -dx), (cross = Math.abs(dy)));
    else if (dir === "down")
      ((ok = dy > 4), (primary = dy), (cross = Math.abs(dx)));
    else ((ok = dy < -4), (primary = -dy), (cross = Math.abs(dx)));
    if (!ok) continue;
    const score = primary + cross * 2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

const ARROW_DIR: Record<string, "left" | "right" | "up" | "down"> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

/** A note's display title: explicit title, else its first content line. */
export function noteDisplayTitle(note: Note): string {
  const explicit = note.title?.trim();
  if (explicit) return explicit;
  const source = note.body_text ?? stripMarkdownToText(note.body);
  return deriveNotePreview(null, source, 1)[0]?.text || "New note";
}

function cardContent(note: Note) {
  const source = note.body_text ?? stripMarkdownToText(note.body);
  const title = noteDisplayTitle(note);
  return { title, lines: deriveNotePreview(title, source, 6) };
}

export function CardMenu({
  note,
  moveTargets,
  onTogglePin,
  onArchive,
  onUnarchive,
  onMove,
}: {
  note: Note;
  moveTargets: MoveTarget[];
  onTogglePin: (id: string, pinned: boolean) => void;
  onArchive: (id: string) => void;
  onUnarchive?: (id: string) => void;
  onMove: (id: string, projectId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const { closing, requestClose, cancelClose } = useDismissable(() =>
    setOpen(false),
  );
  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open)
      popRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  return (
    <div className="move-menu ncard-menu" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="ncard-menu-btn"
        onClick={() => {
          if (!open) setOpen(true);
          else if (closing) cancelClose();
          else requestClose();
        }}
        aria-label="Note actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <i className="ti ti-dots" aria-hidden="true" />
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
            <button
              type="button"
              role="menuitem"
              className="move-menu-item"
              onClick={() => {
                onTogglePin(note.id, !note.pinned);
                requestClose();
              }}
            >
              <i
                className={"ti " + (note.pinned ? "ti-pin-filled" : "ti-pin")}
                aria-hidden="true"
              />
              <span className="move-menu-name">
                {note.pinned ? "Unpin" : "Pin"}
              </span>
            </button>
            {note.archived && onUnarchive ? (
              <button
                type="button"
                role="menuitem"
                className="move-menu-item"
                onClick={() => {
                  onUnarchive(note.id);
                  requestClose();
                }}
              >
                <i className="ti ti-archive-off" aria-hidden="true" />
                <span className="move-menu-name">Unarchive</span>
              </button>
            ) : (
              <button
                type="button"
                role="menuitem"
                className="move-menu-item"
                onClick={() => {
                  onArchive(note.id);
                  requestClose();
                }}
              >
                <i className="ti ti-archive" aria-hidden="true" />
                <span className="move-menu-name">Archive</span>
              </button>
            )}
            <p className="move-menu-label">Move to</p>
            {moveTargets.map((t) => {
              const active = (t.id ?? null) === note.project_id;
              return (
                <button
                  key={t.id ?? "__inbox"}
                  type="button"
                  role="menuitem"
                  className={"move-menu-item" + (active ? " on" : "")}
                  onClick={() => {
                    if (!active) onMove(note.id, t.id);
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

const KIND_ICON: Partial<Record<Note["kind"], { icon: string; label: string }>> =
  {
    workflow: { icon: "ti-route", label: "Workflow note" },
    reference: { icon: "ti-book-2", label: "Reference note" },
  };

export function NoteCard({
  note,
  selected,
  active = false,
  onOpen,
  menu,
  previewOverride,
}: {
  note: Note;
  selected: boolean;
  /** Keyboard-highlighted (search results navigation). */
  active?: boolean;
  onOpen: () => void;
  menu: React.ReactNode;
  /** Replaces the derived preview lines (search snippet). */
  previewOverride?: React.ReactNode;
}) {
  const { title, lines } = useMemo(() => cardContent(note), [note]);
  const kind = KIND_ICON[note.kind];

  // The card is a plain list item; a full-bleed transparent button is the
  // open-target (so its accessible name is concise and the ⋯ menu is a sibling,
  // not an invalid interactive descendant of a button). Visible content is
  // aria-hidden — the button's label carries the name.
  const label =
    "Note: " +
    (title || "Untitled") +
    (note.pinned ? ", pinned" : "") +
    (lines.length ? `, ${lines.length} lines` : "");

  return (
    <div
      role="listitem"
      className={
        "ncard" + (selected ? " on" : "") + (active ? " is-active" : "")
      }
    >
      <button
        type="button"
        className="ncard-hit"
        aria-label={label}
        aria-current={selected ? "true" : undefined}
        onClick={onOpen}
      />
      <span className="ncard-title" aria-hidden="true">
        {note.pinned ? (
          <i className="ti ti-pin ncard-glyph" aria-hidden="true" />
        ) : null}
        <span className="ncard-title-text">{title}</span>
        {kind ? (
          <i
            className={`ti ${kind.icon} ncard-glyph ncard-kind`}
            title={kind.label}
          />
        ) : null}
      </span>
      <span className="ncard-body" aria-hidden="true">
        {previewOverride ? (
          previewOverride
        ) : lines.length === 0 ? (
          <span className="ncard-line is-empty">No additional text</span>
        ) : (
          lines.map((line, i) => (
            <span key={i} className={`ncard-line is-${line.kind}`}>
              {line.kind === "bullet" ? (
                <span className="ncard-bullet">– </span>
              ) : line.kind === "task-open" ? (
                <i className="ti ti-square ncard-task" />
              ) : line.kind === "task-done" ? (
                <i className="ti ti-square-check ncard-task" />
              ) : null}
              {line.text}
            </span>
          ))
        )}
      </span>
      <span className="ncard-foot">
        <span className="ncard-date" aria-hidden="true" suppressHydrationWarning>
          {fmtAgo(note.updated_at)}
        </span>
        {menu}
      </span>
    </div>
  );
}

export function NoteGallery({
  notes,
  folder,
  folderGroups,
  selectedId,
  moveTargets,
  onSelect,
  onNewNote,
  onTogglePin,
  onArchive,
  onUnarchive,
  onMove,
}: {
  notes: Note[];
  folder: Folder;
  folderGroups: FolderGroup[];
  selectedId: string | null;
  moveTargets: MoveTarget[];
  onSelect: (id: string) => void;
  /** Create a note filed to `projectId` (null = Inbox/unfiled). */
  onNewNote: (projectId: string | null) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onArchive: (id: string) => void;
  onUnarchive?: (id: string) => void;
  onMove: (id: string, projectId: string | null) => void;
}) {
  const sections = useMemo(
    () => buildSections(notes, folder, folderGroups),
    [notes, folder, folderGroups],
  );
  const ghostTarget = folder.kind === "project" ? folder.id : null;
  // No "new note" affordances in the Archived filter view.
  const showGhost = folder.kind !== "archived";

  const galleryRef = useRef<HTMLDivElement>(null);
  function onGalleryKeyDown(e: React.KeyboardEvent) {
    const dir = ARROW_DIR[e.key];
    if (!dir) return;
    const cur = document.activeElement as HTMLElement | null;
    if (
      !cur ||
      !galleryRef.current?.contains(cur) ||
      !cur.matches(".ncard-hit, .ncard-ghost")
    )
      return;
    const items = Array.from(
      galleryRef.current.querySelectorAll<HTMLElement>(
        ".ncard-hit, .ncard-ghost",
      ),
    );
    const next = pickInDirection(items, cur, dir);
    if (next) {
      e.preventDefault();
      next.focus();
    }
  }

  if (folder.kind === "archived" && notes.length === 0)
    return (
      <div className="note-gallery">
        <div className="note-list-empty">
          <i className="ti ti-archive" aria-hidden="true" />
          <span>
            The archive is empty — archived notes rest here, out of the way.
          </span>
        </div>
      </div>
    );

  return (
    <div
      className="note-gallery"
      ref={galleryRef}
      onKeyDown={onGalleryKeyDown}
    >
      {sections.map((section, si) => (
        <section
          key={section.key}
          className="ngal-sec"
          aria-label={section.label ?? undefined}
        >
          {section.label ? (
            <header className="ngal-sec-h">
              {section.icon ? (
                <i className={`ti ti-${section.icon}`} aria-hidden="true" />
              ) : (
                <span
                  className="ngal-dot"
                  style={projectColorVars(section.color)}
                  aria-hidden="true"
                />
              )}
              <span className="ngal-sec-name" role="heading" aria-level={2}>
                {section.label}
              </span>
              <span className="ngal-count" aria-hidden="true">
                {section.notes.length}
              </span>
              {section.newTarget !== undefined ? (
                <button
                  type="button"
                  className="ngal-add"
                  onClick={() => onNewNote(section.newTarget as string | null)}
                  aria-label={`New note in ${section.label}`}
                  title={`New note in ${section.label}`}
                >
                  <i className="ti ti-plus" aria-hidden="true" />
                </button>
              ) : null}
            </header>
          ) : null}
          <div className="ngal-grid" role="list">
            {si === 0 && showGhost ? (
              <button
                type="button"
                className="ncard-ghost"
                onClick={() => onNewNote(ghostTarget)}
              >
                <i className="ti ti-plus" aria-hidden="true" />
                New note
              </button>
            ) : null}
            {section.notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                selected={note.id === selectedId}
                onOpen={() => onSelect(note.id)}
                menu={
                  <CardMenu
                    note={note}
                    moveTargets={moveTargets}
                    onTogglePin={onTogglePin}
                    onArchive={onArchive}
                    onUnarchive={onUnarchive}
                    onMove={onMove}
                  />
                }
              />
            ))}
          </div>
        </section>
      ))}
      {sections.length === 0 ? (
        <div className="ngal-sec">
          <div className="ngal-grid" role="list">
            <button
              type="button"
              className="ncard-ghost"
              onClick={() => onNewNote(ghostTarget)}
            >
              <i className="ti ti-plus" aria-hidden="true" />
              New note
            </button>
          </div>
          <p className="ngal-empty-hint">
            Nothing here yet — a first thought is enough.
          </p>
        </div>
      ) : null}
    </div>
  );
}
