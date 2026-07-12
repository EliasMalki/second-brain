import type { InboxItem } from "@/lib/db/inbox";
import { VOICE_FAILED_TAG } from "@second-brain/shared/domain/tags";

/**
 * Batch-filing policy, shared by the server action (which recomputes it from a
 * fresh listInbox — the client is never trusted with ids) and the client (which
 * only uses it to decide whether to SHOW "File all to suggested" and which
 * cards to clear optimistically). Pure — safe in both bundles.
 *
 * The classifier auto-files at confidence >= 0.6, so everything still in the
 * Inbox sits below that. The 0.4–0.6 band is "fairly sure but conservative" —
 * good enough for a deliberate batch tap. Below 0.4 the guess is a coin toss;
 * those keep their one-tap button but are never batch-filed.
 */
export const BATCH_FILE_MIN_CONFIDENCE = 0.4;

export type BatchFileTarget = {
  kind: "note" | "task";
  id: string;
  projectId: string;
};

export function batchFileTarget(item: InboxItem): BatchFileTarget | null {
  if (item.kind === "prompt") return null;
  if (item.kind === "note" && item.note.tags?.includes(VOICE_FAILED_TAG)) {
    return null; // a failed-transcription placeholder has no real text to file
  }
  if (!item.suggestedProjectId) return null;
  if ((item.suggestedConfidence ?? 0) < BATCH_FILE_MIN_CONFIDENCE) return null;
  return item.kind === "note"
    ? { kind: "note", id: item.note.id, projectId: item.suggestedProjectId }
    : { kind: "task", id: item.task.id, projectId: item.suggestedProjectId };
}
