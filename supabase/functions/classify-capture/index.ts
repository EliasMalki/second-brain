// classify-capture — async LLM classifier (BUILD_SPEC §4).
//
// Invoked fire-and-forget by the capture server action with { capture_id },
// or with an empty body to sweep the unclassified backlog (manual recovery).
//
// The capture pipeline has ALREADY filed the thought as an unsorted note
// before this function runs, so the invariant "capture is never lost" holds
// no matter what happens here. This function only ever *improves* the filing:
//   - high-confidence note  -> route the note to its project, set a title
//   - high-confidence task  -> create the task, retire the placeholder note
//   - unclear               -> needs_clarification capture + question prompt
//   - any error / low confidence -> leave the unsorted note in the Inbox
//
// Runs with the service role (bypasses RLS), so EVERY query below is scoped
// to the capture's org_id by hand — the tenancy invariant is enforced here in
// code, exactly like the app's query layer.

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";
import { detectDiscrepancy } from "../_shared/discrepancy.ts";
import { logActivity } from "../_shared/activity.ts";

const CONFIDENCE_THRESHOLD = 0.6;
const SWEEP_LIMIT = 10;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const anthropic = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY")!,
});

type Classification = {
  kind: "task" | "note" | "unclear";
  project_id: string | null;
  title: string | null;
  scheduled_for: string | null;
  question: string | null;
  confidence: number;
};

const CLASSIFICATION_SCHEMA = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: ["task", "note", "unclear"],
      description:
        "task = actionable to-do; note = information to keep; unclear = cannot tell without asking the user",
    },
    project_id: {
      type: ["string", "null"],
      description:
        "id of the matching project from the list, or null if none clearly fits",
    },
    title: {
      type: ["string", "null"],
      description: "short title for the task or note (max ~10 words)",
    },
    scheduled_for: {
      type: ["string", "null"],
      description:
        "for tasks only: YYYY-MM-DD date the text explicitly mentions, else null. Never invent a date.",
    },
    question: {
      type: ["string", "null"],
      description:
        "for kind=unclear only: one short clarifying question to ask the user",
    },
    confidence: {
      type: "number",
      description: "0 to 1: how confident you are in kind + project routing",
    },
  },
  required: [
    "kind",
    "project_id",
    "title",
    "scheduled_for",
    "question",
    "confidence",
  ],
  additionalProperties: false,
} as const;

function systemPrompt(today: string): string {
  return [
    "You are the filing secretary of a personal note/task app.",
    "You receive one raw captured thought plus the user's project list",
    "(each with id, name, description, aliases). Classify the capture and",
    "route it to a project.",
    "",
    "Rules:",
    "- A task is something the user must DO (call, buy, fix, send, book...).",
    "- A note is information to remember (an idea, a fact, a reference).",
    "- Route to a project ONLY when the text clearly relates to it (by name,",
    "  alias, or its description). Otherwise project_id = null.",
    "- Use kind=unclear only when you genuinely cannot file it without input.",
    `- Today is ${today}. Resolve relative dates ("tomorrow") against it;`,
    "  set scheduled_for only when the text states a date or day.",
    "- Be conservative with confidence: wrong filing is worse than Inbox.",
  ].join("\n");
}

