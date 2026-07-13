import { createSupabaseClient, type Db } from "@second-brain/shared";
import { getOrgIdForUser } from "@second-brain/shared/db/memberships";
import { requireUser, getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import { publicEnv } from "@/lib/env";

/**
 * Resolved request identity for the capture/receipt API routes: the Supabase
 * client to run writes through, plus the caller's user + org. Both auth paths
 * produce the same shape so the write pipeline (lib/db/captures, lib/db/receipts)
 * is identical whether the caller is the web app (cookies) or the mobile app
 * (a Supabase JWT).
 */
export type ApiAuth = { supabase: Db; userId: string; orgId: string };

/**
 * Authenticate an API route by EITHER a Supabase bearer token (the mobile app)
 * OR the cookie session (the web app). Returns null when unauthenticated — the
 * route should 401. The four capture/receipt routes are carved out of the
 * middleware login-redirect (see lib/supabase/middleware.ts) so a bearer request
 * reaches the handler instead of being bounced to /login.
 */
export async function resolveApiAuth(request: Request): Promise<ApiAuth | null> {
  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Bearer ")) {
    const token = header.slice(7);
    // Token-scoped client: every query carries the user's JWT, so RLS runs as
    // that user (writes + Storage uploads scope to their org).
    const supabase = createSupabaseClient(
      publicEnv.supabaseUrl,
      publicEnv.supabaseAnonKey,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    const orgId = await getOrgIdForUser(supabase, user.id);
    return { supabase, userId: user.id, orgId };
  }

  // Cookie session (web).
  const user = await getUser();
  if (!user) return null;
  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  return { supabase, userId: user.id, orgId };
}

/**
 * Cookie-only context for the write functions' DEFAULT path (server actions,
 * the command interpreter) — same behavior they had before: resolve the cookie
 * client + user + org, redirecting to /login if there's no session. A route
 * that already resolved an ApiAuth (cookie or bearer) passes it instead, and
 * this is never reached.
 */
export async function cookieCtx(): Promise<ApiAuth> {
  const user = await requireUser();
  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  return { supabase, userId: user.id, orgId };
}
