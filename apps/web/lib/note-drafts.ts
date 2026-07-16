"use client";

import type { DraftStore, NoteDraft } from "@second-brain/editor/save";

/**
 * Web DraftStore: localStorage-backed durable note drafts. The autosave
 * controller writes the buffer through on every edit and clears it after a
 * confirmed save, so a killed tab / crash / offline close never loses input.
 * Same interface-here-storage-per-app split as the shared capture queue.
 */

const key = (noteId: string) => `note-draft:${noteId}`;

/** Sync read for seeding the editor before first paint (restore flow). */
export function readNoteDraftSync(noteId: string): NoteDraft | null {
  try {
    const raw = localStorage.getItem(key(noteId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const draft = parsed as NoteDraft;
    if (typeof draft?.body !== "string" || typeof draft?.savedAt !== "string")
      return null;
    return { title: draft.title ?? null, body: draft.body, savedAt: draft.savedAt };
  } catch {
    return null;
  }
}

export const noteDrafts: DraftStore = {
  async get(noteId) {
    return readNoteDraftSync(noteId);
  },
  async set(noteId, draft) {
    try {
      localStorage.setItem(key(noteId), JSON.stringify(draft));
    } catch {
      // storage full/blocked — autosave still holds the buffer in memory
    }
  },
  async clear(noteId) {
    try {
      localStorage.removeItem(key(noteId));
    } catch {
      // ignore
    }
  },
};