async function classify(
  rawText: string,
  projects: { id: string; name: string; description: string | null; aliases: string[] }[],
): Promise<Classification> {
  const today = new Date().toISOString().slice(0, 10);

  const response = await anthropic.messages.create({
    // Haiku 4.5 — this is a simple, low-volume classification task; the
    // frontier tier buys nothing here and costs ~5x more.
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: systemPrompt(today),
    output_config: {
      format: {
        type: "json_schema",
        schema: CLASSIFICATION_SCHEMA,
      },
    },
    messages: [
      {
        role: "user",
        content: JSON.stringify({ capture: rawText, projects }),
      },
    ],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("classifier returned no text block");
  }
  return JSON.parse(text.text) as Classification;
}

type CaptureRow = {
  id: string;
  org_id: string;
  owner_id: string | null;
  raw_text: string | null;
  source: string;
  result_kind: string;
  result_id: string | null;
};

async function processCapture(capture: CaptureRow): Promise<string> {
  if (!capture.raw_text) {
    return "skipped: no raw_text";
  }

  // Routing context: the org's active projects (name + description + aliases).
  const { data: projects, error: projErr } = await supabase
    .from("projects")
    .select("id, name, description, aliases")
    .eq("org_id", capture.org_id)
    .eq("status", "active");
  if (projErr) throw new Error(`load projects: ${projErr.message}`);

  let result: Classification;
  try {
    result = await classify(capture.raw_text, projects ?? []);
  } catch (e) {
    // LLM failure: the unsorted note is already in the Inbox — record and stop.
    const message = e instanceof Error ? e.message : String(e);
    await supabase
      .from("captures")
      .update({ status: "failed", interpretation: { error: message } })
      .eq("org_id", capture.org_id)
      .eq("id", capture.id);
    return `failed: ${message}`;
  }

  // Never trust the model with tenancy: a project id is only used if it is
  // one of THIS org's projects fetched above.
  const validProjectId =
    result.project_id && projects?.some((p) => p.id === result.project_id)
      ? result.project_id
      : null;

  const interpretation = { ...result, applied_project_id: validProjectId };
  const lowConfidence = result.confidence < CONFIDENCE_THRESHOLD;

  // Part A (discrepancy detection): once we file a high-confidence item into a
  // project, check it against that project's description. Best-effort and fully
  // decoupled from filing — it only ever surfaces a gentle Inbox question, and
  // never blocks the save or moves the item.
  async function flagDiscrepancy(
    type: "note" | "task",
    id: string,
  ): Promise<void> {
    if (!validProjectId) return;
    const project = projects?.find((p) => p.id === validProjectId);
    if (!project) return;
    const summary = [result.title, capture.raw_text]
      .filter(Boolean)
      .join(" — ")
      .slice(0, 600);
    try {
      await detectDiscrepancy(supabase, {
        orgId: capture.org_id,
        ownerId: capture.owner_id,
        item: { type, id, summary },
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
        },
        otherProjects: (projects ?? [])
          .filter((p) => p.id !== validProjectId)
          .map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
          })),
      });
    } catch (e) {
      console.error(`discrepancy(${type}):`, e);
    }
  }

  if (result.kind === "unclear") {
    // §9: a needs-clarification capture ALWAYS creates a prompt. The unsorted
    // note stays as the durable copy of the thought.
    const { error: promptErr } = await supabase.from("prompts").insert({
      org_id: capture.org_id,
      owner_id: capture.owner_id,
      type: "question",
      text: result.question ?? `How should I file: "${capture.raw_text}"?`,
      relates_type: "capture",
      relates_id: capture.id,
    });
    if (promptErr) throw new Error(`create prompt: ${promptErr.message}`);

    await supabase
      .from("captures")
      .update({ status: "needs_clarification", interpretation })
      .eq("org_id", capture.org_id)
      .eq("id", capture.id);
    return "needs_clarification";
  }

  if (lowConfidence) {
    // Low confidence -> leave the unsorted note in the Inbox untouched.
    await supabase
      .from("captures")
      .update({ status: "processed", interpretation })
      .eq("org_id", capture.org_id)
      .eq("id", capture.id);
    return "low_confidence: left in inbox";
  }

  if (result.kind === "task") {
    const { data: task, error: taskErr } = await supabase
      .from("tasks")
      .insert({
        org_id: capture.org_id,
        owner_id: capture.owner_id,
        project_id: validProjectId,
        title: result.title ?? capture.raw_text.slice(0, 120),
        body: null,
        scheduled_for: result.scheduled_for,
        source: capture.source,
        original_text: capture.raw_text,
      })
      .select("id")
      .single();
    if (taskErr) throw new Error(`create task: ${taskErr.message}`);

    await logActivity(supabase, {
      orgId: capture.org_id,
      ownerId: capture.owner_id,
      actor: "classifier",
      action: "task_created",
      entityId: task.id,
      summary: result.title ?? capture.raw_text.slice(0, 120),
      detail: { project_id: validProjectId, from_capture: capture.id, confidence: result.confidence },
    });

    // The placeholder note was only a fallback; the task replaces it.
    if (capture.result_kind === "note" && capture.result_id) {
      await supabase
        .from("notes")
        .delete()
        .eq("org_id", capture.org_id)
        .eq("id", capture.result_id);
    }

    await supabase
      .from("captures")
      .update({
        status: "processed",
        result_kind: "task",
        result_id: task.id,
        interpretation,
      })
      .eq("org_id", capture.org_id)
      .eq("id", capture.id);

    await flagDiscrepancy("task", task.id);
    return `task -> ${validProjectId ?? "inbox"}`;
  }

  // kind === "note": refine the placeholder note in place.
  if (capture.result_kind === "note" && capture.result_id) {
    const { error: noteErr } = await supabase
      .from("notes")
      .update({
        project_id: validProjectId,
        ...(result.title ? { title: result.title } : {}),
      })
      .eq("org_id", capture.org_id)
      .eq("id", capture.result_id);
    if (noteErr) throw new Error(`update note: ${noteErr.message}`);

    // Log only an actual filing to a project (validProjectId set) — a note left
    // in the Inbox isn't a "filed" event.
    if (validProjectId) {
      await logActivity(supabase, {
        orgId: capture.org_id,
        ownerId: capture.owner_id,
        actor: "classifier",
        action: "note_filed",
        entityType: "note",
        entityId: capture.result_id,
        summary: result.title ?? null,
        detail: { project_id: validProjectId, from_capture: capture.id, confidence: result.confidence },
      });
    }
  }

  await supabase
    .from("captures")
    .update({ status: "processed", interpretation })
    .eq("org_id", capture.org_id)
    .eq("id", capture.id);

  if (capture.result_kind === "note" && capture.result_id) {
    await flagDiscrepancy("note", capture.result_id);
  }
  return `note -> ${validProjectId ?? "inbox"}`;
}

Deno.serve(async (req) => {
  let captureId: string | null = null;
  try {
    const body = await req.json();
    captureId = typeof body?.capture_id === "string" ? body.capture_id : null;
  } catch {
    // empty body -> sweep mode
  }

  // Unclassified = never attempted (interpretation NULL) or failed (so a
  // later sweep retries transient errors — e.g. a missing API key, fixed by
  // setting the secret; the unsorted note sits safely in the Inbox meanwhile).
  let query = supabase
    .from("captures")
    .select("id, org_id, owner_id, raw_text, source, result_kind, result_id")
    .or("interpretation.is.null,status.eq.failed")
    .not("raw_text", "is", null)
    .order("received_at", { ascending: true })
    .limit(SWEEP_LIMIT);
  if (captureId) {
    query = query.eq("id", captureId);
  }

  const { data: captures, error } = await query;
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const results: Record<string, string> = {};
  for (const capture of captures ?? []) {
    try {
      results[capture.id] = await processCapture(capture as CaptureRow);
    } catch (e) {
      results[capture.id] = `error: ${e instanceof Error ? e.message : e}`;
    }
  }

  return Response.json({ processed: Object.keys(results).length, results });
});
