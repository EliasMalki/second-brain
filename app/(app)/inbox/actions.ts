"use server";

import { revalidatePath } from "next/cache";
import { updateNote, setNoteArchived } from "@/lib/db/notes";
import {
  answerPrompt,
  answerQuestionPrompt,
  dismissPrompt,
  getPrompt,
} from "@/lib/db/prompts";
import { updateTask } from "@/lib/db/tasks";
import { updateReceiptProject } from "@/lib/db/receipts";
import { retryVoiceTranscription } from "@/lib/db/captures";

/** File an unsorted note into a project (manual filing from the Inbox). */
export async function inboxFileNoteAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const projectId = String(formData.get("project_id") ?? "");
  if (!id || !projectId) return;
  await updateNote(id, { projectId });
  revalidatePath("/inbox");
  revalidatePath("/notes");
}

/** File an unfiled task into a project (sets project_id; leaves the Inbox). */
export async function inboxFileTaskAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const projectId = String(formData.get("project_id") ?? "");
  if (!id || !projectId) return;
  await updateTask(id, { projectId });
  revalidatePath("/inbox");
  revalidatePath("/tasks");
}

/** Dismiss an unsorted note = archive it (it leaves the Inbox, not the org). */
export async function inboxArchiveNoteAction(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await setNoteArchived(id, true);
  revalidatePath("/inbox");
  revalidatePath("/notes");
}

/**
 * Dismiss an unfiled task from the Inbox = cancel it. Not a delete — it keeps
 * its history and stays recoverable from the Tasks views.
 */
export async function inboxDismissTaskAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await updateTask(id, { status: "cancelled" });
  revalidatePath("/inbox");
  revalidatePath("/tasks");
}

export async function inboxDismissPromptAction(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await dismissPrompt(id);
  revalidatePath("/inbox");
}

export async function inboxAnswerPromptAction(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const answer = String(formData.get("answer") ?? "").trim();
  if (!id || !answer) return;
  // Debrief answers append to the project's workflow note; classifier 'unclear'
  // answers just store + resolve. answerQuestionPrompt routes on relates_type.
  await answerQuestionPrompt(id, answer);
  revalidatePath("/inbox");
  revalidatePath("/notes");
  revalidatePath("/projects", "layout");
}

/**
 * Resolve a discrepancy prompt by REclassifying the flagged item to the chosen
 * project. The prompt's relates_type/relates_id are read server-side (not
 * trusted from the form) and the item is repointed; then the prompt is marked
 * resolved. "It's correct" instead uses inboxDismissPromptAction (never
 * re-flags — the detector won't raise the same item twice).
 */
export async function inboxReclassifyDiscrepancyAction(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const projectId = String(formData.get("project_id") ?? "");
  if (!id || !projectId) return;

  const prompt = await getPrompt(id);
  if (
    !prompt ||
    prompt.type !== "discrepancy" ||
    !prompt.relates_type ||
    !prompt.relates_id
  ) {
    return;
  }

  if (prompt.relates_type === "note") {
    await updateNote(prompt.relates_id, { projectId });
  } else if (prompt.relates_type === "task") {
    await updateTask(prompt.relates_id, { projectId });
  } else if (prompt.relates_type === "receipt") {
    await updateReceiptProject(prompt.relates_id, projectId);
  } else {
    return; // unknown target — don't resolve a prompt we couldn't act on
  }

  await answerPrompt(id, "Reclassified");
  revalidatePath("/inbox");
  revalidatePath("/notes");
  revalidatePath("/tasks");
  revalidatePath(`/projects/${projectId}`);
}

/** Re-transcribe a voice note whose first transcription failed. */
export async function inboxRetryVoiceAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await retryVoiceTranscription(id);
  revalidatePath("/inbox");
  revalidatePath("/notes");
}
