"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveOrigin } from "@/lib/origin";

export type LoginState = { error?: string; sent?: boolean };

/**
 * Request a magic link. On success Supabase emails a one-time link; clicking it
 * lands on /auth/confirm (see the email template config) which establishes the
 * session. First-time emails trigger the DB onboarding trigger (user -> org ->
 * membership).
 */
export async function requestMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email) {
    return { error: "Enter your email address." };
  }

  const origin = resolveOrigin();
  const supabase = createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/confirm`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { sent: true };
}

// Synthetic domain for username-only test accounts. MUST match the value
// scripts/create-account.mjs appends (TEST_EMAIL_DOMAIN).
const TEST_EMAIL_DOMAIN = "sb.test";

/**
 * Password sign-in. Used by accounts created manually (scripts/create-account.mjs)
 * while email delivery isn't set up — magic links only reach the project owner.
 *
 * Friends sign in with a bare username, which we map to the synthetic
 * `<username>@sb.test` address Supabase Auth actually stores. A real email is
 * accepted too (left as-is). On success the session cookies are set and we land
 * in the app; the onboarding trigger already ran at account-creation time.
 */
export async function signInWithPassword(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const handle = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!handle || !password) {
    return { error: "Enter your username and password." };
  }

  const email = handle.includes("@") ? handle : `${handle}@${TEST_EMAIL_DOMAIN}`;

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Wrong username or password." };
  }

  redirect("/");
}
