import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import { addDaysISO, todayISO } from "@second-brain/shared/domain/dates";
import { logActivity, type ActivityAction, type ActivityActor } from "@/lib/db/activity";
import type { Database } from "@second-brain/shared/types/database";

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
 * Open tasks that fall anywhere in [startISO, endISO] (inclusive calendar days)
 * for the Calendar view — a task lands in the window if its timed `start_at`,
 * its `scheduled_for`, OR its `due_date` is inside it. Paused/archived projects
 * excluded like the day/week views. Positioning (timed slot vs all-day band) is
 * decided client-side from these same fields.
 */
export async function listTasksForCalendar(
  startISO: string,
  endISO: string,
): Promise<Task[]> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  // start_at is a timestamptz — bound it by the day after endISO (exclusive).
  const startTs = `${startISO}T00:00:00`;
  const endTsExcl = `${addDaysISO(endISO, 1)}T00:00:00`;

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("org_id", orgId)
    .eq("status", "open")
    .or(
      `and(scheduled_for.gte.${startISO},scheduled_for.lte.${endISO}),` +
        `and(due_date.gte.${startISO},due_date.lte.${endISO}),` +
        `and(start_at.gte.${startTs},start_at.lt.${endTsExcl})`,
    )
    .order("start_at", { ascending: true, nullsFirst: false })
    .order("scheduled_for", { ascending: true, nullsFirst: false })
    .order("priority", { ascending: true });

  if (error) throw new Error(`listTasksForCalendar: ${error.message}`);
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

export async function createTask(
  input: {
    title: string;
    body?: string;
    projectId?: string | null;
    recordId?: string | null;
    priority?: Priority;
    effort?: Effort | null;
    scheduledFor?: string | null;
    dueDate?: string | null;
    /** Timed appointment instants (ISO). Set => the task is a timed calendar
     *  block; left null => a date-only item (the existing default everywhere). */
    startAt?: string | null;
    endAt?: string | null;
  },
  /** Activity attribution: 'user' for the in-app composer, 'command' when the
   *  command interpreter creates a task. Defaults to the dominant manual path. */
  actor: ActivityActor = "user",
): Promise<Task> {
  const user = await requireUser();
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  // A record implies its project — derive project_id from the record so the two
  // never disagree (the picker is already project-scoped; this is the backstop).
  let projectId = input.projectId || null;
  let recordId = input.recordId || null;
  if (recordId) {
    const { data: rec, error: re } = await supabase
      .from("records")
      .select("id, project_id")
      .eq("org_id", orgId)
      .eq("id", recordId)
      .maybeSingle();
    if (re) throw new Error(`createTask: ${re.message}`);
    if (!rec) recordId = null;
    else projectId = rec.project_id;
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      org_id: orgId,
      owner_id: user.id,
      title: input.title,
      body: input.body || null,
      project_id: projectId,
      record_id: recordId,
      // priority given by the user in a form => user-set, not system-set
      ...(input.priority
        ? { priority: input.priority, priority_set_by: "user" as const }
        : {}),
      effort: input.effort ?? null,
      scheduled_for: input.scheduledFor || null,
      due_date: input.dueDate || null,
      start_at: input.startAt || null,
      end_at: input.endAt || null,
      source: "app" as const,
    })
    .select()
    .single();

  if (error) throw new Error(`createTask: ${error.message}`);

  await logActivity({
    orgId: data.org_id,
    ownerId: data.owner_id,
    actor,
    action: "task_created",
    entityId: data.id,
    summary: data.title,
    detail: { project_id: data.project_id },
  });
  return data;
}

