import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import { todayISO } from "@/lib/dates";
import type { Database } from "@/lib/database.types";

export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type Priority = Database["public"]["Enums"]["priority"];
export type Effort = Database["public"]["Enums"]["effort"];
export type SetBy = Database["public"]["Enums"]["set_by"];

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
  /** Multiple projects (filter bar multi-select). Takes precedence over projectId. */
  projectIds?: string[];
  status?: TaskStatus;
  /** 'timed' = has a scheduled_for; 'undated' = backlog (no scheduled_for). */
  timing?: "timed" | "undated";
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

  if (opts?.projectIds && opts.projectIds.length > 0) {
    query = query.in("project_id", opts.projectIds);
  } else if (opts?.projectId) {
    query = query.eq("project_id", opts.projectId);
  }

  if (opts?.timing === "timed") query = query.not("scheduled_for", "is", null);
  else if (opts?.timing === "undated") query = query.is("scheduled_for", null);

  const { data, error } = await query;
  if (error) throw new Error(`listTasks: ${error.message}`);
  return data;
}

/**
 * Bulk field update over a set of task ids, org-scoped (RLS is the backstop).
 * Used by the Tasks list bulk-action bar: reschedule / priority / move project.
 * Completion is intentionally NOT here — it runs through completeTask so the
 * completion-anchored recurrence hook fires per task (see bulkCompleteTasks).
 */
export async function bulkUpdateTaskFields(
  ids: string[],
  fields: {
    projectId?: string | null;
    priority?: Priority;
    scheduledFor?: string | null;
  },
): Promise<void> {
  if (ids.length === 0) return;
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { error } = await supabase
    .from("tasks")
    .update({
      ...(fields.projectId !== undefined ? { project_id: fields.projectId } : {}),
      ...(fields.priority !== undefined
        ? { priority: fields.priority, priority_set_by: "user" as const }
        : {}),
      ...(fields.scheduledFor !== undefined
        ? { scheduled_for: fields.scheduledFor }
        : {}),
    })
    .eq("org_id", orgId)
    .in("id", ids);

  if (error) throw new Error(`bulkUpdateTaskFields: ${error.message}`);
}

/** Complete many tasks, preserving the per-task completion-anchored hook. */
export async function bulkCompleteTasks(ids: string[]): Promise<void> {
  for (const id of ids) await completeTask(id);
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

/**
 * The backlog pool (Home hub): open tasks with neither a schedule nor a due
 * date — the "stuff I could pull from" pool. Paused/archived projects excluded
 * like the day/week views. Priority first, then oldest, capped for the pool UI.
 */
export async function listBacklogTasks(limit = 50): Promise<Task[]> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("org_id", orgId)
    .eq("status", "open")
    .is("scheduled_for", null)
    .is("due_date", null)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`listBacklogTasks: ${error.message}`);
  return dropHiddenProjects(data, await hiddenProjectIds());
}

/**
 * Open tasks with no project (project_id IS NULL) — the task half of the Inbox
 * (BUILD_SPEC §9: the Inbox unions unfiled notes + unfiled tasks + prompts).
 * Newest first to match the feed ordering. NOT date-restricted (unlike the
 * backlog pool) — any unfiled open task needs a home.
 */
export async function listUnfiledTasks(): Promise<Task[]> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("org_id", orgId)
    .eq("status", "open")
    .is("project_id", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`listUnfiledTasks: ${error.message}`);
  return data;
}

/**
 * Done + cancelled tasks for the quiet "Completed" view. Most-recent first;
 * capped so the view stays light. Org-scoped like every read here.
 */
export async function listCompletedTasks(limit = 100): Promise<Task[]> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("org_id", orgId)
    .in("status", ["done", "cancelled"])
    .order("completed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`listCompletedTasks: ${error.message}`);
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
    /** Who set the priority. Defaults to 'user' when priority is given (a human
     *  edit); pass explicitly so command-undo can restore a prior 'system' value. */
    prioritySetBy?: SetBy;
    effort?: Effort | null;
    availability?: Availability | null;
    scheduledFor?: string | null;
    dueDate?: string | null;
    recurrenceId?: string | null;
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
        ? { priority: input.priority, priority_set_by: input.prioritySetBy ?? "user" }
        : {}),
      ...(input.effort !== undefined ? { effort: input.effort } : {}),
      ...(input.availability !== undefined
        ? { availability: input.availability }
        : {}),
      ...(input.scheduledFor !== undefined
        ? { scheduled_for: input.scheduledFor }
        : {}),
      ...(input.dueDate !== undefined ? { due_date: input.dueDate } : {}),
      ...(input.recurrenceId !== undefined
        ? { recurrence_id: input.recurrenceId }
        : {}),
    })
    .eq("org_id", orgId)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`updateTask: ${error.message}`);
  return data;
}

