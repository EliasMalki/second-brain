import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import * as shared from "@second-brain/shared/db/prompts";
import type { Prompt, PromptType } from "@second-brain/shared/db/prompts";

/**
 * Thin Next adapter over the shared prompts module: resolve the request's
 * client/org/user here, keep query logic in @second-brain/shared/db/prompts.
 */

export type { Prompt, PromptType } from "@second-brain/shared/db/prompts";

export async function listPendingPrompts(): Promise<Prompt[]> {
  return shared.listPendingPrompts(createClient(), await getCurrentOrgId());
}

export async function getPrompt(id: string): Promise<Prompt | null> {
  return shared.getPrompt(createClient(), await getCurrentOrgId(), id);
}

export async function listDiscrepancySuggestions(
  promptIds: string[],
): Promise<Record<string, string>> {
  return shared.listDiscrepancySuggestions(createClient(), await getCurrentOrgId(), promptIds);
}

export async function dismissPrompt(id: string): Promise<void> {
  return shared.dismissPrompt(createClient(), await getCurrentOrgId(), id);
}

export async function reopenPrompt(id: string): Promise<void> {
  return shared.reopenPrompt(createClient(), await getCurrentOrgId(), id);
}

export async function answerPrompt(id: string, answerText: string): Promise<void> {
  return shared.answerPrompt(createClient(), await getCurrentOrgId(), id, answerText);
}

export async function resolveProjectForPrompt(prompt: Prompt): Promise<string | null> {
  return shared.resolveProjectForPrompt(createClient(), await getCurrentOrgId(), prompt);
}

export async function answerQuestionPrompt(id: string, answerText: string): Promise<void> {
  const user = await requireUser();
  return shared.answerQuestionPrompt(
    createClient(),
    await getCurrentOrgId(),
    user.id,
    id,
    answerText,
  );
}

export async function createPrompt(input: {
  type: PromptType;
  text: string;
  relatesType?: string | null;
  relatesId?: string | null;
  surfaceAfter?: string;
}): Promise<Prompt> {
  const user = await requireUser();
  return shared.createPrompt(createClient(), await getCurrentOrgId(), user.id, input);
}
