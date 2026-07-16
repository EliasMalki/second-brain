import type { DraftStore } from "./draft-store";

/**
 * The save contract: debounced autosave (~1s after the last edit), flush on
 * blur/navigate/hide, retry with backoff on failure, offline-aware, drafts
 * written through so input is never lost. Platform-agnostic on purpose
 * (timers only — no DOM): web wires it to a server action, mobile to the
 * shared updateNote query.
 *
 * Conflict stance: LAST WRITE WINS, full-document replace. Single-user app —
 * no versioning, no merge; a save from another device simply overwrites.
 */

export type SaveState = "saved" | "dirty" | "saving" | "error" | "offline";

export type NoteDoc = { title: string | null; body: string };

export interface AutosaveController {
  /** Call on every edit. Debounces the save and writes the draft through. */
  noteEdited(doc: NoteDoc): void;
  /** Save now (editor blur, note switch, visibility hidden, Mod-S). */
  flush(): Promise<void>;
  /** Feed connectivity (web: navigator.onLine + online/offline events). */
  setOnline(online: boolean): void;
  dispose(): void;
}

const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000];

function docsEqual(a: NoteDoc, b: NoteDoc): boolean {
  return a.title === b.title && a.body === b.body;
}

export function createAutosaveController(opts: {
  /** Persist the doc; throw on failure. */
  save: (doc: NoteDoc) => Promise<void>;
  /** What's currently persisted, so unchanged docs don't save. */
  initial: NoteDoc;
  drafts?: DraftStore;
  noteId?: string;
  debounceMs?: number;
  onState?: (state: SaveState) => void;
}): AutosaveController {
  const debounceMs = opts.debounceMs ?? 1000;

  let lastSaved: NoteDoc = opts.initial;
  let pending: NoteDoc | null = null;
  let online = true;
  let disposed = false;
  let state: SaveState = "saved";
  let retryIndex = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | null = null;

  const setState = (next: SaveState) => {
    if (state !== next && !disposed) {
      state = next;
      opts.onState?.(next);
    }
  };

  const writeDraft = (doc: NoteDoc) => {
    if (!opts.drafts || !opts.noteId) return;
    void opts.drafts
      .set(opts.noteId, { ...doc, savedAt: new Date().toISOString() })
      .catch(() => {});
  };
  const clearDraft = () => {
    if (!opts.drafts || !opts.noteId) return;
    void opts.drafts.clear(opts.noteId).catch(() => {});
  };

  /** Drain `pending`. Single-flight: concurrent callers share the promise. */
  const run = (): Promise<void> => {
    if (running) return running;
    running = (async () => {
      while (pending && online && !disposed) {
        const snapshot = pending;
        setState("saving");
        try {
          await opts.save(snapshot);
          lastSaved = snapshot;
          retryIndex = 0;
          if (pending === snapshot) {
            pending = null;
            setState("saved");
            clearDraft();
          }
        } catch {
          if (disposed) break;
          setState("error");
          const delay =
            RETRY_DELAYS_MS[Math.min(retryIndex, RETRY_DELAYS_MS.length - 1)];
          retryIndex += 1;
          clearTimeout(retryTimer);
          retryTimer = setTimeout(() => void run(), delay);
          break;
        }
      }
      running = null;
    })();
    return running;
  };

  return {
    noteEdited(doc) {
      if (disposed) return;
      clearTimeout(debounceTimer);
      if (docsEqual(doc, lastSaved)) {
        pending = null;
        clearDraft();
        if (state === "dirty" || state === "offline") setState("saved");
        return;
      }
      pending = doc;
      writeDraft(doc);
      setState(online ? "dirty" : "offline");
      if (online) debounceTimer = setTimeout(() => void run(), debounceMs);
    },
    async flush() {
      clearTimeout(debounceTimer);
      clearTimeout(retryTimer);
      const current = run();
      await current;
      // A save that was already in flight may have left newer edits behind.
      if (pending && online && !disposed) await run();
    },
    setOnline(next) {
      if (disposed || online === next) return;
      online = next;
      if (next) {
        if (pending) {
          setState("dirty");
          void run();
        }
      } else if (pending) {
        setState("offline");
      }
    },
    dispose() {
      disposed = true;
      clearTimeout(debounceTimer);
      clearTimeout(retryTimer);
    },
  };
}
