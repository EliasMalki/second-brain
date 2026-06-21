// debrief.ts — Part B of the debrief engine (v1 feature 4).
//
// Mines a user's second-brain for GENUINE gaps and asks a small, high-precision
// batch of short questions. Restraint is the feature:
//   - few items (max 5), gentle tone, always dismissible
//   - never re-asks: marks reviewed_at on note/task sources and skips anything
//     that already has a prompt (any status)
//   - stays silent when there's nothing real to ask
//
// The gaps it looks for:
//   1. unfiled notes lingering in the Inbox past a few days
//   2. substantial, non-routine tasks completed but never explained
//   3. active projects with recent work but a thin/missing workflow note
//   4. records closed without a wrap-up note
//
// Pure generation: cadence gating, "midday" timing, and the last-run watermark
// live in the caller (the nightly job / the debrief Edge Function). Runs with
// the service role — every query is scoped to orgId by hand.

// deno-lint-ignore-file no-explicit-any
import Anthropic from "npm:@anthropic-ai/sdk";

type SupabaseClient = any;

const MAX_QUESTIONS = 5;
const STALE_NOTE_DAYS = 4;
const DONE_LOOKBACK_DAYS = 30;
const THIN_WORKFLOW_CHARS = 240;
const CANDIDATE_LIMIT = 12; // per gap type
const MODEL_CANDIDATE_CAP = 20; // total candidates shown to the model

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });

type RelType = "note" | "task" | "project" | "record";

type Candidate = {
  relates_type: RelType;
  relates_id: string;
  gap: string; // short description of the gap, for the model
  context: string; // the content the question is about
};

