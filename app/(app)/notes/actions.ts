"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createNote,
  setNoteArchived,
  setNotePinned,
  updateNote,
  type NoteKind,
} from "@/lib/db/notes";
import { parseTags } from "@/lib/tags";

export type FormState = { error?: string };

const KINDS: NoteKind[] = [
  "quick",
  "journal",
  "reference",
  "meeting",
  "workflow",
];

function parseNoteForm(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const projectId = String(formData.get("project_id") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const tags = parseTags(String(formData.get("tags") ?? ""));
  const pinned = formData.get("pinned") === "on";

  return {
    title: title || null,
    body,
    projectId: projectId || null,
    kind: KINDS.includes(kind as NoteKind) ? (kind as NoteKind) : "quick",
    tags,
    pinned,
  };
}

export async function createNoteAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = parseNoteForm(formData);
  if (!input.body) return { error: "Note body is required." };

  try {
    await createNote(input);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create." };
  }

  revalidatePath("/notes");
  return {};
}

export async function updateNoteAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  const input = parseNoteForm(formData);

  if (!id) return { error: "Missing note id." };
  if (!input.body) return { error: "Note body is required." };

  try {
    await updateNote(id, input);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to save." };
  }

  revalidatePath("/notes");
  revalidatePath(`/notes/${id}`);
  return {};
}

/** Manual filing: move an unsorted (Inbox) note into a project. */
export async function fileNoteAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const projectId = String(formData.get("project_id") ?? "");
  if (!id || !projectId) return;
  await updateNote(id, { projectId });
  revalidatePath("/notes");
}

export async function togglePinAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const pinned = formData.get("pinned") === "1";
  if (!id) return;
  await setNotePinned(id, pinned);
  revalidatePath("/notes");
  revalidatePath(`/notes/${id}`);
}

export async function archiveNoteAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await setNoteArchived(id, true);
  revalidatePath("/notes");
  redirect("/notes");
}

export async function unarchiveNoteAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await setNoteArchived(id, false);
  revalidatePath("/notes");
  revalidatePath(`/notes/${id}`);
}
