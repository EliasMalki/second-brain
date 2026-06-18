import { headers } from "next/headers";

/**
 * Resolve the public origin (scheme + host, no trailing slash) for building
 * absolute URLs that leave the server — chiefly the magic-link `emailRedirectTo`.
 *
 * Why not just `headers().get("origin")`: on a server-action POST behind
 * Vercel's proxy the `Origin` header is often absent, which made
 * `emailRedirectTo` collapse to a relative `/auth/confirm`. Supabase then
 * silently ignores it and falls back to the dashboard Site URL — the source of
 * the localhost redirect after deploy.
 *
 * Resolution order (first hit wins):
 *  1. NEXT_PUBLIC_SITE_URL — the canonical, stable production URL. Set this in
 *     Vercel so every magic link points at one allowlisted domain regardless of
 *     which deployment URL the request came in on.
 *  2. x-forwarded-host (+ x-forwarded-proto) — set by Vercel's proxy; correct
 *     when the env var isn't (e.g. preview deploys).
 *  3. Origin header — present on same-origin POSTs in local dev.
 *  4. http://localhost:3000 — final dev default.
 *
 * The domain is never hardcoded here; production comes from an env var.
 */
export function resolveOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const h = headers();

  const forwardedHost = h.get("x-forwarded-host");
  if (forwardedHost) {
    const proto = h.get("x-forwarded-proto") ?? "https";
    return `${proto}://${forwardedHost}`;
  }

  const origin = h.get("origin");
  if (origin) return origin.replace(/\/+$/, "");

  return "http://localhost:3000";
}
