// nightly — the secretary's heartbeat (BUILD_SPEC §3). Runs the six steps IN
// ORDER; half the app silently fails without this cron.
//
//   1. resurface snoozed/waiting -> open
//   2. materialize FIXED recurrences to a 14-day horizon
//      (completion-anchored rules are NOT touched here — they spawn on task
//       completion in lib/db/tasks.ts. Two explicitly separate code paths.)
//   3. roll over unfinished tasks -> today, rollover_count += 1
//   4. nudge prompts for rollover_count >= 5
//   5. pre-generate + EMAIL the daily brief (briefs_log unique row = the
//      idempotency guard: the email sends only when the insert wins)
//   6. cleanup orphaned links/attachments (polymorphic, no FK by design)
//
// Runs with the service role across ALL orgs. Every write carries the org_id
// of the row that produced it — the tenancy invariant, enforced by hand here
// because BYPASSRLS applies.
//
// Idempotent by construction (horizon watermark, same-day rollover no-op,
// deduped nudges, unique brief row), so verify_jwt with any project JWT is an
// acceptable invocation gate for the pg_cron caller.

import { createClient } from "npm:@supabase/supabase-js@2";
import { generateBriefForOrg, sendBriefEmail } from "../_shared/brief.ts";

const HORIZON_DAYS = 14;
const NUDGE_AT_ROLLOVERS = 5;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ---------- date helpers (UTC, YYYY-MM-DD strings) --------------------------

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function diffDays(fromISO: string, toISO: string): number {
  return Math.round(
    (Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) /
      86_400_000,
  );
}

function monthsBetween(fromISO: string, toISO: string): number {
  const f = new Date(`${fromISO}T00:00:00Z`);
  const t = new Date(`${toISO}T00:00:00Z`);
  return (
    (t.getUTCFullYear() - f.getUTCFullYear()) * 12 +
    (t.getUTCMonth() - f.getUTCMonth())
  );
}

// ---------- step 1: resurface ------------------------------------------------

async function resurface(today: string): Promise<number> {
  const { data: snoozed, error: e1 } = await supabase
    .from("tasks")
    .update({ status: "open", snooze_until: null })
    .eq("status", "snoozed")
    .lte("snooze_until", today)
    .select("id");
  if (e1) throw new Error(`resurface snoozed: ${e1.message}`);

  const { data: waiting, error: e2 } = await supabase
    .from("tasks")
    .update({ status: "open" })
    .eq("status", "waiting")
    .lte("follow_up_on", today)
    .select("id");
  if (e2) throw new Error(`resurface waiting: ${e2.message}`);

  return (snoozed?.length ?? 0) + (waiting?.length ?? 0);
}

// ---------- step 2: materialize FIXED recurrences ---------------------------

type RecurrenceRow = {
  id: string;
  org_id: string;
  owner_id: string | null;
  project_id: string | null;
  record_id: string | null;
  title_template: string;
  freq: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  byday: string[] | null;
  bymonthday: number | null;
  lead_days: number;
  default_effort: string | null;
  default_priority: string;
  default_availability: string | null;
  start_date: string;
  until: string | null;
  last_materialized_through: string | null;
};

