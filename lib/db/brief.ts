import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import {
  listOverdueTasks,
  listTasksScheduledBetween,
  partitionByAvailability,
  type Task,
  type Priority,
} from "@/lib/db/tasks";
import { listProjects } from "@/lib/db/projects";
import { isBusinessHoursNow, todayISO } from "@/lib/dates";
import type { Database } from "@/lib/database.types";

export type BriefRow = Database["public"]["Tables"]["briefs_log"]["Row"];

/**
 * Recent brief-log rows for the admin view (§3 step 5 health check). Lets the
 * owner see at a glance whether the nightly job is still generating + emailing
 * the brief, without opening Supabase. Org-scoped like everything else.
 */
export async function listRecentBriefs(limit = 30): Promise<BriefRow[]> {
  const user = await requireUser();
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("briefs_log")
    .select("*")
    .eq("org_id", orgId)
    .eq("owner_id", user.id)
    .order("generated_for", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`listRecentBriefs: ${error.message}`);
  return data;
}

/**
 * In-app first-open-of-day brief (BUILD_SPEC §5). The nightly job usually
 * pre-generates today's row (and emails it); if the user opens the app first,
 * we generate the same content here. Either way the brief is SHOWN at most
 * once per day — shown_at records the first open.
 *
 * Content payload shape matches the email (supabase/functions/_shared/
 * brief.ts): by_priority A→D, quick_wins, availability-aware.
 */

export type BriefPayload = {
  by_priority: Record<Priority, BriefTask[]>;
  quick_wins: BriefTask[];
  hidden_business_hours: number;
  project_names: Record<string, string>;
  // v1 feature 3: today's calendar events, populated by the nightly job for the
  // EMAIL brief. The in-app Today view shows events live (CalendarToday), so the
  // in-app BriefCard ignores this field.
  calendar_events?: { time: string; title: string; location: string | null }[];
};

type BriefTask = {
  id: string;
  title: string;
  priority: Priority;
  effort: string | null;
  project_id: string | null;
};

function toBriefTask(t: Task): BriefTask {
  return {
    id: t.id,
    title: t.title,
    priority: t.priority,
    effort: t.effort,
    project_id: t.project_id,
  };
}

/**
 * Build today's brief content (A→D + quick wins, availability-aware). Pure
 * read, no side effects — unlike getFirstOpenBrief it never inserts a
 * briefs_log row or stamps shown_at, so the command interpreter's "brief on
 * demand" can reuse the EXACT same content as the email/in-app brief without
 * burning the once-a-day show.
 */
export async function generatePayload(): Promise<{
  payload: BriefPayload;
  taskIds: string[];
}> {
  const today = todayISO();
  const [overdue, todays, projects] = await Promise.all([
    listOverdueTasks(),
    listTasksScheduledBetween(today, today),
    listProjects({ includeArchived: true }),
  ]);

  const { available, offHours } = await partitionByAvailability(
    [...overdue, ...todays],
    isBusinessHoursNow(),
  );

  const byPriority: Record<Priority, BriefTask[]> = { A: [], B: [], C: [], D: [] };
  for (const t of available) byPriority[t.priority].push(toBriefTask(t));

  const projectNames: Record<string, string> = {};
  for (const p of projects) projectNames[p.id] = p.name;

  return {
    payload: {
      by_priority: byPriority,
      quick_wins: available.filter((t) => t.effort === "quick").map(toBriefTask),
      hidden_business_hours: offHours.length,
      project_names: projectNames,
    },
    taskIds: available.map((t) => t.id),
  };
}

/**
 * Returns today's brief payload when this is the first open of the day,
 * null otherwise. Generates + inserts the briefs_log row if the nightly job
 * hasn't already; stamps shown_at so the brief shows exactly once.
 */
export async function getFirstOpenBrief(): Promise<BriefPayload | null> {
  const user = await requireUser();
  const orgId = await getCurrentOrgId();
  const supabase = createClient();
  const today = todayISO();

  const { data: existing, error } = await supabase
    .from("briefs_log")
    .select("id, payload, shown_at")
    .eq("org_id", orgId)
    .eq("owner_id", user.id)
    .eq("kind", "daily")
    .eq("generated_for", today)
    .maybeSingle();
  if (error) throw new Error(`getFirstOpenBrief: ${error.message}`);

  if (existing) {
    if (existing.shown_at) return null; // already seen today
    const { error: upErr } = await supabase
      .from("briefs_log")
      .update({ shown_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .eq("id", existing.id);
    if (upErr) throw new Error(`getFirstOpenBrief mark: ${upErr.message}`);
    return existing.payload as BriefPayload;
  }

  // Nightly hasn't run (or this is a brand-new day) — generate in-app.
  const { payload, taskIds } = await generatePayload();
  const { error: insErr } = await supabase.from("briefs_log").insert({
    org_id: orgId,
    owner_id: user.id,
    kind: "daily" as const,
    generated_for: today,
    task_ids: taskIds,
    payload,
    shown_at: new Date().toISOString(),
  });
  if (insErr) {
    // 23505: the nightly job won the race — treat as already generated
    if (!insErr.message.includes("duplicate")) {
      throw new Error(`getFirstOpenBrief insert: ${insErr.message}`);
    }
    return null;
  }
  return payload;
}
