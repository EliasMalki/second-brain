"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createNote,
  setNoteArchived,
  setNotePinned,
  updateNote,
  type Note,
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

/* ---------------------------------------------------------------------------
   Workspace actions — used by the three-pane Notes view (notes-workspace.tsx).
   Unlike the form actions above, these are called directly from client event
   handlers and RETURN data so the workspace can patch its local state without a
   full page reload. They still revalidatePath so other views stay fresh.
--------------------------------------------------------------------------- */

/** Apple-Notes-style "+ New note": create an empty note in the given folder. */
export async function createBlankNoteAction(
  projectId: string | null,
): Promise<Note> {
  const note = await createNote({ body: "", projectId });
  revalidatePath("/notes");
  return note;
}

/** Debounced auto-save from the editor pane. Returns the new updated_at. */
export async function saveNoteAction(
  id: string,
  patch: { title: string | null; body: string },
): Promise<{ updated_at: string }> {
  const note = await updateNote(id, { title: patch.title, body: patch.body });
  revalidatePath("/notes");
  revalidatePath(`/notes/${id}`);
  return { updated_at: note.updated_at };
}

/** Move a note between folders (set project_id; null = Inbox/unfiled). */
export async function moveNoteAction(
  id: string,
  projectId: string | null,
): Promise<void> {
  await updateNote(id, { projectId });
  revalidatePath("/notes");
  revalidatePath(`/notes/${id}`);
}

/** Pin/unpin without going through a form (workspace calls it directly). */
export async function setPinAction(id: string, pinned: boolean): Promise<void> {
  await setNotePinned(id, pinned);
  revalidatePath("/notes");
  revalidatePath(`/notes/${id}`);
}

/** Archive without the redirect that archiveNoteAction does (stay in place). */
export async function archiveNoteWorkspaceAction(id: string): Promise<void> {
  await setNoteArchived(id, true);
  revalidatePath("/notes");
}

/** Unarchive from the workspace (powers the "Note archived · Undo" toast). */
export async function unarchiveNoteWorkspaceAction(id: string): Promise<void> {
  await setNoteArchived(id, false);
  revalidatePath("/notes");
}
