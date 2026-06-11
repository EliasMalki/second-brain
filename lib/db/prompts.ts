import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
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
  return data;
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
