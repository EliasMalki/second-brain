"use server";

import { revalidatePath } from "next/cache";
import { updateNote, setNoteArchived } from "@/lib/db/notes";
import { answerPrompt, dismissPrompt } from "@/lib/db/prompts";
import { updateTask } from "@/lib/db/tasks";
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
  await answerPrompt(id, answer);
  revalidatePath("/inbox");
}

/** Re-transcribe a voice note whose first transcription failed. */
export async function inboxRetryVoiceAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await retryVoiceTranscription(id);
  revalidatePath("/inbox");
  revalidatePath("/notes");
}
