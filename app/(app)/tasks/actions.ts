"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  bulkCompleteTasks,
  bulkUpdateTaskFields,
  cancelTask,
  completeTask,
  createTask,
  reopenTask,
  updateTask,
  type Availability,
  type Effort,
  type Priority,
} from "@/lib/db/tasks";
import { createRecurrence, type RecurFreq } from "@/lib/db/recurrences";
import { todayISO } from "@/lib/dates";

export type FormState = { error?: string };

const PRIORITIES: Priority[] = ["A", "B", "C", "D"];
const EFFORTS: Effort[] = ["quick", "deep"];
const AVAILABILITIES: Availability[] = ["anytime", "business_hours"];
const FREQS: RecurFreq[] = ["daily", "weekly", "monthly", "yearly"];
const DOW = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function asPriority(v: string): Priority | undefined {
  return PRIORITIES.includes(v as Priority) ? (v as Priority) : undefined;
}

function parseTaskForm(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const projectId = String(formData.get("project_id") ?? "");
  const effort = String(formData.get("effort") ?? "");
  const availability = String(formData.get("availability") ?? "");
  const scheduledFor = String(formData.get("scheduled_for") ?? "");
  const dueDate = String(formData.get("due_date") ?? "");

  return {
    title,
    body: body || null,
    projectId: projectId || null,
    priority: asPriority(String(formData.get("priority") ?? "")),
    effort: EFFORTS.includes(effort as Effort) ? (effort as Effort) : null,
    availability: AVAILABILITIES.includes(availability as Availability)
      ? (availability as Availability)
      : null,
    scheduledFor: scheduledFor || null,
    dueDate: dueDate || null,
  };
}

/**
 * One submit path for the add-task box. With Repeat OFF it creates a task; with
 * Repeat ON it creates a FIXED recurrence rule ONLY (no task now) — the nightly
 * job materializes the first instance, so we never double-create (BUILD_SPEC §3).
 */
export async function createTaskAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = parseTaskForm(formData);
  if (!input.title) return { error: "Title is required." };

  if (formData.get("repeat") === "1") {
    const freq = String(formData.get("freq") ?? "");
    const interval = Number(formData.get("interval") ?? 1);
    if (!FREQS.includes(freq as RecurFreq)) return { error: "Pick a frequency." };
    if (!Number.isInteger(interval) || interval < 1 || interval > 365) {
      return { error: "Repeat interval must be a whole number ≥ 1." };
    }
    const byday = String(formData.get("byday") ?? "")
      .split(",")
      .map((d) => d.trim().toUpperCase())
      .filter((d) => DOW.includes(d));

    try {
      await createRecurrence({
        titleTemplate: input.title,
        freq: freq as RecurFreq,
        interval,
        byday: byday.length > 0 ? byday : null,
        // a rule needs a start; fall back to today when the box says "No date"
        startDate: input.scheduledFor ?? todayISO(),
        projectId: input.projectId,
        priority: input.priority,
        effort: input.effort,
      });
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Failed to create rule." };
    }
    revalidatePath("/tasks");
    return {};
  }

  try {
    await createTask({ ...input, body: input.body ?? undefined });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create." };
  }

  revalidatePath("/tasks");
  return {};
}

export async function updateTaskAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  const input = parseTaskForm(formData);

  if (!id) return { error: "Missing task id." };
  if (!input.title) return { error: "Title is required." };

  try {
    await updateTask(id, input);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to save." };
  }

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${id}`);
  return {};
}

/**
 * Single-field edits from the list rows (inline title edit, quick reschedule,
 * quick priority). One small action so the interactive row never leaves the
 * page; the client applies the change optimistically and calls this to persist.
 */
export async function quickUpdateTaskAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const field = String(formData.get("field") ?? "");
  const value = String(formData.get("value") ?? "");

  if (field === "title") {
    const title = value.trim();
    if (title) await updateTask(id, { title });
  } else if (field === "priority") {
    const priority = asPriority(value);
    if (priority) await updateTask(id, { priority });
  } else if (field === "scheduled_for") {
    await updateTask(id, { scheduledFor: value || null });
  } else if (field === "project_id") {
    await updateTask(id, { projectId: value || null });
  }

  revalidatePath("/tasks");
}

/** Used from the list rows and the detail page. */
export async function completeTaskAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await completeTask(id);
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${id}`);
}

export async function reopenTaskAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await reopenTask(id);
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${id}`);
}

export async function cancelTaskAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await cancelTask(id);
  revalidatePath("/tasks");
  redirect("/tasks");
}

/* ---------- bulk actions (multi-select bar) ------------------------------- */

function parseIds(formData: FormData): string[] {
  return String(formData.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function bulkCompleteAction(formData: FormData): Promise<void> {
  await bulkCompleteTasks(parseIds(formData));
  revalidatePath("/tasks");
}

export async function bulkRescheduleAction(formData: FormData): Promise<void> {
  const value = String(formData.get("value") ?? "");
  await bulkUpdateTaskFields(parseIds(formData), {
    scheduledFor: value || null,
  });
  revalidatePath("/tasks");
}

export async function bulkPriorityAction(formData: FormData): Promise<void> {
  const priority = asPriority(String(formData.get("value") ?? ""));
  if (priority) {
    await bulkUpdateTaskFields(parseIds(formData), { priority });
  }
  revalidatePath("/tasks");
}

export async function bulkMoveProjectAction(formData: FormData): Promise<void> {
  const value = String(formData.get("value") ?? "");
  await bulkUpdateTaskFields(parseIds(formData), { projectId: value || null });
  revalidatePath("/tasks");
}
