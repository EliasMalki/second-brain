/**
 * RLS isolation proof — the CLAUDE.md "user A cannot read user B's rows" gate.
 *
 * Creates two throwaway users via the admin API, signs each in as a normal
 * (anon-key) client, has A create a project, then verifies B cannot read it,
 * cannot fetch it by id, and cannot insert into A's org. Cleans up both users
 * and their orgs afterwards.
 *
 * Run:  node --env-file=.env.local scripts/rls-isolation-test.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const stamp = Date.now();
let pass = 0;
let fail = 0;

function check(label, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label} ${detail}`);
  }
}

/** Create a user and return a signed-in anon-key client (session = that user). */
async function makeUser(tag) {
  const email = `rls-${tag}-${stamp}@example.com`;
  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (createErr) throw new Error(`createUser ${tag}: ${createErr.message}`);

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr) throw new Error(`generateLink ${tag}: ${linkErr.message}`);

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: session, error: otpErr } = await client.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });
  if (otpErr) throw new Error(`verifyOtp ${tag}: ${otpErr.message}`);

  const userId = session.user.id;
  const { data: mem } = await admin
    .from("memberships")
    .select("org_id")
    .eq("user_id", userId)
    .single();

  return { email, userId, orgId: mem.org_id, client };
}

async function cleanup(users) {
  for (const u of users) {
    await admin.auth.admin.deleteUser(u.userId); // cascades users/memberships
    await admin.from("organizations").delete().eq("id", u.orgId);
  }
}

console.log("Setting up two fresh users…");
const a = await makeUser("a");
const b = await makeUser("b");

// Voice-capture audio lives in a private bucket; its RLS must isolate by org
// exactly like the table rows. Paths begin with the org id.
const VOICE_BUCKET = "voice-captures";
const aAudioPath = `${a.orgId}/rls-${stamp}/audio.webm`;
const audioBlob = new Blob([new Uint8Array([0, 1, 2, 3, 4, 5])], {
  type: "audio/webm",
});

try {
  console.log(`  A: ${a.email}  org ${a.orgId}`);
  console.log(`  B: ${b.email}  org ${b.orgId}`);
  check("A and B got distinct personal orgs", a.orgId !== b.orgId);

  // A creates a project in their own org.
  const { data: proj, error: insErr } = await a.client
    .from("projects")
    .insert({ org_id: a.orgId, owner_id: a.userId, name: "A's secret project" })
    .select()
    .single();
  check("A can create a project in own org", !!proj && !insErr, insErr?.message);

  console.log("\nIsolation checks (signed in as B):");
  const { data: bList } = await b.client.from("projects").select("*");
  check(`B's project list contains zero of A's rows (got ${bList?.length ?? 0})`,
    (bList ?? []).length === 0);

  const { data: byId } = await b.client
    .from("projects")
    .select("*")
    .eq("id", proj.id)
    .maybeSingle();
  check("B cannot fetch A's project by id", byId === null);

  const { error: crossErr } = await b.client
    .from("projects")
    .insert({ org_id: a.orgId, owner_id: b.userId, name: "intrusion" });
  check("B cannot insert into A's org (RLS WITH CHECK)", !!crossErr);

  const { data: aOrgFromB } = await b.client
    .from("organizations")
    .select("*")
    .eq("id", a.orgId)
    .maybeSingle();
  check("B cannot read A's organization row", aOrgFromB === null);

  const { data: aMemFromB } = await b.client
    .from("memberships")
    .select("*")
    .eq("user_id", a.userId);
  check("B cannot read A's membership rows", (aMemFromB ?? []).length === 0);

  const { data: aUserFromB } = await b.client
    .from("users")
    .select("*")
    .eq("id", a.userId)
    .maybeSingle();
  check("B cannot read A's user profile (email)", aUserFromB === null);

  console.log("\nStorage isolation (voice-captures bucket):");
  const { error: aUpErr } = await a.client.storage
    .from(VOICE_BUCKET)
    .upload(aAudioPath, audioBlob, { contentType: "audio/webm" });
  check("A can upload audio to own org folder", !aUpErr, aUpErr?.message);

  const { data: bDl, error: bDlErr } = await b.client.storage
    .from(VOICE_BUCKET)
    .download(aAudioPath);
  check("B cannot download A's audio", !bDl || !!bDlErr);

  const { error: bUpErr } = await b.client.storage
    .from(VOICE_BUCKET)
    .upload(`${a.orgId}/rls-${stamp}/intrusion.webm`, audioBlob, {
      contentType: "audio/webm",
    });
  check("B cannot upload into A's org folder (storage WITH CHECK)", !!bUpErr);

  const { data: aDl, error: aDlErr } = await a.client.storage
    .from(VOICE_BUCKET)
    .download(aAudioPath);
  check("A can download own audio", !!aDl && !aDlErr, aDlErr?.message);

  console.log("\nSanity (signed in as A):");
  const { data: aList } = await a.client.from("projects").select("*");
  check("A still sees exactly their 1 project", (aList ?? []).length === 1);
} finally {
  console.log("\nCleaning up test users + orgs…");
  await admin.storage.from(VOICE_BUCKET).remove([aAudioPath]).catch(() => {});
  await cleanup([a, b]);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
