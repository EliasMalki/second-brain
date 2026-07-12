import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import type { Database } from "@second-brain/shared/types/database";

export type Note = Database["public"]["Tables"]["notes"]["Row"];
export type NoteKind = Database["public"]["Enums"]["note_kind"];

/**
 * Notes data access. All reads filter by org_id; all writes set org_id +
 * owner_id. RLS is the backstop, the explicit scope here is the rule.
 *
 * project_id NULL = Inbox (an unfiled note) — the same slot the capture
 * pipeline drops low-confidence items into (BUILD_SPEC §4/§9).
 *
 * v0.5 surface: title, body (markdown), project_id, kind, tags, pinned,
 * archived. Deferred (schema defaults): record_id (records step),
 * content_format (markdown only), source/original_text/reviewed_at (set by the
 * capture pipeline), body_text (left null — search_vector falls back to body).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listNotes(opts?: {
  projectId?: string;
  inboxOnly?: boolean;
  includeArchived?: boolean;
}): Promise<Note[]> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  let query = supabase
    .from("notes")
    .select("*")
    .eq("org_id", orgId)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false });

  if (opts?.inboxOnly) query = query.is("project_id", null);
  if (opts?.projectId) query = query.eq("project_id", opts.projectId);
  if (!opts?.includeArchived) query = query.eq("archived", false);

  const { data, error } = await query;
  if (error) throw new Error(`listNotes: ${error.message}`);
  return data;
}

export async function getNote(id: string): Promise<Note | null> {
  if (!UUID_RE.test(id)) return null;

  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`getNote: ${error.message}`);
  return data;
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
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("notes")
    .insert({
      org_id: orgId,
      owner_id: user.id,
      body: input.body,
      title: input.title || null,
      project_id: input.projectId || null,
      kind: input.kind ?? "quick",
      tags: input.tags ?? [],
      pinned: input.pinned ?? false,
    })
    .select()
    .single();

  if (error) throw new Error(`createNote: ${error.message}`);
  return data;
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
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("notes")
    .update({
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.projectId !== undefined
        ? { project_id: input.projectId }
        : {}),
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
      ...(input.archived !== undefined ? { archived: input.archived } : {}),
    })
    .eq("org_id", orgId)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`updateNote: ${error.message}`);
  return data;
}

export async function setNoteArchived(
  id: string,
  archived: boolean,
): Promise<Note> {
  return updateNote(id, { archived });
}

/** A project's workflow note (kind='workflow'), if it has one. Prefers the
 * pinned / most recently updated one when several exist. */
export async function getWorkflowNote(
  projectId: string,
): Promise<Note | null> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("org_id", orgId)
    .eq("project_id", projectId)
    .eq("kind", "workflow")
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getWorkflowNote: ${error.message}`);
  return data;
}

/**
 * Append a small dated entry to a project's workflow note, creating the note if
 * it doesn't exist yet (v1 feature 4: this is how answers to debrief questions
 * accrue into a cloneable playbook). Returns the workflow note so the caller can
 * link to it.
 */
export async function appendToWorkflowNote(
  projectId: string,
  entry: { date: string; question: string; answer: string },
): Promise<Note> {
  const block = `**${entry.date}** — ${entry.question}\n\n${entry.answer}`;

  const existing = await getWorkflowNote(projectId);
  if (existing) {
    const body = `${existing.body.trimEnd()}\n\n---\n\n${block}`;
    return updateNote(existing.id, { body });
  }

  return createNote({
    body: `# Workflow\n\n${block}`,
    title: "Workflow",
    projectId,
    kind: "workflow",
    pinned: true,
  });
}

export async function setNotePinned(
  id: string,
  pinned: boolean,
): Promise<Note> {
  return updateNote(id, { pinned });
}