const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function occursOn(rec: RecurrenceRow, iso: string): boolean {
  if (iso < rec.start_date) return false;
  if (rec.until && iso > rec.until) return false;
  const interval = Math.max(1, rec.interval);

  switch (rec.freq) {
    case "daily":
      return diffDays(rec.start_date, iso) % interval === 0;
    case "weekly": {
      const weekday = WEEKDAY_CODES[new Date(`${iso}T00:00:00Z`).getUTCDay()];
      const startWeekday =
        WEEKDAY_CODES[new Date(`${rec.start_date}T00:00:00Z`).getUTCDay()];
      const days =
        rec.byday && rec.byday.length > 0 ? rec.byday : [startWeekday];
      if (!days.includes(weekday)) return false;
      // week alignment: weeks since the start date's week (Monday-based)
      const startMonday = addDays(
        rec.start_date,
        -((new Date(`${rec.start_date}T00:00:00Z`).getUTCDay() + 6) % 7),
      );
      const weeks = Math.floor(diffDays(startMonday, iso) / 7);
      return weeks % interval === 0;
    }
    case "monthly": {
      const d = new Date(`${iso}T00:00:00Z`);
      const wantDay =
        rec.bymonthday ??
        new Date(`${rec.start_date}T00:00:00Z`).getUTCDate();
      if (d.getUTCDate() !== wantDay) return false;
      return monthsBetween(rec.start_date, iso) % interval === 0;
    }
    case "yearly": {
      const d = new Date(`${iso}T00:00:00Z`);
      const s = new Date(`${rec.start_date}T00:00:00Z`);
      if (
        d.getUTCMonth() !== s.getUTCMonth() ||
        d.getUTCDate() !== s.getUTCDate()
      ) {
        return false;
      }
      return (d.getUTCFullYear() - s.getUTCFullYear()) % interval === 0;
    }
  }
}

async function materializeFixed(today: string): Promise<number> {
  const horizon = addDays(today, HORIZON_DAYS);

  // FIXED only — completion-anchored rules never appear in this query.
  const { data: recs, error } = await supabase
    .from("recurrences")
    .select(
      "id, org_id, owner_id, project_id, record_id, title_template, freq, interval, byday, bymonthday, lead_days, default_effort, default_priority, default_availability, start_date, until, last_materialized_through",
    )
    .eq("anchor", "fixed")
    .eq("active", true)
    .or(`last_materialized_through.is.null,last_materialized_through.lt.${horizon}`);
  if (error) throw new Error(`materialize load: ${error.message}`);

  let created = 0;
  for (const rec of (recs ?? []) as RecurrenceRow[]) {
    // window: day after the watermark (never before today — past occurrences
    // of a brand-new rule would only materialize as instant overdue noise)
    let from = rec.last_materialized_through
      ? addDays(rec.last_materialized_through, 1)
      : rec.start_date;
    if (from < today) from = today;

    const inserts = [];
    for (let iso = from; iso <= horizon; iso = addDays(iso, 1)) {
      if (!occursOn(rec, iso)) continue;
      inserts.push({
        org_id: rec.org_id,
        owner_id: rec.owner_id,
        project_id: rec.project_id,
        record_id: rec.record_id,
        recurrence_id: rec.id,
        title: rec.title_template,
        priority: rec.default_priority,
        effort: rec.default_effort,
        availability: rec.default_availability,
        scheduled_for: rec.lead_days > 0 ? addDays(iso, -rec.lead_days) : iso,
        due_date: iso,
      });
    }

    if (inserts.length > 0) {
      const { error: insErr } = await supabase.from("tasks").insert(inserts);
      if (insErr) throw new Error(`materialize insert: ${insErr.message}`);
      created += inserts.length;
    }

    const { error: wmErr } = await supabase
      .from("recurrences")
      .update({ last_materialized_through: horizon })
      .eq("org_id", rec.org_id)
      .eq("id", rec.id);
    if (wmErr) throw new Error(`materialize watermark: ${wmErr.message}`);
  }
  return created;
}

// ---------- step 3: rollover -------------------------------------------------

async function rollover(today: string): Promise<number> {
  const { data: stale, error } = await supabase
    .from("tasks")
    .select("id, org_id, rollover_count")
    .eq("status", "open")
    .lt("scheduled_for", today);
  if (error) throw new Error(`rollover load: ${error.message}`);

  for (const t of stale ?? []) {
    const { error: upErr } = await supabase
      .from("tasks")
      .update({ scheduled_for: today, rollover_count: t.rollover_count + 1 })
      .eq("org_id", t.org_id)
      .eq("id", t.id);
    if (upErr) throw new Error(`rollover update: ${upErr.message}`);
  }
  return stale?.length ?? 0;
}

// ---------- step 4: rollover-nudge prompts -----------------------------------

