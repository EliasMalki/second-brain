/**
 * Offline capture queue (BUILD_SPEC §6) — the platform-agnostic contract and
 * driver. No sync engine, no CRDTs: captures land in durable on-device storage
 * FIRST, then POST to the capture endpoint; queued rows are retried on
 * reconnect. The thought is durable the instant the user hits Capture, even
 * with zero connectivity.
 *
 * The QUEUE LOGIC lives here so no app rewrites it. Each app supplies only the
 * platform storage (web: IndexedDB; mobile later: native storage) behind
 * `CaptureQueueStorage`, plus the poster (usually shared/capture/api's
 * postCapture). Semantics of the contract:
 *  - enqueue: durably store first, before any network attempt
 *  - flush:   deliver oldest-first, STOP at the first failure (no point
 *             hammering a dead connection); remove each item only after a
 *             successful post; returns how many remain
 *  - retry:   there is no timer in here by design — re-invoking flush() IS the
 *             retry; the app decides when (on mount, on 'online', after enqueue)
 *  - status:  list() / flush()'s remaining count
 */

export type QueuedCapture = {
  id: string;
  text: string;
  queuedAt: string;
};

/** The platform-specific half: durable on-device storage for queued captures. */
export interface CaptureQueueStorage {
  add(item: QueuedCapture): Promise<void>;
  getAll(): Promise<QueuedCapture[]>;
  remove(id: string): Promise<void>;
}

/** Delivers one capture; false = offline/unreachable (item stays queued). */
export type PostCapture = (text: string) => Promise<boolean>;

/** The public queue contract each app exposes to its UI. */
export interface OfflineCaptureQueue {
  /** Durably queue a capture on-device. Step 1 of every capture. */
  enqueue(text: string): Promise<QueuedCapture>;
  list(): Promise<QueuedCapture[]>;
  /**
   * Try to deliver everything in the queue, oldest first. Stops at the first
   * failure. Returns how many remain.
   */
  flush(): Promise<number>;
}

export function createCaptureQueue(
  storage: CaptureQueueStorage,
  post: PostCapture,
): OfflineCaptureQueue {
  return {
    async enqueue(text: string): Promise<QueuedCapture> {
      const item: QueuedCapture = {
        id: crypto.randomUUID(),
        text,
        queuedAt: new Date().toISOString(),
      };
      await storage.add(item);
      return item;
    },

    async list(): Promise<QueuedCapture[]> {
      return storage.getAll();
    },

    async flush(): Promise<number> {
      const queued = (await storage.getAll()).sort((a, b) =>
        a.queuedAt < b.queuedAt ? -1 : 1,
      );
      for (const item of queued) {
        const ok = await post(item.text);
        if (!ok) break;
        await storage.remove(item.id);
      }
      return (await storage.getAll()).length;
    },
  };
}
