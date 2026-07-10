import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import { appendToWorkflowNote, getNote } from "@/lib/db/notes";
import { getTask } from "@/lib/db/tasks";
import { getRecord } from "@/lib/db/records";
import type { Database } from "@/lib/database.types";

export type Prompt = Database["public"]["Tables"]["prompts"]["Row"];
export type PromptType = Database["public"]["Enums"]["prompt_type"];

/**
 * Prompts data access — the second half of the Inbox (BUILD_SPEC §9).
 * All reads filter by org_id; writes scope by org_id. RLS is the backstop.
 *
 * A prompt is pending until the user answers or dismisses it. surface_after
 * lets the nightly job schedule nudges without them appearing early.
 */

export async function listPendingPrompts(): Promise<Prompt[]> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("prompts")
    .select("*")
    .eq("org_id", orgId)
    .eq("status", "pending")
    .lte("surface_after", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) throw new Error(`listPendingPrompts: ${error.message}`);

  // A rollover nudge ("still worth doing — or snooze/cancel it?") is moot once
  // its task is closed or deleted, so drop it here — a completed/cancelled task
  // must not keep nagging in the Inbox. Only nudges are filtered: a debrief
  // 'question' about a done task is often still worth answering. Task-close also
  // dismisses these at write time; this read guard covers nudges created before
  // that ran and keeps the Inbox count honest.
  const nudgeTaskIds = [
    ...new Set(
      data
        .filter(
          (p) => p.type === "nudge" && p.relates_type === "task" && p.relates_id,
        )
        .map((p) => p.relates_id as string),
    ),
  ];
  if (nudgeTaskIds.length === 0) return data;

  const { data: taskRows, error: taskErr } = await supabase
    .from("tasks")
    .select("id, status")
    .eq("org_id", orgId)
    .in("id", nudgeTaskIds);
  if (taskErr) throw new Error(`listPendingPrompts (tasks): ${taskErr.message}`);

  const statusById = new Map((taskRows ?? []).map((t) => [t.id, t.status]));
  return data.filter((p) => {
    if (p.type !== "nudge" || p.relates_type !== "task" || !p.relates_id) {
      return true;
    }
    // Keep only while the task still exists and is not done/cancelled.
    const status = statusById.get(p.relates_id);
    return status !== undefined && status !== "done" && status !== "cancelled";
  });
}

export async function getPrompt(id: string): Promise<Prompt | null> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("prompts")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`getPrompt: ${error.message}`);
  return data;
}

/**
 * Map discrepancy prompt id -> its suggested project id. The discrepancy
 * detector stashes the suggestion as a links row (from a 'prompt' to a
 * 'project', relation='discrepancy_suggestion') so the Inbox can default the
 * reclassify dropdown. Returns only the prompts that have a suggestion.
 */
export async function listDiscrepancySuggestions(
  promptIds: string[],
): Promise<Record<string, string>> {
  if (promptIds.length === 0) return {};
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("links")
    .select("from_id, to_id")
    .eq("org_id", orgId)
    .eq("from_type", "prompt")
    .eq("to_type", "project")
    .eq("relation", "discrepancy_suggestion")
    .in("from_id", promptIds);

  if (error) throw new Error(`listDiscrepancySuggestions: ${error.message}`);
  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.from_id] = row.to_id;
  return map;
}

export async function dismissPrompt(id: string): Promise<void> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { error } = await supabase
    .from("prompts")
    .update({
      status: "dismissed" as const,
      resolved_at: new Date().toISOString(),
    })
    .eq("org_id", orgId)
    .eq("id", id);

  if (error) throw new Error(`dismissPrompt: ${error.message}`);
}

/**
 * Undo for a just-dismissed prompt (the Inbox undo toast): back to pending so
 * it reappears in the feed. Leaves surface_after alone — it was already due.
 */
export async function reopenPrompt(id: string): Promise<void> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { error } = await supabase
    .from("prompts")
    .update({ status: "pending" as const, resolved_at: null })
    .eq("org_id", orgId)
    .eq("id", id);

  if (error) throw new Error(`reopenPrompt: ${error.message}`);
}

export async function answerPrompt(
  id: string,
  answerText: string,
): Promise<void> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { error } = await supabase
    .from("prompts")
    .update({
      status: "answered" as const,
      answer_text: answerText,
      resolved_at: new Date().toISOString(),
    })
    .eq("org_id", orgId)
    .eq("id", id);

  if (error) throw new Error(`answerPrompt: ${error.message}`);
}

/**
 * Resolve which project an answer should enrich. Debrief questions point at a
 * task / record / project / unfiled note; classifier 'unclear' questions point
 * at a capture (no project -> null, no append). Exported so the Inbox can show
 * the same project on the question card ("adds to your X workflow") that the
 * answer will actually land in.
 */
export async function resolveProjectForPrompt(
  prompt: Prompt,
): Promise<string | null> {
  if (!prompt.relates_id) return null;
  switch (prompt.relates_type) {
    case "project":
      return prompt.relates_id;
    case "task":
      return (await getTask(prompt.relates_id))?.project_id ?? null;
    case "record":
      return (await getRecord(prompt.relates_id))?.project_id ?? null;
    case "note":
      return (await getNote(prompt.relates_id))?.project_id ?? null;
    default:
      return null;
  }
}

/** Link a prompt to the workflow note its answer enriched (debrief lineage). */
async function linkPromptToWorkflowNote(
  promptId: string,
  noteId: string,
): Promise<void> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { error } = await supabase.from("links").insert({
    org_id: orgId,
    from_type: "prompt",
    from_id: promptId,
    to_type: "note",
    to_id: noteId,
    relation: "debrief_answer",
  });
  // UNIQUE(from,to,relation) — a re-answer is harmless, ignore the dup
  if (error && error.code !== "23505") {
    throw new Error(`linkPromptToWorkflowNote: ${error.message}`);
  }
}

/**
 * Answer a question prompt (the Inbox payoff, v1 feature 4). For a debrief
 * question whose subject resolves to a project, the answer is appended to that
 * project's workflow note as a dated entry and the prompt is linked to the note
 * — this is how workflows grow rich enough to clone. Classifier 'unclear'
 * questions (no project) just store the answer. Always resolves the prompt.
 */
export async function answerQuestionPrompt(
  id: string,
  answerText: string,
): Promise<void> {
  const prompt = await getPrompt(id);
  if (!prompt) return;

  const projectId = await resolveProjectForPrompt(prompt);
  if (projectId) {
    const today = new Date().toISOString().slice(0, 10);
    const note = await appendToWorkflowNote(projectId, {
      date: today,
      question: prompt.text,
      answer: answerText,
    });
    await linkPromptToWorkflowNote(id, note.id);
  }

  await answerPrompt(id, answerText);
}

/**
 * Used by needs-clarification flows (§9: such a capture ALWAYS creates a
 * prompt) and by the nightly job's rollover nudges.
 */
export async function createPrompt(input: {
  type: PromptType;
  text: string;
  relatesType?: string | null;
  relatesId?: string | null;
  surfaceAfter?: string;
}): Promise<Prompt> {
  const user = await requireUser();
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("prompts")
    .insert({
      org_id: orgId,
      owner_id: user.id,
      type: input.type,
      text: input.text,
      relates_type: input.relatesType ?? null,
      relates_id: input.relatesId ?? null,
      ...(input.surfaceAfter ? { surface_after: input.surfaceAfter } : {}),
    })
    .select()
    .single();

  if (error) throw new Error(`createPrompt: ${error.message}`);
  return data;
}
