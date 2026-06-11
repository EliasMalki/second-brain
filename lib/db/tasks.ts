import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
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