export async function updateTask(
  id: string,
  input: {
    title?: string;
    body?: string | null;
    projectId?: string | null;
    /** Plain passthrough — used to CLEAR a record link. To SET one, use
     *  setTaskRecord (it also files the task under the record's project). */
    recordId?: string | null;
    priority?: Priority;
    /** Who set the priority. Defaults to 'user' when priority is given (a human
     *  edit); pass explicitly so command-undo can restore a prior 'system' value. */
    prioritySetBy?: SetBy;
    effort?: Effort | null;
    availability?: Availability | null;
    scheduledFor?: string | null;
    dueDate?: string | null;
    /** Timed appointment instants (ISO); pass null to clear (back to all-day). */
    startAt?: string | null;
    endAt?: string | null;
    recurrenceId?: string | null;
    /** Set the lifecycle status. Used by the command interpreter to clear a
     *  held (snoozed/waiting) task back to open when acting on it, and to
     *  restore the exact prior status on undo. */
    status?: TaskStatus;
    snoozeUntil?: string | null;
    waitingOn?: string | null;
    followUpOn?: string | null;
  },
  /** Activity attribution. The generic update path is deliberately NOT logged
   *  for field tweaks (noise); the ONE thing it logs is a manual status change
   *  (the Inbox cancels/restores via this path). Command-driven status changes
   *  (clearHeld / undo restore) pass actor:'command' to suppress the row — the
   *  command layer logs its own verb explicitly, so this avoids double-logging. */
  actor: ActivityActor = "user",
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
      ...(input.recordId !== undefined ? { record_id: input.recordId } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.snoozeUntil !== undefined ? { snooze_until: input.snoozeUntil } : {}),
      ...(input.waitingOn !== undefined ? { waiting_on: input.waitingOn } : {}),
      ...(input.followUpOn !== undefined ? { follow_up_on: input.followUpOn } : {}),
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
      ...(input.startAt !== undefined ? { start_at: input.startAt } : {}),
      ...(input.endAt !== undefined ? { end_at: input.endAt } : {}),
      ...(input.recurrenceId !== undefined
        ? { recurrence_id: input.recurrenceId }
        : {}),
    })
    .eq("org_id", orgId)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`updateTask: ${error.message}`);

  // Only manual status transitions are logged here (Inbox cancel/restore). See
  // the actor doc above for why command status writes are intentionally skipped.
  if (actor === "user" && input.status !== undefined) {
    const action = statusAction(input.status);
    if (action) {
      await logActivity({
        orgId: data.org_id,
        ownerId: data.owner_id,
        actor,
        action,
        entityId: data.id,
        summary: data.title,
      });
    }
  }

  // A generic status write can also close a task (the Inbox cancels via here);
  // clear any pending rollover nudge for it when it does.
  if (input.status === "done" || input.status === "cancelled") {
    await dismissTaskNudges(orgId, id);
  }
  return data;
}

/** Map a lifecycle status write to its activity action (null = not logged). */
function statusAction(s: TaskStatus): ActivityAction | null {
  switch (s) {
    case "done":
      return "task_completed";
    case "open":
      return "task_reopened";
    case "cancelled":
      return "task_cancelled";
    case "snoozed":
      return "task_snoozed";
    default:
      return null; // waiting / needs_clarification — no manual path sets these here
  }
}

/**
 * Associate a task with a record (a car/client/job), or clear it with null.
 * Setting a record also files the task under that record's project so the
 * task↔record↔project chain stays consistent. Org-scoped; RLS backstop.
 */