function daysAgoISO(todayISO: string, n: number): string {
  const d = new Date(`${todayISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// ---------- candidate gathering (bounded SQL, org-scoped) -------------------

async function gatherCandidates(
  supabase: SupabaseClient,
  orgId: string,
  today: string,
): Promise<Candidate[]> {
  const candidates: Candidate[] = [];

  // 1. stale unfiled notes (lingering in the Inbox)
  const { data: notes } = await supabase
    .from("notes")
    .select("id, title, body, created_at")
    .eq("org_id", orgId)
    .is("project_id", null)
    .eq("archived", false)
    .is("reviewed_at", null)
    .lt("created_at", `${daysAgoISO(today, STALE_NOTE_DAYS)}T00:00:00Z`)
    .order("created_at", { ascending: true })
    .limit(CANDIDATE_LIMIT);
  for (const n of notes ?? []) {
    candidates.push({
      relates_type: "note",
      relates_id: n.id,
      gap: "unfiled note lingering in the Inbox",
      context: [n.title, n.body].filter(Boolean).join(" — ").slice(0, 280),
    });
  }

  // 2. substantial, non-routine tasks completed but never explained.
  //    recurrence_id IS NULL drops routine recurring chores; project_id present
  //    so the answer has a workflow to enrich.
  const { data: doneTasks } = await supabase
    .from("tasks")
    .select("id, title, project_id, completed_at, effort, rollover_count")
    .eq("org_id", orgId)
    .eq("status", "done")
    .is("reviewed_at", null)
    .is("recurrence_id", null)
    .not("project_id", "is", null)
    .gte("completed_at", `${daysAgoISO(today, DONE_LOOKBACK_DAYS)}T00:00:00Z`)
    .order("completed_at", { ascending: false })
    .limit(CANDIDATE_LIMIT);
  for (const t of doneTasks ?? []) {
    candidates.push({
      relates_type: "task",
      relates_id: t.id,
      gap: "task completed but never explained",
      context: t.title?.slice(0, 280) ?? "a completed task",
    });
  }

  // 3. active projects with recent completed work but a thin/missing workflow note
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, description")
    .eq("org_id", orgId)
    .eq("status", "active")
    .limit(CANDIDATE_LIMIT);
  const projectIds = (projects ?? []).map((p: any) => p.id);
  if (projectIds.length > 0) {
    const since = `${daysAgoISO(today, DONE_LOOKBACK_DAYS)}T00:00:00Z`;
    const [{ data: wfNotes }, { data: recentDone }] = await Promise.all([
      supabase
        .from("notes")
        .select("project_id, body")
        .eq("org_id", orgId)
        .eq("kind", "workflow")
        .in("project_id", projectIds),
      supabase
        .from("tasks")
        .select("project_id")
        .eq("org_id", orgId)
        .eq("status", "done")
        .gte("completed_at", since)
        .in("project_id", projectIds),
    ]);
    const workflowBody = new Map<string, string>();
    for (const w of wfNotes ?? []) {
      // keep the longest workflow note per project (the richest one)
      const prev = workflowBody.get(w.project_id) ?? "";
      if ((w.body ?? "").length >= prev.length) {
        workflowBody.set(w.project_id, w.body ?? "");
      }
    }
    const activeProjects = new Set<string>();
    for (const r of recentDone ?? []) activeProjects.add(r.project_id);

    for (const p of projects ?? []) {
      if (!activeProjects.has(p.id)) continue; // no recent work => not a gap
      const body = workflowBody.get(p.id);
      if (body !== undefined && body.length >= THIN_WORKFLOW_CHARS) continue;
      candidates.push({
        relates_type: "project",
        relates_id: p.id,
        gap:
          body === undefined
            ? "active project has recent work but no workflow note yet"
            : "active project's workflow note is thin",
        context: [p.name, p.description].filter(Boolean).join(" — ").slice(0, 280),
      });
    }
  }

  // 4. records closed (archived) without any wrap-up note
  const { data: archived } = await supabase
    .from("records")
    .select("id, name")
    .eq("org_id", orgId)
    .eq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(CANDIDATE_LIMIT);
  const archivedIds = (archived ?? []).map((r: any) => r.id);
  if (archivedIds.length > 0) {
    const { data: recNotes } = await supabase
      .from("notes")
      .select("record_id")
      .eq("org_id", orgId)
      .in("record_id", archivedIds);
    const haveNotes = new Set((recNotes ?? []).map((n: any) => n.record_id));
    for (const r of archived ?? []) {
      if (haveNotes.has(r.id)) continue;
      candidates.push({
        relates_type: "record",
        relates_id: r.id,
        gap: "record closed without a wrap-up note",
        context: (r.name ?? "a record").slice(0, 280),
      });
    }
  }

  return candidates;
}

// ---------- never re-ask: drop anything already prompted ---------------------

async function dropAlreadyPrompted(
  supabase: SupabaseClient,
  orgId: string,
  candidates: Candidate[],
): Promise<Candidate[]> {
  if (candidates.length === 0) return [];
  const ids = candidates.map((c) => c.relates_id);
  const { data: existing, error } = await supabase
    .from("prompts")
    .select("relates_type, relates_id")
    .eq("org_id", orgId)
    .in("relates_id", ids);
  if (error) throw new Error(`debrief dedup: ${error.message}`);
  const seen = new Set(
    (existing ?? []).map((p: any) => `${p.relates_type}:${p.relates_id}`),
  );
  return candidates.filter(
    (c) => !seen.has(`${c.relates_type}:${c.relates_id}`),
  );
}

// ---------- generation (one LLM call, high precision, gentle tone) -----------

const GEN_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      description: `at most ${MAX_QUESTIONS} questions; fewer is better; zero is fine`,
      items: {
        type: "object",
        properties: {
          index: {
            type: "number",
            description: "the index of the gap you are asking about",
          },
          text: {
            type: "string",
            description:
              "one short, specific question (max ~25 words) that pulls out reusable know-how worth saving to a playbook",
          },
        },
        required: ["index", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
} as const;

const GEN_SYSTEM = [
  "You are a sharp personal assistant helping someone turn finished work into a",
  "reusable playbook. You are given a list of GAPS in their second-brain. For",
  "each gap, their ANSWER will be appended to that project's workflow note — the",
  "notes they'd clone to run the next similar job. So ask for the KNOW-HOW worth",
  "saving, never chit-chat.",
  "",
  "Aim each question at the reusable substance:",
  "- the key step or sequence that made it work",
  "- the gotcha or mistake that cost time, and how to avoid it next time",
  "- a specific part, spec, setting, supplier, or price worth remembering",
  "- what they'd repeat or do differently next time",
  "",
  "Hard rules:",
  `- Return at most ${MAX_QUESTIONS} questions. Prefer FEWER. Zero is fine and`,
  "  often correct — never pad to hit a number.",
  "- Each question must be specific (name the project/task/thing) and answerable",
  "  in a sentence or two.",
  "- Do NOT ask about feelings or motivation ('why did you do it yourself'), and",
  "  NEVER use generic check-in filler ('how's it going', 'how did it go').",
  "- Never scold or nag. Warm and curious, e.g. 'For the E53 brakes — any torque",
  "  spec or part number worth saving for the next rotor job?'",
  "- Skip anything that wouldn't earn a line in a playbook. When unsure, skip it.",
  "- Reference each chosen gap by its index.",
].join("\n");

type Generated = { index: number; text: string };

async function generate(candidates: Candidate[]): Promise<Generated[]> {
  const shown = candidates.slice(0, MODEL_CANDIDATE_CAP);
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: GEN_SYSTEM,
    output_config: { format: { type: "json_schema", schema: GEN_SCHEMA } },
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          gaps: shown.map((c, i) => ({
            index: i,
            kind: c.gap,
            about: c.context,
          })),
        }),
      },
    ],
  });
  const text = response.content.find((b: any) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("debrief generator returned no text block");
  }
  const parsed = JSON.parse(text.text) as { questions: Generated[] };
  return (parsed.questions ?? []).slice(0, MAX_QUESTIONS);
}

// ---------- entry point ------------------------------------------------------

/**
 * Find gaps for one user, generate a small batch of questions, file them as
 * pending prompts surfacing at `surfaceAfter`, and mark note/task sources
 * reviewed so they are never asked again. Returns counts for the caller's
 * bookkeeping (e.g. whether to advance the cadence watermark).
 */
export async function mineAndGenerate(
  supabase: SupabaseClient,
  args: {
    orgId: string;
    ownerId: string;
    today: string;
    surfaceAfter: string; // ISO timestamp the questions appear at (e.g. midday)
  },
): Promise<{ candidates: number; generated: number }> {
  const { orgId, ownerId, today, surfaceAfter } = args;

  const raw = await gatherCandidates(supabase, orgId, today);
  const candidates = await dropAlreadyPrompted(supabase, orgId, raw);
  if (candidates.length === 0) return { candidates: 0, generated: 0 };

  const shown = candidates.slice(0, MODEL_CANDIDATE_CAP);
  let questions: Generated[];
  try {
    questions = await generate(shown);
  } catch (e) {
    // generation failure must not break the nightly job — just stay quiet
    console.error("debrief generate failed:", e);
    return { candidates: candidates.length, generated: 0 };
  }

  let generated = 0;
  for (const q of questions) {
    const c = shown[q.index];
    if (!c || !q.text?.trim()) continue;

    const { error: insErr } = await supabase.from("prompts").insert({
      org_id: orgId,
      owner_id: ownerId,
      type: "question",
      text: q.text.trim(),
      relates_type: c.relates_type,
      relates_id: c.relates_id,
      surface_after: surfaceAfter,
    });
    if (insErr) throw new Error(`debrief prompt insert: ${insErr.message}`);

    // Mark the source reviewed so it's never re-asked (notes/tasks only —
    // project/record sources rely on the prompt-exists dedup above).
    if (c.relates_type === "note" || c.relates_type === "task") {
      const table = c.relates_type === "note" ? "notes" : "tasks";
      await supabase
        .from(table)
        .update({ reviewed_at: new Date().toISOString() })
        .eq("org_id", orgId)
        .eq("id", c.relates_id);
    }
    generated++;
  }

  return { candidates: candidates.length, generated };
}
