import type { Db } from "../supabase";

/**
 * Unified search (BUILD_SPEC §2b): the brain = notes.search_vector UNION
 * tasks.search_vector. plainto_tsquery via PostgREST textSearch
 * (type: "plain") — no external search service. Org-scoped like everything.
 */

export type SearchHit = {
  type: "note" | "task";
  id: string;
  title: string;
  snippet: string;
  projectId: string | null;
  createdAt: string;
};

const LIMIT = 30;

export async function searchAll(db: Db, orgId: string, query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  const [notesRes, tasksRes] = await Promise.all([
    db
      .from("notes")
      .select("id, title, body, project_id, created_at")
      .eq("org_id", orgId)
      .eq("archived", false)
      .textSearch("search_vector", q, { type: "plain", config: "english" })
      .limit(LIMIT),
    db
      .from("tasks")
      .select("id, title, body, project_id, created_at, status")
      .eq("org_id", orgId)
      .neq("status", "cancelled")
      .textSearch("search_vector", q, { type: "plain", config: "english" })
      .limit(LIMIT),
  ]);

  if (notesRes.error) throw new Error(`search notes: ${notesRes.error.message}`);
  if (tasksRes.error) throw new Error(`search tasks: ${tasksRes.error.message}`);

  const hits: SearchHit[] = [
    ...notesRes.data.map(
      (n): SearchHit => ({
        type: "note",
        id: n.id,
        title: n.title ?? n.body.replace(/\s+/g, " ").slice(0, 80),
        snippet: n.body.replace(/\s+/g, " ").slice(0, 160),
        projectId: n.project_id,
        createdAt: n.created_at,
      }),
    ),
    ...tasksRes.data.map(
      (t): SearchHit => ({
        type: "task",
        id: t.id,
        title: t.title,
        snippet: (t.body ?? "").replace(/\s+/g, " ").slice(0, 160),
        projectId: t.project_id,
        createdAt: t.created_at,
      }),
    ),
  ];

  // newest first across both sources
  return hits
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, LIMIT);
}
