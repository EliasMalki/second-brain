"use client";

import {
  createCaptureQueue,
  type CaptureQueueStorage,
  type QueuedCapture,
} from "@second-brain/shared/offline/queue";
import { postCapture } from "@second-brain/shared/capture/api";

/**
 * Web implementation of the offline capture queue (BUILD_SPEC §6): the
 * platform half is just durable storage — IndexedDB — behind the shared
 * `CaptureQueueStorage` interface. The queue logic (oldest-first flush, stop
 * at first failure, retry = re-flush) lives in @second-brain/shared/offline/
 * queue and is NOT duplicated here; mobile will reuse it with native storage.
 */

const DB_NAME = "second-brain";
const STORE = "capture-queue";

export type { QueuedCapture };

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

const indexedDbStorage: CaptureQueueStorage = {
  async add(item: QueuedCapture): Promise<void> {
    await tx("readwrite", (s) => s.add(item));
  },
  async getAll(): Promise<QueuedCapture[]> {
    return tx("readonly", (s) => s.getAll() as IDBRequest<QueuedCapture[]>);
  },
  async remove(id: string): Promise<void> {
    await tx("readwrite", (s) => s.delete(id));
  },
};

const queue = createCaptureQueue(indexedDbStorage, (text) => postCapture(text));

/** Durably queue a capture on-device. Step 1 of every capture. */
export async function enqueueCapture(text: string): Promise<QueuedCapture> {
  return queue.enqueue(text);
}

export async function listQueued(): Promise<QueuedCapture[]> {
  return queue.list();
}

/**
 * Try to deliver everything in the queue, oldest first. Stops at the first
 * failure (no point hammering a dead connection). Returns how many remain.
 */
export async function flushQueue(): Promise<number> {
  return queue.flush();
}
