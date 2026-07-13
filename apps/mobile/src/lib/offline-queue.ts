import * as SQLite from "expo-sqlite";
import {
  createCaptureQueue,
  type CaptureQueueStorage,
  type OfflineCaptureQueue,
  type QueuedCapture,
} from "@second-brain/shared/offline/queue";
import { postCapture } from "@second-brain/shared/capture/api";
import { apiBaseUrl, getAccessToken } from "./api";

/**
 * Native implementation of the shared CaptureQueueStorage contract over
 * expo-sqlite (web uses IndexedDB). A capture lands here durably the instant the
 * user hits Send with no connectivity; the shared queue driver posts it on
 * reconnect. Only the storage is per-platform — the queue logic lives in shared.
 */
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
function db(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const d = await SQLite.openDatabaseAsync("second-brain.db");
      await d.execAsync(
        "CREATE TABLE IF NOT EXISTS capture_queue (id TEXT PRIMARY KEY NOT NULL, text TEXT NOT NULL, queuedAt TEXT NOT NULL);",
      );
      return d;
    })();
  }
  return dbPromise;
}

const sqliteStorage: CaptureQueueStorage = {
  async add(item) {
    const d = await db();
    await d.runAsync(
      "INSERT OR REPLACE INTO capture_queue (id, text, queuedAt) VALUES (?, ?, ?);",
      item.id,
      item.text,
      item.queuedAt,
    );
  },
  async getAll() {
    const d = await db();
    return d.getAllAsync<QueuedCapture>(
      "SELECT id, text, queuedAt FROM capture_queue;",
    );
  },
  async remove(id) {
    const d = await db();
    await d.runAsync("DELETE FROM capture_queue WHERE id = ?;", id);
  },
};

/**
 * The app's offline capture queue. The poster delivers each queued capture with
 * a freshly-read access token to the bearer-authenticated /api/capture.
 */
export const captureQueue: OfflineCaptureQueue = createCaptureQueue(
  sqliteStorage,
  async (text) =>
    postCapture(text, {
      baseUrl: apiBaseUrl,
      accessToken: (await getAccessToken()) ?? undefined,
    }),
);
