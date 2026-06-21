import "server-only";

import {
  getTask,
  updateTask,
  completeTaskWithSpawn,
  snoozeTask,
  unsnoozeTask,
  reopenTask,
  deleteTaskHard,
  type Priority,
  type SetBy,
  type TaskStatus,
} from "@/lib/db/tasks";
import type { CandidateTask, CommandVerb } from "@/lib/commands/types";

/**
 * Capture command interpreter — verb execution, state checks, and exact undo
 * (step 3).
 *
 * Each verb maps to an existing org-scoped task mutation in lib/db/tasks; this
 * module wraps them with two things the interpreter needs: a full prior-state
 * SNAPSHOT taken before the write (so undo can restore the exact fields), and a
 * structured OUTCOME (so the caller can report "next on [date]" etc.). reverse()
 * replays a snapshot to undo — including deleting the recurrence instance a
 * completion may have spawned, so undo leaves no phantom future task.
 *
 * Reversible verbs only ever act here; none delete a task (delete stays in the
 * UI). All five verbs reuse the same RLS-scoped functions the app already uses.
 */

/** A blocking/ask-worthy state on a matched candidate, found before acting. */
export type StateIssue =
  | { kind: "already_done" }
  | { kind: "is_note" }
  | { kind: "snoozed" }
  | { kind: "waiting" };

/**
 * State check on a matched candidate (BUILD_SPEC: "don't act blindly on the
 * wrong state"). Returns the issue to surface, or null when the task is a plain
 * open task that's safe to act on. The caller decides whether an issue blocks
 * (already done), offers a conversion (note), or asks (snoozed/waiting).
 */
export function precheck(candidate: CandidateTask): StateIssue | null {
  if (candidate.is_note) return { kind: "is_note" };
  if (candidate.status === "done") return { kind: "already_done" };
  if (candidate.status === "snoozed") return { kind: "snoozed" };
  if (candidate.status === "waiting") return { kind: "waiting" };
  return null;
}

/** Resolved slot values for a verb (defaults already applied by the caller). */
export type ApplySlots = {
  scheduledFor?: string; // reschedule
  snoozeUntil?: string; // snooze
  priority?: Priority; // reprioritize
  projectId?: string | null; // refile (null = Inbox)
};

/** Exact prior state of one task, captured before the write — the undo unit. */
export type PriorState = {
  taskId: string;
  title: string;
  verb: CommandVerb;
  status: TaskStatus;
  scheduled_for: string | null;
  snooze_until: string | null;
  priority: Priority;
  priority_set_by: SetBy;
  project_id: string | null;
  completed_at: string | null;
  /** For a completion-anchored recurrence: the next instance the complete spawned. */
  spawned_task_id: string | null;
};

/** What actually changed — used to phrase the channel-agnostic confirmation. */
export type VerbOutcome = {
  verb: CommandVerb;
  scheduledFor?: string | null;
  snoozeUntil?: string;
  priority?: Priority;
  projectId?: string | null;
  /** complete: the next recurrence instance's date, when one was spawned. */
  recurrenceNext?: string | null;
};

export type ApplyResult =
  | { ok: true; prior: PriorState; outcome: VerbOutcome }
  | { ok: false; reason: "gone" | "already_done" };

/**
 * Apply one verb to one task. Re-fetches the task fresh (so the snapshot and a
 * final state guard reflect reality at write time, not at interpret time — the
 * task may have changed in between), snapshots the prior state, mutates, and
 * returns both the snapshot and the outcome.
 */
export async function applyVerb(
  taskId: string,
  verb: CommandVerb,
  slots: ApplySlots,
): Promise<ApplyResult> {
  const fresh = await getTask(taskId);
  if (!fresh) return { ok: false, reason: "gone" };
  // Race guard: it was already completed between interpret and act (applies to
  // every verb, complete included).
  if (fresh.status === "done") return { ok: false, reason: "already_done" };

  const prior: PriorState = {
    taskId: fresh.id,
    title: fresh.title,
    verb,
    status: fresh.status,
    scheduled_for: fresh.scheduled_for,
    snooze_until: fresh.snooze_until,
    priority: fresh.priority,
    priority_set_by: fresh.priority_set_by,
    project_id: fresh.project_id,
    completed_at: fresh.completed_at,
    spawned_task_id: null,
  };

  switch (verb) {
    case "complete": {
      const { spawned } = await completeTaskWithSpawn(taskId);
      prior.spawned_task_id = spawned?.id ?? null;
      return {
        ok: true,
        prior,
        outcome: { verb, recurrenceNext: spawned?.scheduledFor ?? null },
      };
    }
    case "reschedule": {
      await updateTask(taskId, { scheduledFor: slots.scheduledFor ?? null });
      return { ok: true, prior, outcome: { verb, scheduledFor: slots.scheduledFor ?? null } };
    }
    case "snooze": {
      const until = slots.snoozeUntil!;
      await snoozeTask(taskId, until);
      return { ok: true, prior, outcome: { verb, snoozeUntil: until } };
    }
    case "reprioritize": {
      const priority = slots.priority!;
      await updateTask(taskId, { priority });
      return { ok: true, prior, outcome: { verb, priority } };
    }
    case "refile": {
      const projectId = slots.projectId ?? null;
      await updateTask(taskId, { projectId });
      return { ok: true, prior, outcome: { verb, projectId } };
    }
  }
}

/**
 * Reverse one snapshot — the undo. Restores the exact fields the verb changed,
 * and for a completion that spawned a recurrence instance, deletes that
 * instance so undo leaves nothing behind.
 *
 * Note: instant act-on-confident only fires on plain OPEN tasks (precheck
 * diverts snoozed/waiting to a confirm), so complete/snooze reversals land on a
 * prior 'open' state exactly. A confirmed complete of a non-open task would
 * reopen to 'open' rather than its prior status — an accepted minor deviation.
 */
export async function reverse(prior: PriorState): Promise<void> {
  switch (prior.verb) {
    case "complete":
      await reopenTask(prior.taskId);
      if (prior.spawned_task_id) await deleteTaskHard(prior.spawned_task_id);
      return;
    case "reschedule":
      await updateTask(prior.taskId, { scheduledFor: prior.scheduled_for });
      return;
    case "snooze":
      await unsnoozeTask(prior.taskId);
      return;
    case "reprioritize":
      await updateTask(prior.taskId, {
        priority: prior.priority,
        prioritySetBy: prior.priority_set_by,
      });
      return;
    case "refile":
      await updateTask(prior.taskId, { projectId: prior.project_id });
      return;
  }
}
