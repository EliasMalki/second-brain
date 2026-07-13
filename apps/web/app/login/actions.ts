"use server";

import { redirect } from "next/navigation";
import { handleToEmail } from "@second-brain/shared/domain/accounts";
import { createClient } from "@/lib/supabase/server";
import { resolveOrigin } from "@/lib/origin";

export type LoginState = { error?: string; sent?: boolean };

/**
 * Request a magic link. On success Supabase emails a one-time link; the
 * template routes it through /auth/confirm (which verifies the token), then on
 * to `emailRedirectTo` as the post-auth destination — so this is the landing
 * page, NOT the confirm URL. First-time emails trigger the DB onboarding
 * trigger (user -> org -> membership).
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
      emailRedirectTo: `${origin}/`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { sent: true };
}

/**
 * Password sign-in. Used by accounts created manually (scripts/create-account.mjs)
 * while email delivery isn't set up — magic links only reach the project owner.
 *
 * Friends sign in with a bare username, which we map to the synthetic
 * `<username>@sb.test` address Supabase Auth actually stores (handleToEmail;
 * shared with mobile). A real email is accepted too (left as-is). On success
 * the session cookies are set and we land in the app; the onboarding trigger
 * already ran at account-creation time.
 */
export async function signInWithPassword(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const handle = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!handle.trim() || !password) {
    return { error: "Enter your username and password." };
  }

  const email = handleToEmail(handle);

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Wrong username or password." };
  }

  redirect("/");
}
