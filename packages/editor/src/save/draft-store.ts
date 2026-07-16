/**
 * Durable draft storage — the "never lose input" half of the save contract.
 * The package defines the interface; each app implements the storage (web:
 * localStorage, mobile: AsyncStorage) — the same split as shared's
 * CaptureQueueStorage. The autosave controller writes the draft through on
 * every edit and clears it after a confirmed save, so a killed tab, a crash,
 * or an offline close never loses the buffer.
 *
 * Restore flow (host-side, on note open): if `get(noteId)` returns a draft
 * whose savedAt is newer than the note's updated_at and whose content
 * differs, seed the editor with the draft and mark it dirty — autosave then
 * pushes it. Conflict stance is last-write-wins by design (single-user).
 */

export type NoteDraft = {
  title: string | null;
  body: string;
  /** ISO timestamp of when the draft was captured. */
  savedAt: string;
};

export interface DraftStore {
  get(noteId: string): Promise<NoteDraft | null>;
  set(noteId: string, draft: NoteDraft): Promise<void>;
  clear(noteId: string): Promise<void>;
}
