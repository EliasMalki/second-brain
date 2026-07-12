"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import type { Database } from "@second-brain/shared/types/database";

/**
 * Browser Supabase client (anon key). Used from Client Components.
 *
 * This client carries the user's session via cookies, so every query it runs
 * is subject to Row-Level Security — it can only read/write the caller's own
 * org rows. Never use the service-role key here.
 */
export function createClient() {
  return createBrowserClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
  );
}
