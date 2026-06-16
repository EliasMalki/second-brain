"use server";

import { revalidatePath } from "next/cache";
import {
  createRecurrence,
  deleteRecurrence,
  getRecurrence,
  setRecurrenceActive,
  updateRecurrence,
  type RecurEffort,
  type RecurFreq,
  type RecurPriority,
} from "@/lib/db/recurrences";
import { getTask, updateTask } from "@/lib/db/tasks";
import { todayISO } from "@/lib/dates";

export type FormState = { error?: string };

const FREQS: RecurFreq[] = ["daily", "weekly", "monthly", "yearly"];
const PRIORITIES: RecurPriority[] = ["A", "B", "C", "D"];
const EFFORTS: RecurEffort[] = ["quick", "deep"];
const DOW = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function parseByday(formData: FormData): string[] {
  return String(formData.get("byday") ?? "")
    .split(",")
    .map((d) => d.trim().toUpperCase())
    .filter((d) => DOW.includes(d));
}

function parseFreqInterval(
  formData: FormData,
): { freq: RecurFreq; interval: number } | { error: string } {
  const freq = String(formData.get("freq") ?? "");
  const interval = Number(formData.get("interval") ?? 1);
  if (!FREQS.includes(freq as RecurFreq)) return { error: "Pick a frequency." };
  if (!Number.isInteger(interval) || interval < 1 || interval > 365) {
    return { error: "Repeat interval must be a whole number ≥ 1." };
  }
  return { freq: freq as RecurFreq, interval };
}

/* ---------- Recurring manager (filter view) ------------------------------- */

export async function toggleRecurrenceAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "1";
  if (!id) return;
  await setRecurrenceActive(id, active);
  revalidatePath("/tasks");
}

export async function deleteRecurrenceAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteRecurrence(id);
  revalidatePath("/tasks");
}

export async function updateRecurrenceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing rule id." };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Title is required." };
  const fi = parseFreqInterval(formData);
  if ("error" in fi) return { error: fi.error };

  const projectId = String(formData.get("project_id") ?? "");
  const priority = String(formData.get("priority") ?? "");
  const effort = String(formData.get("effort") ?? "");

  try {
    await updateRecurrence(id, {
      titleTemplate: title,
      freq: fi.freq,
      interval: fi.interval,
      byday: parseByday(formData),
      projectId: projectId || null,
      priority: PRIORITIES.includes(priority as RecurPriority)
        ? (priority as RecurPriority)
        : undefined,
      effort: EFFORTS.includes(effort as RecurEffort)
        ? (effort as RecurEffort)
        : null,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to save rule." };
  }

  revalidatePath("/tasks");
  return {};
}

/* ---------- Detail-page "Repeat" toggle ----------------------------------- */

/**
 * Make a task repeat (or stop). Repeat ON with no rule yet: create a FIXED rule
 * seeded so the nightly job starts at the NEXT occurrence (this task is #1, no
 * duplicate); link the task to it. Repeat ON with a rule: update + reactivate.
 * Repeat OFF: deactivate the rule and unlink (BUILD_SPEC §3 — fixed only).
 */
export async function upsertTaskRecurrenceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const taskId = String(formData.get("task_id") ?? "");
  if (!taskId) return { error: "Missing task id." };
  const repeat = formData.get("repeat") === "1";

  const task = await getTask(taskId);
  if (!task) return { error: "Task not found." };
  const existingId = task.recurrence_id;

  if (!repeat) {
    if (existingId) {
      await setRecurrenceActive(existingId, false);
      await updateTask(taskId, { recurrenceId: null });
    }
    revalidatePath("/tasks");
    revalidatePath(`/tasks/${taskId}`);
    return {};
  }

  const fi = parseFreqInterval(formData);
  if ("error" in fi) return { error: fi.error };
  const byday = parseByday(formData);

  try {
    if (existingId) {
      await updateRecurrence(existingId, {
        freq: fi.freq,
        interval: fi.interval,
        byday,
      });
      const rec = await getRecurrence(existingId);
      if (rec && !rec.active) await setRecurrenceActive(existingId, true);
    } else {
      const startDate = task.scheduled_for ?? todayISO();
      const rule = await createRecurrence({
        titleTemplate: task.title,
        freq: fi.freq,
        interval: fi.interval,
        byday,
        startDate,
        // this task is occurrence #1 — start materializing from the day after
        lastMaterializedThrough: startDate,
        projectId: task.project_id,
        priority: task.priority,
        effort: task.effort,
      });
      await updateTask(taskId, { recurrenceId: rule.id });
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to set repeat." };
  }

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
  return {};
}
