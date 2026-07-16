import {
  deriveNotePreview,
  stripMarkdownToText,
  type PreviewLine,
} from "@second-brain/shared/domain/markdown";
import type { Note } from "@second-brain/shared/db/notes";

/**
 * Shared note display helpers — the same derivation web uses, so titles and
 * card previews read identically across platforms. `body_text` is the search/
 * preview shadow (kept in sync by updateNote); fall back to stripping `body`
 * for any row written before it existed.
 */

export function noteSource(note: Note): string {
  return note.body_text ?? stripMarkdownToText(note.body);
}

/** Explicit title, else the first real content line, else "New note". */
export function noteTitle(note: Note): string {
  const explicit = note.title?.trim();
  if (explicit) return explicit;
  return deriveNotePreview(null, noteSource(note), 1)[0]?.text || "New note";
}

/** The card preview lines (title deduped, list items as their own lines). */
export function notePreview(note: Note, maxLines: number): PreviewLine[] {
  return deriveNotePreview(noteTitle(note), noteSource(note), maxLines);
}