async function nudgePrompts(): Promise<number> {
  const { data: nagging, error } = await supabase
    .from("tasks")
    .select("id, org_id, owner_id, title, rollover_count")
    .eq("status", "open")
    .gte("rollover_count", NUDGE_AT_ROLLOVERS);
  if (error) throw new Error(`nudge load: ${error.message}`);

  let created = 0;
  for (const t of nagging ?? []) {
    if (!t.owner_id) continue;

    // one pending nudge per task, ever — don't nag about the nag
    const { data: existing, error: exErr } = await supabase
      .from("prompts")
      .select("id")
      .eq("org_id", t.org_id)
      .eq("type", "nudge")
      .eq("relates_type", "task")
      .eq("relates_id", t.id)
      .eq("status", "pending")
      .limit(1);
    if (exErr) throw new Error(`nudge check: ${exErr.message}`);
    if (existing && existing.length > 0) continue;

    const { error: insErr } = await supabase.from("prompts").insert({
      org_id: t.org_id,
      owner_id: t.owner_id,
      type: "nudge",
      text: `"${t.title}" has rolled over ${t.rollover_count} times. Still worth doing — or snooze/cancel it?`,
      relates_type: "task",
      relates_id: t.id,
    });
    if (insErr) throw new Error(`nudge insert: ${insErr.message}`);
    created++;
  }
  return created;
}

// ---------- step 5: daily brief + email --------------------------------------

// Today's calendar events for the email brief (v1 feature 3). Best-effort: the
// Deno function shares no code with the Next app, so it calls the bearer-gated
// /api/internal/calendar-today endpoint (token handling stays in one place).
// Requires APP_URL set in this function's secrets; any failure → no calendar
// section, the brief still sends.
async function fetchCalendarEvents(
  userId: string,
): Promise<{ time: string; title: string; location: string | null }[]> {
  const appUrl = Deno.env.get("APP_URL");
  if (!appUrl) return [];
  try {
    const res = await fetch(
      `${appUrl.replace(/\/+$/, "")}/api/internal/calendar-today`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId }),
      },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.status === "ok" ? data.events ?? [] : [];
  } catch {
    return [];
  }
}

type BriefResult = { sent: number; failed: number; errors: string[] };

async function briefs(today: string): Promise<BriefResult> {
  const { data: orgs, error } = await supabase
    .from("memberships")
    .select("org_id, user_id");
  if (error) throw new Error(`briefs memberships: ${error.message}`);

  let sent = 0;
  const errors: string[] = [];
  for (const m of orgs ?? []) {
    try {
      const brief = await generateBriefForOrg(supabase, m.org_id, today);
      brief.payload.calendar_events = await fetchCalendarEvents(m.user_id);

      // unique (owner_id, kind, generated_for) = the send-once guard
      const { error: insErr } = await supabase.from("briefs_log").insert({
        org_id: m.org_id,
        owner_id: m.user_id,
        kind: "daily",
        generated_for: today,
        task_ids: brief.taskIds,
        payload: brief.payload,
      });
      if (insErr) {
        // 23505 = already generated today (first-open view or a re-run)
        if (insErr.code !== "23505") {
          throw new Error(`briefs_log insert: ${insErr.message}`);
        }
        continue;
      }

      const { data: user, error: uErr } = await supabase
        .from("users")
        .select("email, name")
        .eq("id", m.user_id)
        .single();
      if (uErr) throw new Error(`briefs user: ${uErr.message}`);

      await sendBriefEmail(user.email, user.name, brief);
      sent++;
    } catch (e) {
      // one org's failure must not stop the others' briefs — but it must NOT
      // vanish either. A silently-swallowed Resend error (bad key, unverified
      // sender) left briefs_log rows looking healthy while no email ever
      // arrived. Collect every failure so the entrypoint can report it.
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`brief failed for org ${m.org_id}:`, e);
      errors.push(`org ${m.org_id}: ${msg}`);
    }
  }
  return { sent, failed: errors.length, errors };
}

// ---------- step 6: cleanup orphaned links/attachments -----------------------

const TARGET_TABLE: Record<string, string> = {
  note: "notes",
  task: "tasks",
  capture: "captures",
  receipt: "receipts",
  record: "records",
  project: "projects",
};

