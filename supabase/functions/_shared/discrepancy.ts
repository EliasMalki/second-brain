// discrepancy.ts — Part A of the debrief engine (v1 feature 4).
//
// High-precision misfiling check. After the classifier files a note/task into a
// project (classify-capture), or after a receipt is filed to a project
// (check-discrepancy), compare the item against that project's description —
// the markdown "what it is". If it CLEARLY doesn't fit, surface one gentle,
// dismissible question in the Inbox (type='discrepancy'). That is all it does:
//
//   - NEVER blocks the save and NEVER auto-reclassifies. The item stays where
//     the classifier put it; the discrepancy is only a surfaced question.
//   - NEVER re-flags an item it already raised (one discrepancy prompt per
//     item, ever — any status).
//   - High precision only. A false alarm is worse than a miss; the prompt is
//     tuned to err toward silence.
//
// Runs with the service role (BYPASSRLS), so every query is scoped to the
// item's org_id by hand — same tenancy discipline as classify-capture.

// deno-lint-ignore-file no-explicit-any
import Anthropic from "npm:@anthropic-ai/sdk";

type SupabaseClient = any;

// Only flag strong misfits. confidence is "how sure the item does NOT belong".
const CONFIDENCE_THRESHOLD = 0.8;
// The description is the yardstick. Without a real one we can't judge — stay
// quiet. Kept low so short-but-real descriptions ("Mercedes E53 re condition")
// still qualify; a near-empty or absent description is what we skip.
const MIN_DESCRIPTION_CHARS = 20;

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });

export type DiscrepancyItem = {
  type: "note" | "task" | "receipt";
  id: string;
  summary: string; // a short human description of the item for the model
};

export type ProjectLite = {
  id: string;
  name: string;
  description: string | null;
};

type Verdict = {
  fits: boolean;
  confidence: number;
  reason: string;
  suggested_project_id: string | null;
  question: string | null;
};

const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    fits: {
      type: "boolean",
      description:
        "true if the item plausibly belongs to this project. When in any doubt, true.",
    },
    confidence: {
      type: "number",
      description:
        "0 to 1: how confident you are the item does NOT belong here. Only a strong, obvious mismatch is high.",
    },
    reason: {
      type: "string",
      description: "one short phrase naming the contradiction (empty if it fits)",
    },
    suggested_project_id: {
      type: ["string", "null"],
      description:
        "id of a clearly-better project from the provided list, or null if none is obvious",
    },
    question: {
      type: ["string", "null"],
      description:
        "for a mismatch only: ONE short, warm, non-accusatory question the user can answer or dismiss (null if it fits)",
    },
  },
  required: ["fits", "confidence", "reason", "suggested_project_id", "question"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = [
  "You are the filing-quality check of a personal note/task app.",
  "An item was just auto-filed under a project. Your ONLY job is to catch CLEAR",
  "misfilings — cases where the item plainly contradicts what the project is.",
  "",
  "You are given the item, the project it was filed under (with its description),",
  "and the user's other projects. Decide whether the item plausibly belongs.",
  "",
  "Rules — precision is everything:",
  "- Default to fits=true. Only fits=false for an OBVIOUS mismatch a careful",
  "  human would also flag (e.g. a large materials/parts expense under a project",
  "  whose description says software with near-zero materials; a task whose",
  "  subject contradicts the project's stated scope).",
  "- A merely loose, broad, or generic fit is STILL a fit. Vagueness => fits=true.",
  "- If the project description is thin or you are unsure, fits=true.",
  "- When you flag, set suggested_project_id to the clearly-better project from",
  "  the list ONLY if one is obvious; otherwise null.",
  "- Write `question` as ONE short, warm line the user can answer or dismiss,",
  "  e.g. \"This $3k materials receipt is filed under Acme (a software studio) —",
  "  did you mean Reno or E53?\". Never a command, never a block.",
  "- A false alarm is worse than a miss. When unsure, fits=true.",
].join("\n");

async function judge(
  item: DiscrepancyItem,
  project: ProjectLite,
  otherProjects: ProjectLite[],
): Promise<Verdict> {
  const response = await anthropic.messages.create({
    // Haiku 4.5 — same low-volume, structured task tier as the classifier.
    model: "claude-haiku-4-5",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    output_config: {
      format: { type: "json_schema", schema: VERDICT_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          item: { type: item.type, summary: item.summary },
          filed_under: { name: project.name, description: project.description },
          other_projects: otherProjects.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description ?? "",
          })),
        }),
      },
    ],
  });

  const text = response.content.find((b: any) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("discrepancy judge returned no text block");
  }
  return JSON.parse(text.text) as Verdict;
}

/**
 * Run the misfiling check for one filed item. Returns a short status string for
 * logging. Best-effort: callers should treat a throw as non-fatal — a quality
 * check must never break the pipeline that invoked it.
 */
export async function detectDiscrepancy(
  supabase: SupabaseClient,
  args: {
    orgId: string;
    ownerId: string | null;
    item: DiscrepancyItem;
    project: ProjectLite;
    otherProjects: ProjectLite[];
  },
): Promise<string> {
  const { orgId, ownerId, item, project, otherProjects } = args;

  // prompts.owner_id is NOT NULL — without an owner we can't file the question.
  if (!ownerId) return "skipped: no owner";

  if (
    !project.description ||
    project.description.trim().length < MIN_DESCRIPTION_CHARS
  ) {
    return "skipped: project has no substantial description";
  }

  // Never re-flag: at most one discrepancy prompt per item, ever (any status —
  // a dismissed "it's correct" must not come back).
  const { data: existing, error: exErr } = await supabase
    .from("prompts")
    .select("id")
    .eq("org_id", orgId)
    .eq("type", "discrepancy")
    .eq("relates_type", item.type)
    .eq("relates_id", item.id)
    .limit(1);
  if (exErr) throw new Error(`discrepancy dedup: ${exErr.message}`);
  if (existing && existing.length > 0) return "skipped: already flagged";

  let verdict: Verdict;
  try {
    verdict = await judge(item, project, otherProjects);
  } catch (e) {
    // LLM failure must never break filing — the item is already saved.
    return `skipped: judge failed (${e instanceof Error ? e.message : e})`;
  }

  if (
    verdict.fits ||
    verdict.confidence < CONFIDENCE_THRESHOLD ||
    !verdict.question
  ) {
    return "ok: fits";
  }

  // Trust a suggestion only if it is one of THIS org's other projects.
  const validSuggestion =
    verdict.suggested_project_id &&
    otherProjects.some((p) => p.id === verdict.suggested_project_id)
      ? verdict.suggested_project_id
      : null;

  const { data: prompt, error: insErr } = await supabase
    .from("prompts")
    .insert({
      org_id: orgId,
      owner_id: ownerId,
      type: "discrepancy",
      text: verdict.question,
      relates_type: item.type,
      relates_id: item.id,
    })
    .select("id")
    .single();
  if (insErr) throw new Error(`discrepancy insert: ${insErr.message}`);

  // Stash the suggested project as a link so the Inbox can default its
  // reclassify dropdown to it — no schema change, rides the links table.
  if (validSuggestion) {
    const { error: linkErr } = await supabase.from("links").insert({
      org_id: orgId,
      from_type: "prompt",
      from_id: prompt.id,
      to_type: "project",
      to_id: validSuggestion,
      relation: "discrepancy_suggestion",
    });
    if (linkErr) throw new Error(`discrepancy link: ${linkErr.message}`);
  }

  return `flagged${validSuggestion ? ` -> ${validSuggestion}` : ""}`;
}
