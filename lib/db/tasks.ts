import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import { todayISO } from "@/lib/dates";
import type { Database } from "@/lib/database.types";

export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type Priority = Database["public"]["Enums"]["priority"];
export type Effort = Database["public"]["Enums"]["effort"];

/**
 * Tasks data access. All reads filter by org_id; all writes set org_id +
 * owner_id. RLS is the backstop, the explicit scope here is the rule.
 *
 * v0.5 surface: title, body (markdown), project_id, priority, effort,
 * scheduled_for, due_date, and the open/done/cancelled transitions.
 * Deferred on purpose: record_id (records step), recurrence_id + the
 * completion-anchored hook (recurrence step), snoozed/waiting mechanics
 * (nightly job step), start_at/end_at appointments, assignee_id (v2).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listTasks(opts?: {
  projectId?: string;
  status?: TaskStatus;
}): Promise<Task[]> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  let query = supabase
    .from("tasks")
    .select("*")
    .eq("org_id", orgId)
    .eq("status", opts?.status ?? "open")
    .order("scheduled_for", { ascending: true, nullsFirst: false })
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  if (opts?.projectId) {
    query = query.eq("project_id", opts.projectId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`listTasks: ${error.message}`);
  return data;
}

/**
 * Project ids the day/week views must hide: paused (excluded from briefs per
 * BUILD_SPEC §5) and archived. Tasks with no project (Inbox) are never hidden.
 */
async function hiddenProjectIds(): Promise<Set<string>> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("org_id", orgId)
    .in("status", ["paused", "archived"]);

  if (error) throw new Error(`hiddenProjectIds: ${error.message}`);
  return new Set(data.map((p) => p.id));
}

function dropHiddenProjects(tasks: Task[], hidden: Set<string>): Task[] {
  return tasks.filter((t) => !t.project_id || !hidden.has(t.project_id));
}

export type Availability = Database["public"]["Enums"]["availability"];

/**
 * Availability resolution (BUILD_SPEC §5 time-awareness): a task's effective
 * availability is its own value, else its project's availability_default,
 * else 'anytime'. Shared by the Today view and the daily brief so the two
 * never disagree about what "fits right now".
 */
export async function partitionByAvailability(
  tasks: Task[],
  withinBusinessHours: boolean,
): Promise<{ available: Task[]; offHours: Task[] }> {
  if (withinBusinessHours || tasks.length === 0) {
    return { available: tasks, offHours: [] };
  }

  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("projects")
    .select("id, availability_default")
    .eq("org_id", orgId);
  if (error) throw new Error(`partitionByAvailability: ${error.message}`);

  const projectDefault = new Map(data.map((p) => [p.id, p.availability_default]));
  const effective = (t: Task): Availability =>
    t.availability ??
    (t.project_id ? projectDefault.get(t.project_id) ?? "anytime" : "anytime");

  return {
    available: tasks.filter((t) => effective(t) !== "business_hours"),
    offHours: tasks.filter((t) => effective(t) === "business_hours"),
  };
}

/** Open tasks scheduled before today (the Overdue band). Paused/archived excluded. */
export async function listOverdueTasks(): Promise<Task[]> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("org_id", orgId)
    .eq("status", "open")
    .lt("scheduled_for", todayISO())
    .order("priority", { ascending: true })
    .order("scheduled_for", { ascending: true });

  if (error) throw new Error(`listOverdueTasks: ${error.message}`);
  return dropHiddenProjects(data, await hiddenProjectIds());
}

/**
 * Open tasks scheduled within [startISO, endISO] inclusive. Paused/archived
 * excluded. Drives both Today (start = end = today) and Week.
 */
export async function listTasksScheduledBetween(
  startISO: string,
  endISO: string,
): Promise<Task[]> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("org_id", orgId)
    .eq("status", "open")
    .gte("scheduled_for", startISO)
    .lte("scheduled_for", endISO)
    .order("scheduled_for", { ascending: true })
    .order("priority", { ascending: true });

  if (error) throw new Error(`listTasksScheduledBetween: ${error.message}`);
  return dropHiddenProjects(data, await hiddenProjectIds());
}

export async function getTask(id: string): Promise<Task | null> {
  if (!UUID_RE.test(id)) return null;

  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`getTask: ${error.message}`);
  return data;
}

export async function createTask(input: {
  title: string;
  body?: string;
  projectId?: string | null;
  priority?: Priority;
  effort?: Effort | null;
  scheduledFor?: string | null;
  dueDate?: string | null;
}): Promise<Task> {
  const user = await requireUser();
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      org_id: orgId,
      owner_id: user.id,
      title: input.title,
      body: input.body || null,
      project_id: input.projectId || null,
      // priority given by the user in a form => user-set, not system-set
      ...(input.priority
        ? { priority: input.priority, priority_set_by: "user" as const }
        : {}),
      effort: input.effort ?? null,
      scheduled_for: input.scheduledFor || null,
      due_date: input.dueDate || null,
      source: "app" as const,
    })
    .select()
    .single();

  if (error) throw new Error(`createTask: ${error.message}`);
  return data;
}

export async function updateTask(
  id: string,
  input: {
    title?: string;
    body?: string | null;
    projectId?: string | null;
    priority?: Priority;
    effort?: Effort | null;
    scheduledFor?: string | null;
    dueDate?: string | null;
  },
): Promise<Task> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("tasks")
    .update({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.projectId !== undefined
        ? { project_id: input.projectId }
        : {}),
      ...(input.priority !== undefined
        ? { priority: input.priority, priority_set_by: "user" as const }
        : {}),
      ...(input.effort !== undefined ? { effort: input.effort } : {}),
      ...(input.scheduledFor !== undefined
        ? { scheduled_for: input.scheduledFor }
        : {}),
      ...(input.dueDate !== undefined ? { due_date: input.dueDate } : {}),
    })
    .eq("org_id", orgId)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`updateTask: ${error.message}`);
  return data;
}

/**
 * Completion is its own function (not a status update) on purpose: the
 * completion-anchored recurrence hook (BUILD_SPEC §4, deferred) will be added
 * here, so "mark done" stays one code path.
 */
export async function completeTask(id: string): Promise<Task> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("tasks")
    .update({ status: "done" as const, completed_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`completeTask: ${error.message}`);
  return data;
}

export async function reopenTask(id: string): Promise<Task> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("tasks")
    .update({ status: "open" as const, completed_at: null })
    .eq("org_id", orgId)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`reopenTask: ${error.message}`);
  return data;
}

export async function cancelTask(id: string): Promise<Task> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("tasks")
    .update({ status: "cancelled" as const })
    .eq("org_id", orgId)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`cancelTask: ${error.message}`);
  return data;
}
