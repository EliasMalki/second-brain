import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import * as shared from "@second-brain/shared/db/activity";

/**
 * Thin Next adapter over the shared activity module: resolve the request's
 * client/org here, keep all query logic in @second-brain/shared/db/activity.
 */

export type {
  ActivityActor,
  ActivityAction,
  ActivityEntityType,
  ActivityRow,
  LogActivityInput,
} from "@second-brain/shared/db/activity";

/** Best-effort append — never throws (see shared module). */
export async function logActivity(input: shared.LogActivityInput): Promise<void> {
  return shared.logActivity(createClient(), input);
}

export async function listRecentActivity(opts?: {
  limit?: number;
  actorGroup?: "all" | "ai" | "manual";
}): Promise<shared.ActivityRow[]> {
  await requireUser();
  return shared.listRecentActivity(createClient(), await getCurrentOrgId(), opts);
}
