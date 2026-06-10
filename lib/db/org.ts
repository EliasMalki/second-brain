import { cache } from "react";
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
 * v0.5: each user has exactly one membership (their personal org).
 */
export const getCurrentOrgId = cache(async (): Promise<string> => {
  const user = await requireUser();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve org: ${error.message}`);
  }
  if (!data) {
    // Should be impossible: the signup trigger creates the membership.
    throw new Error(`No org membership for user ${user.id}`);
  }
  return data.org_id;
});
