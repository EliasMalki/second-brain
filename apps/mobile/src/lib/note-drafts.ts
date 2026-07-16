import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DraftStore, NoteDraft } from "@second-brain/editor/save";

/**
 * Mobile DraftStore: AsyncStorage-backed durable note drafts. The autosave
 * controller writes the buffer through on every edit and clears it after a
 * confirmed save, so a killed app / crash never loses input. Same
 * interface-here-storage-per-app split the web localStorage impl uses.
 */

const key = (noteId: string) => `note-draft:${noteId}`;

export const noteDrafts: DraftStore = {
  async get(noteId) {
    try {
      const raw = await AsyncStorage.getItem(key(noteId));
      if (!raw) return null;
      const draft = JSON.parse(raw) as NoteDraft;
      if (typeof draft?.body !== "string" || typeof draft?.savedAt !== "string")
        return null;
      return {
        title: draft.title ?? null,
        body: draft.body,
        savedAt: draft.savedAt,
      };
    } catch {
      return null;
    }
  },
  async set(noteId, draft) {
    try {
      await AsyncStorage.setItem(key(noteId), JSON.stringify(draft));
    } catch {
      // storage full/blocked — autosave still holds the buffer in memory
    }
  },
  async clear(noteId) {
    try {
      await AsyncStorage.removeItem(key(noteId));
    } catch {
      // ignore
    }
  },
};
