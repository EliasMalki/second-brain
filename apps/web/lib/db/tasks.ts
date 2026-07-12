import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import * as shared from "@second-brain/shared/db/tasks";
import type {
  Availability,
  CompletionResult,
  Effort,
  Priority,
  SetBy,
  Task,
  TaskStatus,
} from "@second-brain/shared/db/tasks";
import type { ActivityActor } from "@second-brain/shared/db/activity";

/**
 * Thin Next adapter over the shared tasks module: resolve the request's
 * client/org/user here, keep all query logic in @second-brain/shared/db/tasks.
 */

export type {
  Availability,
  CompletionResult,
  Effort,
  Priority,
  SetBy,
  Task,
  TaskStatus,
} from "@second-brain/shared/db/tasks";

export async function listTasks(opts?: {
  projectId?: string;
  projectIds?: string[];
  status?: TaskStatus;
  timing?: "timed" | "undated";
}): Promise<Task[]> {
  return shared.listTasks(createClient(), await getCurrentOrgId(), opts);
}

export async function bulkUpdateTaskFields(
  ids: string[],
  fields: {
    projectId?: string | null;
    priority?: Priority;
    scheduledFor?: string | null;
  },
): Promise<void> {
  return shared.bulkUpdateTaskFields(createClient(), await getCurrentOrgId(), ids, fields);
}

export async function bulkCompleteTasks(ids: string[]): Promise<void> {
  return shared.bulkCompleteTasks(createClient(), await getCurrentOrgId(), ids);
}

export async function partitionByAvailability(
  tasks: Task[],
  withinBusinessHours: boolean,
): Promise<{ available: Task[]; offHours: Task[] }> {
  return shared.partitionByAvailability(
    createClient(),
    await getCurrentOrgId(),
    tasks,
    withinBusinessHours,
  );
}

export async function listOverdueTasks(): Promise<Task[]> {
  return shared.listOverdueTasks(createClient(), await getCurrentOrgId());
}

export async function listTasksScheduledBetween(
  startISO: string,
  endISO: string,
): Promise<Task[]> {
  return shared.listTasksScheduledBetween(
    createClient(),
    await getCurrentOrgId(),
    startISO,
    endISO,
  );
}

export async function listTasksForCalendar(
  startISO: string,
  endISO: string,
): Promise<Task[]> {
  return shared.listTasksForCalendar(createClient(), await getCurrentOrgId(), startISO, endISO);
}

export async function listBacklogTasks(limit = 50): Promise<Task[]> {
  return shared.listBacklogTasks(createClient(), await getCurrentOrgId(), limit);
}

export async function listUnfiledTasks(): Promise<Task[]> {
  return shared.listUnfiledTasks(createClient(), await getCurrentOrgId());
}

export async function listCompletedTasks(limit = 100): Promise<Task[]> {
  return shared.listCompletedTasks(createClient(), await getCurrentOrgId(), limit);
}

export async function getTask(id: string): Promise<Task | null> {
  return shared.getTask(createClient(), await getCurrentOrgId(), id);
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
    startAt?: string | null;
    endAt?: string | null;
  },
  actor: ActivityActor = "user",
): Promise<Task> {
  const user = await requireUser();
  return shared.createTask(createClient(), await getCurrentOrgId(), user.id, input, actor);
}

export async function updateTask(
  id: string,
  input: {
    title?: string;
    body?: string | null;
    projectId?: string | null;
    recordId?: string | null;
    priority?: Priority;
    prioritySetBy?: SetBy;
    effort?: Effort | null;
    availability?: Availability | null;
    scheduledFor?: string | null;
    dueDate?: string | null;
    startAt?: string | null;
    endAt?: string | null;
    recurrenceId?: string | null;
    status?: TaskStatus;
    snoozeUntil?: string | null;
    waitingOn?: string | null;
    followUpOn?: string | null;
  },
  actor: ActivityActor = "user",
): Promise<Task> {
  return shared.updateTask(createClient(), await getCurrentOrgId(), id, input, actor);
}

export async function setTaskRecord(
  taskId: string,
  recordId: string | null,
): Promise<Task> {
  return shared.setTaskRecord(createClient(), await getCurrentOrgId(), taskId, recordId);
}

export async function completeTask(
  id: string,
  actor: ActivityActor = "user",
): Promise<Task> {
  return shared.completeTask(createClient(), await getCurrentOrgId(), id, actor);
}

export async function completeTaskWithSpawn(
  id: string,
  actor: ActivityActor = "user",
): Promise<CompletionResult> {
  return shared.completeTaskWithSpawn(createClient(), await getCurrentOrgId(), id, actor);
}

export async function snoozeTask(
  id: string,
  untilISO: string,
  actor: ActivityActor = "user",
): Promise<Task> {
  return shared.snoozeTask(createClient(), await getCurrentOrgId(), id, untilISO, actor);
}

export async function unsnoozeTask(
  id: string,
  actor: ActivityActor = "user",
  detail?: Record<string, unknown>,
): Promise<Task> {
  return shared.unsnoozeTask(createClient(), await getCurrentOrgId(), id, actor, detail);
}

export async function reopenTask(
  id: string,
  actor: ActivityActor = "user",
  detail?: Record<string, unknown>,
): Promise<Task> {
  return shared.reopenTask(createClient(), await getCurrentOrgId(), id, actor, detail);
}

export async function cancelTask(
  id: string,
  actor: ActivityActor = "user",
): Promise<Task> {
  return shared.cancelTask(createClient(), await getCurrentOrgId(), id, actor);
}

export async function deleteTaskHard(
  id: string,
  actor: ActivityActor = "user",
  detail?: Record<string, unknown>,
): Promise<void> {
  return shared.deleteTaskHard(createClient(), await getCurrentOrgId(), id, actor, detail);
}
