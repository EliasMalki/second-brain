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

async function generatePayload(): Promise<{
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
