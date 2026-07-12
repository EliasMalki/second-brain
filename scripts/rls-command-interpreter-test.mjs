/**
 * RLS isolation proof for the capture command interpreter's data surface.
 *
 * The interpreter (a) matches + mutates TASKS and (b) stores pending
 * confirmations + undo snapshots as command rows in CAPTURES
 * (result_kind='command'). Both must be org-isolated: user B must never read,
 * mutate, resolve, or undo user A's tasks or command state.
 *
 * Mirrors scripts/rls-isolation-test.mjs: two throwaway users, A writes in its
 * own org, B is verified blind, then cleanup.
 *
 * Run:  node --env-file=apps/web/.env.local scripts/rls-command-interpreter-test.mjs
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

async function makeUser(tag) {
  const email = `rlscmd-${tag}-${stamp}@example.com`;
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
    await admin.auth.admin.deleteUser(u.userId);
    await admin.from("organizations").delete().eq("id", u.orgId);
  }
}

console.log("Setting up two fresh users…");
const a = await makeUser("a");
const b = await makeUser("b");

try {
  console.log(`  A: ${a.email}  org ${a.orgId}`);
  console.log(`  B: ${b.email}  org ${b.orgId}`);
  check("A and B got distinct personal orgs", a.orgId !== b.orgId);

  // --- A writes a task and a command-row in its own org ---
  const { data: task, error: taskErr } = await a.client
    .from("tasks")
    .insert({ org_id: a.orgId, owner_id: a.userId, title: "A's secret task" })
    .select()
    .single();
  check("A can create a task in own org", !!task && !taskErr, taskErr?.message);

  const commandInterp = {
    kind: "command",
    state: "pending",
    rawText: "A's pending command",
    expiresAt: new Date(Date.now() + 1800000).toISOString(),
    prompt: "confirm?",
    mode: "yesno",
  };
  const { data: cap, error: capErr } = await a.client
    .from("captures")
    .insert({
      org_id: a.orgId,
      owner_id: a.userId,
      raw_text: "A's pending command",
      source: "app",
      status: "needs_clarification",
      result_kind: "command",
      interpretation: commandInterp,
    })
    .select()
    .single();
  check("A can create a command capture in own org", !!cap && !capErr, capErr?.message);

  // --- B is blind to all of it ---
  console.log("\nTasks isolation (signed in as B):");
  const { data: bTasks } = await b.client.from("tasks").select("*");
  check(`B's task list contains zero of A's tasks (got ${bTasks?.length ?? 0})`,
    (bTasks ?? []).length === 0);

  const { data: bTaskById } = await b.client
    .from("tasks").select("*").eq("id", task.id).maybeSingle();
  check("B cannot fetch A's task by id", bTaskById === null);

  // B tries to complete A's task — RLS USING hides the row, so 0 rows update.
  const { data: bUpd } = await b.client
    .from("tasks").update({ status: "done" }).eq("id", task.id).select();
  check("B cannot update A's task (0 rows matched)", (bUpd ?? []).length === 0);

  const { data: aTaskAfter } = await admin
    .from("tasks").select("status").eq("id", task.id).single();
  check("A's task is still open after B's attempted complete", aTaskAfter?.status === "open");

  const { error: bTaskIns } = await b.client
    .from("tasks").insert({ org_id: a.orgId, owner_id: b.userId, title: "intrusion" });
  check("B cannot insert a task into A's org (WITH CHECK)", !!bTaskIns);

  console.log("\nCommand-state isolation (captures, signed in as B):");
  const { data: bCaps } = await b.client.from("captures").select("*");
  check(`B's captures list contains zero of A's rows (got ${bCaps?.length ?? 0})`,
    (bCaps ?? []).length === 0);

  const { data: bCapById } = await b.client
    .from("captures").select("*").eq("id", cap.id).maybeSingle();
  check("B cannot fetch A's command capture by id (no pending/undo theft)", bCapById === null);

  // B tries to resolve A's pending (flip status) — should match 0 rows.
  const { data: bCapUpd } = await b.client
    .from("captures").update({ status: "processed" }).eq("id", cap.id).select();
  check("B cannot resolve/undo A's command capture (0 rows matched)", (bCapUpd ?? []).length === 0);

  const { error: bCapIns } = await b.client
    .from("captures").insert({
      org_id: a.orgId, owner_id: b.userId, raw_text: "x", source: "app", result_kind: "command",
    });
  check("B cannot insert a capture into A's org (WITH CHECK)", !!bCapIns);

  console.log("\nSanity (signed in as A):");
  const { data: aTasks } = await a.client.from("tasks").select("*");
  check("A still sees exactly their 1 task", (aTasks ?? []).length === 1);
  const { data: aCaps } = await a.client
    .from("captures").select("*").eq("result_kind", "command");
  check("A still sees their own command capture", (aCaps ?? []).length === 1);
} finally {
  console.log("\nCleaning up test users + orgs…");
  await cleanup([a, b]);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
