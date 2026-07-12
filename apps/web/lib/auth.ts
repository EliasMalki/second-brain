import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Auth helpers — the front door of the server-side access layer.
 *
 * Pages and route handlers should resolve the caller through these rather than
 * calling supabase.auth.getUser() ad hoc, so the auth check lives in one place.
 * Data queries still go through the org-scoped Supabase clients (RLS-enforced).
 */

/** The current authenticated user, or null. Verified against the auth server. */
export async function getUser(): Promise<User | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** The current user, or redirect to /login. Use to guard protected pages. */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
