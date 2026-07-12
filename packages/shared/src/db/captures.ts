import type { Db } from "../supabase";
import { listProjects } from "./projects";

/**
 * Capture reads shared across surfaces (BUILD_SPEC §4/§9). The capture WRITE
 * pipeline (captureText, voice transcription, the fire-and-forget classifier
 * invoke) lives in each app — it orchestrates platform/server-only pieces
 * (service-role env, transcription APIs, storage uploads). What lives here is
 * the platform-agnostic read side: where a capture landed, and the
 * classifier's surviving suggestions for Inbox items.
 */

/**
 * Where a capture ultimately landed, for the capture box's "land then re-sort"
 * panel. Polled by id after a capture: `settled` flips true once the async
 * classifier has run (interpretation populated), at which point the capture
 * points to a task or a note and we can report its project. Org-scoped; also
 * returns the project list so the client's re-sort picker needs no extra fetch.
 */
export type CaptureOutcome = {
  settled: boolean;
  kind: "task" | "note" | null;
  itemId: string | null;
  projectId: string | null;
  projectName: string | null;
  projects: { id: string; name: string }[];
};

export async function captureOutcome(
  db: Db,
  orgId: string,
  captureId: string,
): Promise<CaptureOutcome> {
  const projects = (await listProjects(db, orgId)).map((p) => ({ id: p.id, name: p.name }));
  const nameById = new Map(projects.map((p) => [p.id, p.name]));
  const base = { kind: null, itemId: null, projectId: null, projectName: null, projects };

  const { data: cap, error } = await db
    .from("captures")
    .select("status, interpretation, result_kind, result_id")
    .eq("org_id", orgId)
    .eq("id", captureId)
    .maybeSingle();
  if (error) throw new Error(`captureOutcome: ${error.message}`);
  // Gone (e.g. deleted) → nothing to re-sort; treat as settled.
  if (!cap) return { settled: true, ...base };
  // Classifier hasn't run yet — keep polling.
  if (cap.interpretation === null) return { settled: false, ...base };

  if (cap.result_kind === "task" && cap.result_id) {
    const { data: t } = await db
      .from("tasks")
      .select("project_id")
      .eq("org_id", orgId)
      .eq("id", cap.result_id)
      .maybeSingle();
    const pid = t?.project_id ?? null;
    return { settled: true, kind: "task", itemId: cap.result_id, projectId: pid, projectName: pid ? nameById.get(pid) ?? null : null, projects };
  }
  if (cap.result_kind === "note" && cap.result_id) {
    const { data: n } = await db
      .from("notes")
      .select("project_id")
      .eq("org_id", orgId)
      .eq("id", cap.result_id)
      .maybeSingle();
    const pid = n?.project_id ?? null;
    return { settled: true, kind: "note", itemId: cap.result_id, projectId: pid, projectName: pid ? nameById.get(pid) ?? null : null, projects };
  }
  return { settled: true, ...base };
}

/**
 * The classifier's best-guess project for items still sitting in the Inbox.
 *
 * classify-capture only auto-files at confidence >= 0.6; below that it leaves
 * the unsorted note/task in place but its suggestion survives on the capture
 * row (`interpretation.applied_project_id` + `.confidence`, already validated
 * against the org's projects when written). This read lets the Inbox surface
 * that guess as a one-tap "File under X" — no new pipeline, no schema change.
 *
 * Org-scoped like every capture read; interpretation is parsed defensively
 * (it's free-form jsonb — failed transcriptions store an error object here).
 */
export type FilingSuggestion = { projectId: string; confidence: number };

export async function listFilingSuggestions(
  db: Db,
  orgId: string,
  input: {
    noteIds: string[];
    taskIds: string[];
  },
): Promise<{
  notes: Record<string, FilingSuggestion>;
  tasks: Record<string, FilingSuggestion>;
}> {
  const ids = [...input.noteIds, ...input.taskIds];
  if (ids.length === 0) return { notes: {}, tasks: {} };

  const { data, error } = await db
    .from("captures")
    .select("result_id, result_kind, interpretation")
    .eq("org_id", orgId)
    .in("result_kind", ["note", "task"])
    .in("result_id", ids)
    .not("interpretation", "is", null);
  if (error) throw new Error(`listFilingSuggestions: ${error.message}`);

  const notes: Record<string, FilingSuggestion> = {};
  const tasks: Record<string, FilingSuggestion> = {};
  for (const row of data ?? []) {
    if (!row.result_id) continue;
    const i = row.interpretation as {
      applied_project_id?: unknown;
      confidence?: unknown;
    };
    if (typeof i?.applied_project_id !== "string") continue;
    const suggestion: FilingSuggestion = {
      projectId: i.applied_project_id,
      confidence: typeof i.confidence === "number" ? i.confidence : 0,
    };
    (row.result_kind === "note" ? notes : tasks)[row.result_id] = suggestion;
  }
  return { notes, tasks };
}

/**
 * Vocabulary steering (BUILD_SPEC: improve recognition of domain words). Feed
 * the transcriber the user's project names + aliases plus a small jargon seed,
 * so part names / supplier names / "RBQ" / "epoxy" come back spelled right.
 * Pulled from the org's projects at request time — never hardcoded.
 */
export function buildVocabPrompt(
  projects: { name: string; aliases: string[] }[],
): string {
  const terms = new Set<string>();
  for (const p of projects) {
    if (p.name) terms.add(p.name.trim());
    for (const a of p.aliases ?? []) if (a?.trim()) terms.add(a.trim());
  }
  // A few domain terms the recognizer otherwise mangles.
  for (const seed of ["RBQ", "epoxy"]) terms.add(seed);

  const vocab = [...terms].filter(Boolean).join(", ");
  return vocab
    ? `A short personal voice note about the user's projects and tasks. Proper nouns and domain terms that may appear: ${vocab}.`
    : "A short personal voice note about the user's projects and tasks.";
}
