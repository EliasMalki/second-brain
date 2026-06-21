import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import { listProjects } from "@/lib/db/projects";
import { todayISO, addDaysISO } from "@/lib/dates";
import type { TaskStatus } from "@/lib/db/tasks";
import type {
  CandidateProject,
  CandidateTask,
  Interpretation,
} from "@/lib/commands/types";

/**
 * Capture command interpreter — candidate fetch + the confidence assessment
 * (step 2).
 *
 * Two responsibilities, both deterministic and org-scoped:
 *
 * 1. fetchCandidates(): build the set of things a command could refer to —
 *    the user's actionable tasks (open/snoozed/waiting), a little recently-
 *    completed context (so an "already done" state check can fire), and recent
 *    notes (so "that's a note, not a task" can fire). This is what interpret()
 *    matches against; every query filters by org_id with RLS as the backstop.
 *
 * 2. resolveMatch(): turn the model's ranked candidates into a decision —
 *    SINGLE (one clear winner → caller may act), AMBIGUOUS (several plausible →
 *    caller asks which), or NONE (weak/no match → caller shows the closest).
 *    This is the spec's "confident = ONE unambiguous match" rule, in code, so
 *    it's testable and the model never decides whether to act on its own.
 */

const ACTIONABLE_STATUSES: TaskStatus[] = ["open", "snoozed", "waiting"];
const RECENT_DONE_DAYS = 14;
const RECENT_DONE_LIMIT = 30;
const RECENT_NOTES_LIMIT = 40;

// Confidence thresholds for the act-vs-confirm rule.
const CONFIDENT = 0.75; // a lone winner must clear this to be "confident"
const PLAUSIBLE = 0.4; // below this, a match doesn't count as a real candidate
const LEAD = 0.2; // a winner must lead the runner-up by at least this much

export type Candidates = {
  today: string;
  tasks: CandidateTask[];
  projects: CandidateProject[];
  /** id → candidate, for resolving the model's returned ids back to rows. */
  byId: Map<string, CandidateTask>;
};

function noteTitle(title: string | null, body: string): string {
  const t = (title ?? "").trim();
  if (t) return t;
  const firstLine = body.split("\n").find((l) => l.trim()) ?? "";
  return firstLine.trim().slice(0, 80) || "(untitled note)";
}

/**
 * Fetch everything a command could target, org-scoped. Tasks are the primary
 * match set; recent-done tasks and recent notes ride along only so the state
 * checks downstream have something to point at.
 */
export async function fetchCandidates(): Promise<Candidates> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();
  const today = todayISO();

  const projectsAll = await listProjects({ includeArchived: true });
  const nameById = new Map(projectsAll.map((p) => [p.id, p.name]));

  const [actionableRes, doneRes, notesRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, status, project_id, scheduled_for")
      .eq("org_id", orgId)
      .in("status", ACTIONABLE_STATUSES),
    supabase
      .from("tasks")
      .select("id, title, status, project_id, scheduled_for")
      .eq("org_id", orgId)
      .eq("status", "done")
      .gte("completed_at", `${addDaysISO(today, -RECENT_DONE_DAYS)}T00:00:00`)
      .order("completed_at", { ascending: false })
      .limit(RECENT_DONE_LIMIT),
    supabase
      .from("notes")
      .select("id, title, body, project_id, created_at")
      .eq("org_id", orgId)
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .limit(RECENT_NOTES_LIMIT),
  ]);

  if (actionableRes.error) throw new Error(`fetchCandidates tasks: ${actionableRes.error.message}`);
  if (doneRes.error) throw new Error(`fetchCandidates done: ${doneRes.error.message}`);
  if (notesRes.error) throw new Error(`fetchCandidates notes: ${notesRes.error.message}`);

  const taskRow = (r: {
    id: string;
    title: string;
    status: string;
    project_id: string | null;
    scheduled_for: string | null;
  }): CandidateTask => ({
    id: r.id,
    title: r.title,
    status: r.status,
    project_id: r.project_id,
    project_name: r.project_id ? nameById.get(r.project_id) ?? null : null,
    scheduled_for: r.scheduled_for,
    is_note: false,
  });

  const tasks: CandidateTask[] = [
    ...actionableRes.data.map(taskRow),
    ...doneRes.data.map(taskRow),
    ...notesRes.data.map((n) => ({
      id: n.id,
      title: noteTitle(n.title, n.body),
      status: "note",
      project_id: n.project_id,
      project_name: n.project_id ? nameById.get(n.project_id) ?? null : null,
      scheduled_for: null,
      is_note: true,
    })),
  ];

  // Destinations for refile / project reads: anything not archived.
  const projects: CandidateProject[] = projectsAll
    .filter((p) => p.status !== "archived")
    .map((p) => ({ id: p.id, name: p.name, aliases: p.aliases }));

  return { today, tasks, projects, byId: new Map(tasks.map((t) => [t.id, t])) };
}

export type MatchResolution =
  | { kind: "single"; task: CandidateTask }
  | { kind: "ambiguous"; candidates: CandidateTask[] }
  | { kind: "none"; closest: CandidateTask[] };

const MAX_CHOICES = 5;

/** A few actionable tasks to show when nothing matched at all. */
function fallbackClosest(candidates: Candidates, n = 3): CandidateTask[] {
  return candidates.tasks.filter((t) => t.status === "open" && !t.is_note).slice(0, n);
}

/**
 * The confidence rule, in code. "Confident" = exactly one clear winner: its
 * confidence clears CONFIDENT, and it leads any runner-up by at least LEAD.
 * Two close matches, fuzzy matches, or nothing plausible are NOT confident —
 * the caller confirms instead of guessing.
 *
 * Single-target only. Batch resolution (is_batch) is handled separately in the
 * batch step; callers should branch on interp.isBatch before calling this.
 */
export function resolveMatch(
  interp: Interpretation,
  candidates: Candidates,
): MatchResolution {
  const matches = interp.taskMatches
    .map((m) => ({ task: candidates.byId.get(m.id), confidence: m.confidence }))
    .filter((m): m is { task: CandidateTask; confidence: number } => Boolean(m.task))
    .sort((a, b) => b.confidence - a.confidence);

  const plausible = matches.filter((m) => m.confidence >= PLAUSIBLE);

  if (plausible.length === 0) {
    // Weak/no match: surface the closest the model offered, else a few open tasks.
    const closest = matches.slice(0, 3).map((m) => m.task);
    return { kind: "none", closest: closest.length ? closest : fallbackClosest(candidates) };
  }

  const [top, second] = plausible;
  const clearWinner =
    top.confidence >= CONFIDENT && (!second || top.confidence - second.confidence >= LEAD);

  if (clearWinner) return { kind: "single", task: top.task };

  return { kind: "ambiguous", candidates: plausible.slice(0, MAX_CHOICES).map((m) => m.task) };
}
