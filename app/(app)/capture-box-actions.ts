"use server";

import { revalidatePath } from "next/cache";
import { captureText, captureOutcome, type CaptureOutcome } from "@/lib/db/captures";
import { updateTask } from "@/lib/db/tasks";
import { updateNote } from "@/lib/db/notes";
import { listProjects } from "@/lib/db/projects";

export type CaptureState = { error?: string; noteId?: string };

export async function captureAction(
  _prev: CaptureState,
  formData: FormData,
): Promise<CaptureState> {
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { error: "Nothing to capture." };

  try {
    const { noteId } = await captureText(text);
    revalidatePath("/notes");
    return { noteId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Capture failed." };
  }
}

/** Poll where a just-captured item landed (for the re-sort panel). */
export async function getCaptureOutcome(captureId: string): Promise<CaptureOutcome> {
  return captureOutcome(captureId);
}

/**
 * Re-file the just-captured item to a project (null = back to Inbox). The user's
 * pick is authoritative — it overrides whatever the classifier chose. Returns
 * the new project name for the panel label.
 */
export async function refileCaptureItem(input: {
  kind: "task" | "note";
  id: string;
  projectId: string | null;
}): Promise<{ ok: boolean; projectName: string | null }> {
  try {
    if (input.kind === "task") {
      await updateTask(input.id, { projectId: input.projectId });
    } else {
      await updateNote(input.id, { projectId: input.projectId });
    }
    const name = input.projectId
      ? (await listProjects()).find((p) => p.id === input.projectId)?.name ?? null
      : null;
    revalidatePath("/tasks");
    revalidatePath("/inbox");
    revalidatePath("/notes");
    return { ok: true, projectName: name };
  } catch {
    return { ok: false, projectName: null };
  }
}
