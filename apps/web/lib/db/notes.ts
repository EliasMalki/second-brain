import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import * as shared from "@second-brain/shared/db/notes";
import type { Note, NoteKind } from "@second-brain/shared/db/notes";

/**
 * Thin Next adapter over the shared notes module: resolve the request's
 * client/org/user here, keep all query logic in @second-brain/shared/db/notes.
 */

export type { Note, NoteKind } from "@second-brain/shared/db/notes";

export async function listNotes(opts?: {
  projectId?: string;
  inboxOnly?: boolean;
  includeArchived?: boolean;
}): Promise<Note[]> {
  return shared.listNotes(createClient(), await getCurrentOrgId(), opts);
}

export async function getNote(id: string): Promise<Note | null> {
  return shared.getNote(createClient(), await getCurrentOrgId(), id);
}

export async function searchNotes(q: string): Promise<Note[]> {
  return shared.searchNotes(createClient(), await getCurrentOrgId(), q);
}

export async function createNote(input: {
  body: string;
  title?: string | null;
  projectId?: string | null;
  kind?: NoteKind;
  tags?: string[];
  pinned?: boolean;
}): Promise<Note> {
  const user = await requireUser();
  return shared.createNote(createClient(), await getCurrentOrgId(), user.id, input);
}

export async function updateNote(
  id: string,
  input: {
    body?: string;
    title?: string | null;
    projectId?: string | null;
    kind?: NoteKind;
    tags?: string[];
    pinned?: boolean;
    archived?: boolean;
  },
): Promise<Note> {
  return shared.updateNote(createClient(), await getCurrentOrgId(), id, input);
}

export async function setNoteArchived(id: string, archived: boolean): Promise<Note> {
  return shared.setNoteArchived(createClient(), await getCurrentOrgId(), id, archived);
}

export async function getWorkflowNote(projectId: string): Promise<Note | null> {
  return shared.getWorkflowNote(createClient(), await getCurrentOrgId(), projectId);
}

export async function appendToWorkflowNote(
  projectId: string,
  entry: { date: string; question: string; answer: string },
): Promise<Note> {
  const user = await requireUser();
  return shared.appendToWorkflowNote(
    createClient(),
    await getCurrentOrgId(),
    user.id,
    projectId,
    entry,
  );
}

export async function setNotePinned(id: string, pinned: boolean): Promise<Note> {
  return shared.setNotePinned(createClient(), await getCurrentOrgId(), id, pinned);
}
