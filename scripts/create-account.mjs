/**
 * Create (or password-reset) a friend's account — manual onboarding.
 *
 * Email delivery isn't set up yet (no verified sending domain), so magic links
 * only reach the project owner. This creates a pre-confirmed account with a
 * generated password instead: `email_confirm: true` means no email is ever
 * sent and the person can sign in immediately via the password form on /login.
 *
 * TESTING-PHASE USERNAMES: Supabase Auth is keyed on email, but friends
 * shouldn't need a real one yet. Pass a bare username and it's mapped to a
 * synthetic, non-routable address `<username>@sb.test` (`.test` is a reserved
 * TLD that can never receive mail). Friends sign in with just the username.
 * Passing a real email still works (use that for anyone who needs the brief).
 *
 * The `AFTER INSERT ON auth.users` onboarding trigger does the rest — profile,
 * personal org, owner membership — exactly as it would for a magic-link signup.
 * RLS keeps every account fully isolated.
 *
 * Run (create):  node --env-file=.env.local scripts/create-account.mjs <username> "<name>"
 * Run (reset):   node --env-file=.env.local scripts/create-account.mjs <username> --reset
 *
 * NOTE: .env.local must point at the PRODUCTION Supabase project (same file the
 * RLS-proof scripts use), so the account lands where the live app reads it.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

// Synthetic domain for username-only test accounts. MUST match the value the
// login action appends in app/login/actions.ts (signInWithPassword).
const TEST_EMAIL_DOMAIN = "sb.test";

/** A bare username becomes <username>@sb.test; a real email is left as-is. */
function toEmail(input) {
  const v = input.trim().toLowerCase();
  return v.includes("@") ? v : `${v}@${TEST_EMAIL_DOMAIN}`;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing env. Run with: node --env-file=.env.local scripts/create-account.mjs <email> \"<name>\"",
  );
  process.exit(1);
}

const rawEmail = process.argv[2];
const arg3 = process.argv[3];
const reset = arg3 === "--reset";
const name = reset ? undefined : arg3;

if (!rawEmail) {
  console.error('Usage: create-account.mjs <username> "<name>"   (or <username> --reset)');
  process.exit(1);
}
const email = toEmail(rawEmail);
const username = email.split("@")[0];

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Readable-but-strong password: 18 url-safe chars. The user can change it later
 * once self-serve password change exists; for now it's the durable credential.
 */
function generatePassword() {
  return randomBytes(18).toString("base64url").slice(0, 18);
}

/** Find an existing auth user by email (small instance — first page is enough). */
async function findUserByEmail(target) {
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (error) throw error;
  return data.users.find((u) => u.email?.toLowerCase() === target) ?? null;
}

async function main() {
  const password = generatePassword();

  if (reset) {
    const existing = await findUserByEmail(email);
    if (!existing) {
      console.error(`No account found for ${email} — nothing to reset.`);
      process.exit(1);
    }
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
    });
    if (error) {
      console.error(`Reset failed: ${error.message}`);
      process.exit(1);
    }
    printCredentials(username, email, password, "Password reset");
    return;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: name || username },
  });

  if (error) {
    if (/already.*registered|exists/i.test(error.message)) {
      console.error(
        `${email} already has an account. To set a new password run:\n` +
          `  node --env-file=.env.local scripts/create-account.mjs ${email} --reset`,
      );
      process.exit(1);
    }
    console.error(`Create failed: ${error.message}`);
    process.exit(1);
  }

  // Confirm the onboarding trigger landed (profile + org + membership).
  const userId = data.user.id;
  const { count, error: mErr } = await admin
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  const onboarded = !mErr && (count ?? 0) > 0;

  printCredentials(username, email, password, "Account created");
  if (!onboarded) {
    console.warn(
      "\n⚠  Could not confirm the onboarding trigger created a membership.\n" +
        "   Check that on_auth_user_created is installed before they sign in.",
    );
  }
}

function printCredentials(username, email, password, heading) {
  const synthetic = email.endsWith(`@${TEST_EMAIL_DOMAIN}`);
  console.log(`\n${heading} ✓`);
  console.log("─".repeat(40));
  console.log(`  Username:  ${username}`);
  if (!synthetic) console.log(`  Email:     ${email}`);
  console.log(`  Password:  ${password}`);
  console.log("─".repeat(40));
  console.log(
    "Share these securely. They sign in at /login → 'Use a password instead'.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