async function existingIds(table: string, ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await supabase.from(table).select("id").in("id", chunk);
    if (error) throw new Error(`cleanup ${table}: ${error.message}`);
    for (const row of data ?? []) out.add(row.id);
  }
  return out;
}

async function cleanup(): Promise<number> {
  let deleted = 0;

  // attachments: owner_type/owner_id
  const { data: atts, error: aErr } = await supabase
    .from("attachments")
    .select("id, owner_type, owner_id");
  if (aErr) throw new Error(`cleanup attachments: ${aErr.message}`);

  const attByType = new Map<string, { id: string; owner_id: string }[]>();
  for (const a of atts ?? []) {
    if (!TARGET_TABLE[a.owner_type]) continue;
    const list = attByType.get(a.owner_type) ?? [];
    list.push(a);
    attByType.set(a.owner_type, list);
  }
  for (const [type, rows] of attByType) {
    const alive = await existingIds(TARGET_TABLE[type], rows.map((r) => r.owner_id));
    const dead = rows.filter((r) => !alive.has(r.owner_id)).map((r) => r.id);
    if (dead.length > 0) {
      const { error } = await supabase.from("attachments").delete().in("id", dead);
      if (error) throw new Error(`cleanup attachments delete: ${error.message}`);
      deleted += dead.length;
    }
  }

  // links: BOTH endpoints must exist
  const { data: links, error: lErr } = await supabase
    .from("links")
    .select("id, from_type, from_id, to_type, to_id");
  if (lErr) throw new Error(`cleanup links: ${lErr.message}`);

  const idsByType = new Map<string, Set<string>>();
  for (const l of links ?? []) {
    for (const [type, id] of [
      [l.from_type, l.from_id],
      [l.to_type, l.to_id],
    ] as const) {
      if (!TARGET_TABLE[type]) continue;
      const set = idsByType.get(type) ?? new Set<string>();
      set.add(id);
      idsByType.set(type, set);
    }
  }
  const aliveByType = new Map<string, Set<string>>();
  for (const [type, ids] of idsByType) {
    aliveByType.set(type, await existingIds(TARGET_TABLE[type], [...ids]));
  }
  const isAlive = (type: string, id: string) =>
    !TARGET_TABLE[type] || (aliveByType.get(type)?.has(id) ?? false);

  const deadLinks = (links ?? [])
    .filter((l) => !isAlive(l.from_type, l.from_id) || !isAlive(l.to_type, l.to_id))
    .map((l) => l.id);
  if (deadLinks.length > 0) {
    const { error } = await supabase.from("links").delete().in("id", deadLinks);
    if (error) throw new Error(`cleanup links delete: ${error.message}`);
    deleted += deadLinks.length;
  }

  return deleted;
}

// ---------- entrypoint --------------------------------------------------------

Deno.serve(async (_req) => {
  const today = todayISO();
  const summary: Record<string, number | string> = { date: today };

  // §3: the order is the contract. Each step throws on hard failure so the
  // response (and function logs) make a broken night visible.
  try {
    summary.resurfaced = await resurface(today);
    summary.materialized = await materializeFixed(today);
    summary.rolled_over = await rollover(today);
    summary.nudges = await nudgePrompts();
    const briefResult = await briefs(today);
    summary.briefs_sent = briefResult.sent;
    summary.briefs_failed = briefResult.failed;
    summary.cleaned = await cleanup();

    // Email failures don't abort the night (the brain work above already
    // succeeded), but they MUST be visible: a non-200 here lands in
    // cron.job_run_details and the function logs instead of being swallowed.
    if (briefResult.failed > 0) {
      summary.brief_errors = briefResult.errors.join("; ");
      console.error("nightly: brief emails failed:", summary.brief_errors);
      return Response.json(summary, { status: 502 });
    }
  } catch (e) {
    summary.error = e instanceof Error ? e.message : String(e);
    console.error("nightly failed:", e);
    return Response.json(summary, { status: 500 });
  }

  return Response.json(summary);
});
