import type { Db } from "../supabase";
import type { Database } from "../types/database";
import { stripMarkdownToText } from "../domain/markdown";

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
 * capture pipeline).
 *
 * INVARIANT: body and its body_text plaintext shadow stay in sync on every
 * save — both writes below derive it, so search (search_vector) and the note
 * cards' previews see real text on every platform. Any OTHER code path that
 * writes notes.body must do the same (the capture pipeline sites do).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listNotes(
  db: Db,
  orgId: string,
  opts?: {
    projectId?: string;
    inboxOnly?: boolean;
    includeArchived?: boolean;
  },
): Promise<Note[]> {
  let query = db
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

/**
 * Prefix tsquery from user input: tokens lose everything but letters/digits
 * (which also disarms every tsquery operator — injection-safe), each gets a
 * `:*` prefix match, ANDed. "gro list" → "gro:* & list:*", so as-you-type
 * search matches partial words. Null when nothing searchable remains.
 */
function prefixTsQuery(q: string): string | null {
  const tokens = q
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((t) => t.length > 0)
    .slice(0, 8);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `${t}:*`).join(" & ");
}

/**
 * As-you-type notes search over search_vector (title + body_text shadow).
 * Bare `fts` (no `type`) is deliberate: PostgREST passes the string to
 * to_tsquery, which is what allows the :* prefix matches — plain/websearch
 * would escape them. Newest-edited first; archived excluded.
 */
export async function searchNotes(
  db: Db,
  orgId: string,
  q: string,
): Promise<Note[]> {
  const tsquery = prefixTsQuery(q);
  if (!tsquery) return [];

  const { data, error } = await db
    .from("notes")
    .select("*")
    .eq("org_id", orgId)
    .eq("archived", false)
    .textSearch("search_vector", tsquery, { config: "english" })
    .order("updated_at", { ascending: false })
    .limit(30);

  if (error) throw new Error(`searchNotes: ${error.message}`);
  return data;
}

export async function getNote(db: Db, orgId: string, id: string): Promise<Note | null> {
  if (!UUID_RE.test(id)) return null;

  const { data, error } = await db
    .from("notes")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`getNote: ${error.message}`);
  return data;
}

export async function createNote(
  db: Db,
  orgId: string,
  ownerId: string,
  input: {
    body: string;
    title?: string | null;
    projectId?: string | null;
    kind?: NoteKind;
    tags?: string[];
    pinned?: boolean;
  },
): Promise<Note> {
  const { data, error } = await db
    .from("notes")
    .insert({
      org_id: orgId,
      owner_id: ownerId,
      body: input.body,
      body_text: stripMarkdownToText(input.body),
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
  db: Db,
  orgId: string,
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
  const { data, error } = await db
    .from("notes")
    .update({
      ...(input.body !== undefined
        ? { body: input.body, body_text: stripMarkdownToText(input.body) }
        : {}),
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
  db: Db,
  orgId: string,
  id: string,
  archived: boolean,
): Promise<Note> {
  return updateNote(db, orgId, id, { archived });
}

/** A project's workflow note (kind='workflow'), if it has one. Prefers the
 * pinned / most recently updated one when several exist. */
export async function getWorkflowNote(
  db: Db,
  orgId: string,
  projectId: string,
): Promise<Note | null> {
  const { data, error } = await db
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
  db: Db,
  orgId: string,
  ownerId: string,
  projectId: string,
  entry: { date: string; question: string; answer: string },
): Promise<Note> {
  const block = `**${entry.date}** — ${entry.question}\n\n${entry.answer}`;

  const existing = await getWorkflowNote(db, orgId, projectId);
  if (existing) {
    const body = `${existing.body.trimEnd()}\n\n---\n\n${block}`;
    return updateNote(db, orgId, existing.id, { body });
  }

  return createNote(db, orgId, ownerId, {
    body: `# Workflow\n\n${block}`,
    title: "Workflow",
    projectId,
    kind: "workflow",
    pinned: true,
  });
}

export async function setNotePinned(
  db: Db,
  orgId: string,
  id: string,
  pinned: boolean,
): Promise<Note> {
  return updateNote(db, orgId, id, { pinned });
}
