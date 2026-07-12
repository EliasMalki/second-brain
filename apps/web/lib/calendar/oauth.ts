import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * OAuth CSRF/PKCE helpers + the one-time cookie names used by the connect →
 * Google → callback flow. Cookies are httpOnly+Secure+SameSite=Lax (Lax so they
 * survive the cross-site redirect back from Google) and short-lived.
 */

export const STATE_COOKIE = "cal_oauth_state";
export const VERIFIER_COOKIE = "cal_oauth_verifier";
export const TZ_COOKIE = "cal_oauth_tz";

export function randomUrlToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** PKCE S256 challenge for a verifier. */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Constant-time string compare for the OAuth state. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
