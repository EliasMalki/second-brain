import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

/**
 * Server Supabase client (anon key, cookie-backed session). Used from Server
 * Components, Route Handlers, and Server Actions.
 *
 * Because it uses the anon key and the request's session cookies, every query
 * runs under the caller's identity and is enforced by Row-Level Security. This
 * is the default path for tenant data access.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options: CookieOptions;
        }[],
      ) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // `setAll` was called from a Server Component, where mutating cookies
          // is not allowed. Safe to ignore when session refresh is handled by
          // middleware (to be added in the auth step).
        }
      },
    },
  });
}
