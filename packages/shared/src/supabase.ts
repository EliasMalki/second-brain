import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types/database";

/**
 * The typed Supabase handle every shared query function operates on. Each app
 * constructs it its own way (web: @supabase/ssr cookie clients; mobile: a
 * client from `createSupabaseClient` below) and passes it in — shared code
 * never resolves a client, a session, or an org itself.
 */
export type Db = SupabaseClient<Database>;

/**
 * Platform-agnostic client factory: plain supabase-js, no cookie/session
 * wiring. The web app does NOT use this (its clients need Next-specific
 * cookie handling); it exists so mobile can construct the same typed client
 * with its own storage/auth options.
 */
export function createSupabaseClient(
  url: string,
  anonKey: string,
  options?: Parameters<typeof createClient<Database>>[2]
): Db {
  return createClient<Database>(url, anonKey, options);
}