export async function setTaskRecord(
  taskId: string,
  recordId: string | null,
): Promise<Task> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  let patch: { record_id: string | null; project_id?: string };
  if (recordId) {
    const { data: rec, error: re } = await supabase
      .from("records")
      .select("id, project_id")
      .eq("org_id", orgId)
      .eq("id", recordId)
      .maybeSingle();
    if (re) throw new Error(`setTaskRecord: ${re.message}`);
    if (!rec) throw new Error("Record not found.");
    patch = { record_id: rec.id, project_id: rec.project_id };
  } else {
    patch = { record_id: null };
  }

  const { data, error } = await supabase
    .from("tasks")
    .update(patch)
    .eq("org_id", orgId)
    .eq("id", taskId)
    .select()
    .single();

  if (error) throw new Error(`setTaskRecord: ${error.message}`);
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
export async function completeTask(
  id: string,
  actor: ActivityActor = "user",
): Promise<Task> {
  return (await completeTaskInternal(id, actor)).task;
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

/**
 * Dismiss any pending rollover nudge tied to a task once it closes (done or
 * cancelled) — the nudge ("still worth doing — or snooze/cancel it?") is moot,
 * so it shouldn't keep sitting in the Inbox. Best-effort: a failure here never
 * blocks the state change. listPendingPrompts also filters these out on read;
 * this is the write-time cleanup that stops the row lingering as 'pending'.
 * (Direct prompts update, not a prompts.ts import, to avoid an import cycle.)
 */
async function dismissTaskNudges(orgId: string, taskId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("prompts")
    .update({
      status: "dismissed" as const,
      resolved_at: new Date().toISOString(),
    })
    .eq("org_id", orgId)
    .eq("type", "nudge")
    .eq("relates_type", "task")
    .eq("relates_id", taskId)
    .eq("status", "pending");
  if (error) console.error("dismissTaskNudges:", error.message);
}

export async function completeTaskWithSpawn(
  id: string,
  actor: ActivityActor = "user",
): Promise<CompletionResult> {
  return completeTaskInternal(id, actor);
}

async function completeTaskInternal(
  id: string,
  actor: ActivityActor = "user",
): Promise<CompletionResult> {
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

  await logActivity({
    orgId: data.org_id,
    ownerId: data.owner_id,
    actor,
    action: "task_completed",
    entityId: data.id,
    summary: data.title,
  });

  // The task is closed — clear any pending rollover nudge for it.
  await dismissTaskNudges(orgId, id);

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

  // Log the spawned instance as its own event (actor 'recurrence' — the engine
  // created it, regardless of who completed the parent). Runs for both the
  // manual and command completion paths since both funnel through here.
  if (spawned) {
    await logActivity({
      orgId: data.org_id,
      ownerId: data.owner_id,
      actor: "recurrence",
      action: "recurrence_spawned",
      entityId: spawned.id,
      summary: data.title,
      detail: {
        from_task: data.id,
        recurrence_id: data.recurrence_id,
        scheduled_for: spawned.scheduledFor,
      },
    });
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

  // Idempotent: never spawn a second open instance of the same recurrence (e.g.
  // if both completion paths advanced it, or a prior spawn already exists).
  const { data: existing } = await supabase
    .from("tasks")
    .select("id, scheduled_for")
    .eq("org_id", orgId)
    .eq("recurrence_id", rec.id)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();
  if (existing) return { id: existing.id, scheduledFor: existing.scheduled_for ?? next };

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
export async function snoozeTask(
  id: string,
  untilISO: string,
  actor: ActivityActor = "user",
): Promise<Task> {
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

  await logActivity({
    orgId: data.org_id,
    ownerId: data.owner_id,
    actor,
    action: "task_snoozed",
    entityId: data.id,
    summary: data.title,
    detail: { snooze_until: untilISO },
  });
  return data;
}

/** Clear a snooze: back to open, snooze_until null. Mirror of the nightly resurface. */
export async function unsnoozeTask(
  id: string,
  actor: ActivityActor = "user",
  detail?: Record<string, unknown>,
): Promise<Task> {
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

  await logActivity({
    orgId: data.org_id,
    ownerId: data.owner_id,
    actor,
    action: "task_unsnoozed",
    entityId: data.id,
    summary: data.title,
    detail,
  });
  return data;
}

export async function reopenTask(
  id: string,
  actor: ActivityActor = "user",
  detail?: Record<string, unknown>,
): Promise<Task> {
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

  await logActivity({
    orgId: data.org_id,
    ownerId: data.owner_id,
    actor,
    action: "task_reopened",
    entityId: data.id,
    summary: data.title,
    detail,
  });
  return data;
}

export async function cancelTask(
  id: string,
  actor: ActivityActor = "user",
): Promise<Task> {
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

  await logActivity({
    orgId: data.org_id,
    ownerId: data.owner_id,
    actor,
    action: "task_cancelled",
    entityId: data.id,
    summary: data.title,
  });

  // The task is closed — clear any pending rollover nudge for it.
  await dismissTaskNudges(orgId, id);
  return data;
}

/**
 * Permanent hard-delete (the Completed view's "Delete permanently"). Org-scoped.
 * receipts.task_id is ON DELETE SET NULL; orphaned links are swept by the nightly
 * cleanup. Distinct from cancelTask (the reversible soft-delete on open tasks).
 */
export async function deleteTaskHard(
  id: string,
  actor: ActivityActor = "user",
  detail?: Record<string, unknown>,
): Promise<void> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  // Grab owner/title before the delete so the log keeps a readable summary
  // (delete returns no row). Best-effort — a missing row just means no summary.
  const { data: prior } = await supabase
    .from("tasks")
    .select("owner_id, title")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("org_id", orgId)
    .eq("id", id);

  if (error) throw new Error(`deleteTaskHard: ${error.message}`);

  await logActivity({
    orgId,
    ownerId: prior?.owner_id ?? null,
    actor,
    action: "task_deleted",
    entityId: id,
    summary: prior?.title ?? null,
    detail,
  });
}
