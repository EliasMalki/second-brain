import type { Db } from "../supabase";
import type { Database, Json } from "../types/database";

/**
 * Activity log — the append-only "who did what" feed (AI vs manual).
 *
 * Two halves:
 *  - logActivity(): a BEST-EFFORT writer. It NEVER throws — a failed log must
 *    not block or fail the real mutation (CLAUDE.md: "capture never blocks /
 *    never loses data"). Call it AFTER the mutation has succeeded.
 *  - listRecentActivity(): the org-scoped reader for /settings/activity.
 *
 * The DB columns actor/action/entity_type are free text (see the migration);
 * these unions are the source of truth for the vocabulary on the app side.
 */

export type ActivityActor =
  | "user" // manual, in-app
  | "command" // natural-language command interpreter
  | "classifier" // async capture classifier
  | "nightly" // the nightly cron job
  | "recurrence"; // a recurrence spawning its next instance

export type ActivityAction =
  | "task_created"
  | "task_completed"
  | "task_reopened"
  | "task_cancelled"
  | "task_deleted"
  | "task_snoozed"
  | "task_unsnoozed"
  | "task_rescheduled"
  | "task_reprioritized"
  | "task_refiled"
  | "task_rolled_over"
  | "task_resurfaced"
  | "recurrence_spawned"
  | "note_filed";

export type ActivityEntityType = "task" | "note";

export type ActivityRow = Database["public"]["Tables"]["activity_log"]["Row"];

export type LogActivityInput = {
  /** Resolved by the caller (already has it from getCurrentOrgId + the row). */
  orgId: string;
  ownerId: string | null;
  actor?: ActivityActor; // default 'user' — the dominant manual path
  action: ActivityAction;
  entityType?: ActivityEntityType; // default 'task'
  entityId: string | null;
  summary?: string | null;
  detail?: Record<string, unknown>;
};

/**
 * Append one activity row. Best-effort: the whole body is wrapped so a broken
 * log can never surface to the caller. Takes orgId/ownerId as params (the caller
 * already resolved orgId and holds the mutated row's owner_id) to avoid an extra
 * round-trip on a path that must not add failure surface. Because orgId comes
 * from the caller's own membership, the RLS WITH CHECK passes under their session.
 */
export async function logActivity(db: Db, input: LogActivityInput): Promise<void> {
  try {
    const { error } = await db.from("activity_log").insert({
      org_id: input.orgId,
      owner_id: input.ownerId,
      actor: input.actor ?? "user",
      action: input.action,
      entity_type: input.entityType ?? "task",
      entity_id: input.entityId,
      summary: input.summary ?? null,
      detail: (input.detail ?? {}) as Json,
    });
    if (error) console.error("logActivity:", error.message);
  } catch (e) {
    // best-effort: swallow so the real mutation is never affected.
    console.error("logActivity threw (swallowed):", e);
  }
}

/** AI actors = everything that isn't a manual in-app 'user' action. */
const AI_ACTORS: ActivityActor[] = ["command", "classifier", "nightly", "recurrence"];

/**
 * Recent activity for /settings/activity, newest first. Org-scoped ONLY (not
 * owner-scoped, unlike listRecentBriefs): classifier-authored rows can carry a
 * null owner_id, and an owner filter would hide them. Org scope already isolates
 * within a personal org. The AI/Manual split is applied server-side so a full
 * window of one group isn't crowded out by the other.
 */
export async function listRecentActivity(
  db: Db,
  orgId: string,
  opts?: {
    limit?: number;
    actorGroup?: "all" | "ai" | "manual";
  },
): Promise<ActivityRow[]> {
  let query = db
    .from("activity_log")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 60);

  if (opts?.actorGroup === "manual") query = query.eq("actor", "user");
  else if (opts?.actorGroup === "ai") query = query.in("actor", AI_ACTORS);

  const { data, error } = await query;
  if (error) throw new Error(`listRecentActivity: ${error.message}`);
  return data;
}
