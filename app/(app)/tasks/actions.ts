"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  bulkCompleteTasks,
  bulkUpdateTaskFields,
  cancelTask,
  completeTask,
  createTask,
  deleteTaskHard,
  getTask,
  reopenTask,
  setTaskRecord,
  updateTask,
  type Availability,
  type Effort,
  type Priority,
} from "@/lib/db/tasks";
import { createRecurrence, type RecurFreq } from "@/lib/db/recurrences";
import { getUserTimezone } from "@/lib/db/calendar";
import { todayISO } from "@/lib/dates";

/** YYYY-MM-DD of an instant in the given IANA tz (en-CA = ISO date order). */
function localDay(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

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
  const recordId = String(formData.get("record_id") ?? "");
  const effort = String(formData.get("effort") ?? "");
  const availability = String(formData.get("availability") ?? "");
  const scheduledFor = String(formData.get("scheduled_for") ?? "");
  const dueDate = String(formData.get("due_date") ?? "");
  // Timed-appointment instants come pre-computed (browser tz) as ISO strings.
  const startAt = asIso(String(formData.get("start_at") ?? ""));
  const endAt = asIso(String(formData.get("end_at") ?? ""));

  return {
    title,
    body: body || null,
    projectId: projectId || null,
    recordId: recordId || null,
    priority: asPriority(String(formData.get("priority") ?? "")),
    effort: EFFORTS.includes(effort as Effort) ? (effort as Effort) : null,
    availability: AVAILABILITIES.includes(availability as Availability)
      ? (availability as Availability)
      : null,
    scheduledFor: scheduledFor || null,
    dueDate: dueDate || null,
    startAt,
    endAt,
  };
}

/** A non-empty, parseable ISO timestamp, else null. */
function asIso(v: string): string | null {
  return v && !Number.isNaN(Date.parse(v)) ? v : null;
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
    revalidatePath("/calendar");
    return {};
  }

  try {
    await createTask({ ...input, body: input.body ?? undefined });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create." };
  }

  revalidatePath("/tasks");
  revalidatePath("/calendar");
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
  } else if (field === "due_date") {
    await updateTask(id, { dueDate: value || null });
  } else if (field === "project_id") {
    // a record belongs to a project — moving projects clears any record link
    const t = await updateTask(id, { projectId: value || null, recordId: null });
    if (t.project_id) revalidatePath(`/projects/${t.project_id}`);
  } else if (field === "record_id") {
    const t = value
      ? await setTaskRecord(id, value)
      : await updateTask(id, { recordId: null });
    if (t.record_id) revalidatePath(`/records/${t.record_id}`);
    if (t.project_id) revalidatePath(`/projects/${t.project_id}`);
  } else if (field === "effort") {
    await updateTask(id, {
      effort: EFFORTS.includes(value as Effort) ? (value as Effort) : null,
    });
  } else if (field === "availability") {
    await updateTask(id, {
      availability: AVAILABILITIES.includes(value as Availability)
        ? (value as Availability)
        : null,
    });
  } else if (field === "body") {
    await updateTask(id, { body: value || null });
  } else if (field === "start_at") {
    // Make/Move a timed appointment: value is a pre-computed ISO instant. Derive
    // the scheduled day in the user's tz (so Today/Week still show it) and keep
    // the existing duration (default 60m). Empty value is handled by "all_day".
    if (value) {
      const [tz, prev] = await Promise.all([getUserTimezone(), getTask(id)]);
      const dur =
        prev?.start_at && prev?.end_at
          ? Date.parse(prev.end_at) - Date.parse(prev.start_at)
          : 3_600_000;
      const endAt = new Date(Date.parse(value) + Math.max(dur, 900_000)).toISOString();
      await updateTask(id, { startAt: value, endAt, scheduledFor: localDay(value, tz) });
    }
  } else if (field === "all_day") {
    // Drop on an all-day / month slot, or "clear time": date-only, no start_at.
    await updateTask(id, { startAt: null, endAt: null, scheduledFor: value || null });
  }

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${id}`);
  revalidatePath("/calendar");
}

/** Soft-delete from the detail panel: cancel (reversible), no redirect. */
export async function deleteTaskAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await cancelTask(id);
  revalidatePath("/tasks");
  revalidatePath("/calendar");
}

/** Reopen a done/cancelled task back to open (panel, no redirect). */
export async function reopenTaskQuietAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await reopenTask(id);
  revalidatePath("/tasks");
  revalidatePath("/calendar");
}

/** Permanently delete a task (Completed view only). Irreversible. */
export async function hardDeleteTaskAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteTaskHard(id);
  revalidatePath("/tasks");
  revalidatePath("/calendar");
}

/** Used from the list rows and the detail page. */
export async function completeTaskAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await completeTask(id);
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${id}`);
  revalidatePath("/calendar");
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
