/**
 * Test-account handle mapping. While email delivery isn't configured, friends
 * sign in with a bare username mapped to a synthetic address Supabase Auth
 * actually stores. Shared by web and mobile sign-in — a copy in an app is a bug.
 *
 * MUST match the value scripts/create-account.mjs appends when it mints these
 * accounts. Keep the two in sync.
 */
export const TEST_EMAIL_DOMAIN = "sb.test";

/**
 * Map a sign-in handle to the email Supabase stores. A bare username becomes
 * `<username>@sb.test`; a real email (contains `@`) is passed through as-is.
 * Trims and lowercases so the mapping is stable regardless of input casing.
 */
export function handleToEmail(handle: string): string {
  const h = handle.trim().toLowerCase();
  return h.includes("@") ? h : `${h}@${TEST_EMAIL_DOMAIN}`;
}
