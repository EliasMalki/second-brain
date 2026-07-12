import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";
import type { Database } from "@second-brain/shared/types/database";

/**
 * Service-role Supabase client — BYPASSES Row-Level Security.
 *
 * Danger zone. This is for trusted server-side jobs only (the nightly cron,
 * onboarding, backups) where there is no end-user session to scope by. Any code
 * using this MUST scope every query to a specific `org_id` by hand, because RLS
 * will NOT do it for you here.
 *
 * The `server-only` import guarantees a build error if this module is ever
 * pulled into client code, keeping the service-role key out of the browser
 * bundle.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    publicEnv.supabaseUrl,
    serverEnv.supabaseServiceRoleKey(),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
