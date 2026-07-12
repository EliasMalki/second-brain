"use client";

/**
 * Offline capture queue (BUILD_SPEC §6). No sync engine, no CRDTs — captures
 * land in IndexedDB FIRST, then POST to /api/capture; queued rows are
 * retried on reconnect. The thought is durable on-device the instant the
 * user hits Capture, even with zero connectivity.
 */

const DB_NAME = "second-brain";
const STORE = "capture-queue";

export type QueuedCapture = {
  id: string;
  text: string;
  queuedAt: string;
};

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

/** Durably queue a capture on-device. Step 1 of every capture. */
export async function enqueueCapture(text: string): Promise<QueuedCapture> {
  const item: QueuedCapture = {
    id: crypto.randomUUID(),
    text,
    queuedAt: new Date().toISOString(),
  };
  await tx("readwrite", (s) => s.add(item));
  return item;
}

export async function listQueued(): Promise<QueuedCapture[]> {
  return tx("readonly", (s) => s.getAll() as IDBRequest<QueuedCapture[]>);
}

async function removeQueued(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}

async function postCapture(text: string): Promise<boolean> {
  try {
    const res = await fetch("/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return res.ok;
  } catch {
    return false; // offline or server unreachable — stays queued
  }
}

/**
 * Try to deliver everything in the queue, oldest first. Stops at the first
 * failure (no point hammering a dead connection). Returns how many remain.
 */
export async function flushQueue(): Promise<number> {
  const queued = (await listQueued()).sort((a, b) =>
    a.queuedAt < b.queuedAt ? -1 : 1,
  );
  for (const item of queued) {
    const ok = await postCapture(item.text);
    if (!ok) break;
    await removeQueued(item.id);
  }
  return (await listQueued()).length;
}
