import { env } from "./env";
import { supabase } from "./supabase";

/** The web app origin capture POSTs go to (text/voice/receipt run server-side). */
export const apiBaseUrl = env.apiUrl;

/**
 * Fresh access token for the current session, or null when signed out. Read at
 * call time (never cached) — the session auto-refreshes and the token is
 * short-lived.
 */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * fetch to a web API path with the current Supabase access token attached as a
 * Bearer header (the routes authenticate cookie-or-bearer via resolveApiAuth).
 * The one place the voice/receipt multipart POSTs go through. Text capture uses
 * the shared sendCapture/postCapture (they take the token directly).
 */
export async function authedFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${apiBaseUrl}${path}`, { ...init, headers });
}
