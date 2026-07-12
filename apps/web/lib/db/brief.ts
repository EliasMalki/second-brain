import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import * as shared from "@second-brain/shared/db/brief";
import type { BriefPayload, BriefRow } from "@second-brain/shared/db/brief";

/**
 * Thin Next adapter over the shared brief module: resolve the request's
 * client/org/user here, keep brief logic in @second-brain/shared/db/brief.
 */

export type { BriefPayload, BriefRow } from "@second-brain/shared/db/brief";

export async function listRecentBriefs(limit = 30): Promise<BriefRow[]> {
  const user = await requireUser();
  return shared.listRecentBriefs(createClient(), await getCurrentOrgId(), user.id, limit);
}

export async function generatePayload(): Promise<{
  payload: BriefPayload;
  taskIds: string[];
}> {
  return shared.generatePayload(createClient(), await getCurrentOrgId());
}

export async function getFirstOpenBrief(): Promise<BriefPayload | null> {
  const user = await requireUser();
  return shared.getFirstOpenBrief(createClient(), await getCurrentOrgId(), user.id);
}
