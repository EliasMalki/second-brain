import type { Db } from "../supabase";

/**
 * Org resolution — the tenancy root of the query layer.
 *
 * Every data-access function is scoped by an org_id; this resolves it from the
 * authenticated user. Kept here (DI form, `(db, userId)`) rather than in an app
 * so web and mobile share one implementation — a copy in an app is a bug.
 *
 * RLS lets a user self-select their own memberships, so the caller's anon
 * client is sufficient (web proves this with its cookie client).
 *
 * v0.5: each user has exactly one membership (their personal org), so we take
 * the first row. Multi-org is a v2 concern.
 */
export async function getOrgIdForUser(
  db: Db,
  userId: string,
): Promise<string> {
  const { data, error } = await db
    .from("memberships")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve org: ${error.message}`);
  }
  if (!data) {
    // Should be impossible: the signup trigger creates the membership.
    throw new Error(`No org membership for user ${userId}`);
  }
  return data.org_id;
}