/** completed_at date + (interval × freq) as YYYY-MM-DD, for the next instance. */
function nextCompletionDate(
  completedAtISO: string,
  freq: Database["public"]["Enums"]["recur_freq"],
  interval: number,
): string {
  const d = new Date(completedAtISO);
  if (freq === "daily") d.setDate(d.getDate() + interval);
  else if (freq === "weekly") d.setDate(d.getDate() + 7 * interval);
  else if (freq === "monthly") d.setMonth(d.getMonth() + interval);
  else d.setFullYear(d.getFullYear() + interval);
  return d.toISOString().slice(0, 10);
}

/**
 * Completion is its own function (not a status update) on purpose: this is
 * where the completion-anchored recurrence hook lives (BUILD_SPEC §4), so
 * "mark done" stays one code path.
 *
 * NOTE: this is the ONLY completion-anchored logic in v0.5. The nightly
 * materializer (§3) handles anchor='fixed' exclusively — two separate paths.
 */
export async function completeTask(id: string): Promise<Task> {
  return (await completeTaskInternal(id)).task;
}

/**
 * Completion result for the command interpreter: the done task plus the next
 * instance a completion-anchored recurrence spawned (id + date), so a command
 * can report "next on [date]" and command-undo can delete that instance to make
 * the reversal exact.
 */
export type CompletionResult = {
  task: Task;
  spawned: { id: string; scheduledFor: string } | null;
};

export async function completeTaskWithSpawn(id: string): Promise<CompletionResult> {
  return completeTaskInternal(id);
}

async function completeTaskInternal(id: string): Promise<CompletionResult> {
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

  // §4 hook: a done task with a completion-anchored recurrence spawns its
  // next instance dated from completed_at. Failures here must not undo the
  // completion — log and move on.
  let spawned: CompletionResult["spawned"] = null;
  if (data.recurrence_id && data.completed_at) {
    try {
      spawned = await spawnNextCompletionInstance(data);
    } catch (e) {
      console.error("completion-anchored spawn failed:", e);
    }
  }

  return { task: data, spawned };
}

async function spawnNextCompletionInstance(
  done: Task,
): Promise<{ id: string; scheduledFor: string } | null> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data: rec, error } = await supabase
    .from("recurrences")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", done.recurrence_id!)
    .maybeSingle();
  if (error) throw new Error(`spawnNextCompletionInstance: ${error.message}`);

  // Fixed-anchor rules are the nightly materializer's job — not touched here.
  if (!rec || rec.anchor !== "completion" || !rec.active) return null;

  const next = nextCompletionDate(done.completed_at!, rec.freq, rec.interval);
  if (rec.until && next > rec.until) return null;

  const { data: inserted, error: insErr } = await supabase
    .from("tasks")
    .insert({
      org_id: orgId,
      owner_id: rec.owner_id,
      project_id: rec.project_id,
      record_id: rec.record_id,
      recurrence_id: rec.id,
      title: rec.title_template,
      priority: rec.default_priority,
      effort: rec.default_effort,
      availability: rec.default_availability,
      scheduled_for: next,
    })
    .select("id")
    .single();
  if (insErr) throw new Error(`spawnNextCompletionInstance: ${insErr.message}`);
  return { id: inserted.id, scheduledFor: next };
}

/**
 * Snooze an open task until a date (BUILD_SPEC: snoozed tasks resurface in the
 * nightly job when snooze_until <= today). Command-interpreter write path — the
 * UI hasn't needed a setter before. Reversible via unsnoozeTask.
 */
export async function snoozeTask(id: string, untilISO: string): Promise<Task> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("tasks")
    .update({ status: "snoozed" as const, snooze_until: untilISO })
    .eq("org_id", orgId)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`snoozeTask: ${error.message}`);
  return data;
}

/** Clear a snooze: back to open, snooze_until null. Mirror of the nightly resurface. */
export async function unsnoozeTask(id: string): Promise<Task> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("tasks")
    .update({ status: "open" as const, snooze_until: null })
    .eq("org_id", orgId)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`unsnoozeTask: ${error.message}`);
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

/**
 * Permanent hard-delete (the Completed view's "Delete permanently"). Org-scoped.
 * receipts.task_id is ON DELETE SET NULL; orphaned links are swept by the nightly
 * cleanup. Distinct from cancelTask (the reversible soft-delete on open tasks).
 */
export async function deleteTaskHard(id: string): Promise<void> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("org_id", orgId)
    .eq("id", id);

  if (error) throw new Error(`deleteTaskHard: ${error.message}`);
}
