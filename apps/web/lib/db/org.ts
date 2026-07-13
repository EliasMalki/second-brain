import { cache } from "react";
import { getOrgIdForUser } from "@second-brain/shared/db/memberships";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Tenancy root of the query layer.
 *
 * Every data-access function starts here: resolve the caller's org, then
 * filter every query by it. RLS enforces the same boundary at the DB, so the
 * explicit org_id filter is belt + suspenders — but the belt is mandatory
 * (CLAUDE.md invariant), never rely on RLS alone.
 *
 * This is the thin request-context adapter: it resolves the cookie client +
 * user, then delegates the actual query to @second-brain/shared/db/memberships
 * (which mobile also consumes). React `cache()` memoizes per request.
 *
 * v0.5: each user has exactly one membership (their personal org).
 */
export const getCurrentOrgId = cache(async (): Promise<string> => {
  const user = await requireUser();
  const supabase = createClient();
  return getOrgIdForUser(supabase, user.id);
});
