"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  cancelTask,
  completeTask,
  createTask,
  reopenTask,
  updateTask,
  type Effort,
  type Priority,
} from "@/lib/db/tasks";

export type FormState = { error?: string };

const PRIORITIES: Priority[] = ["A", "B", "C", "D"];
const EFFORTS: Effort[] = ["quick", "deep"];

function parseTaskForm(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const projectId = String(formData.get("project_id") ?? "");
  const priority = String(formData.get("priority") ?? "");
  const effort = String(formData.get("effort") ?? "");
  const scheduledFor = String(formData.get("scheduled_for") ?? "");
  const dueDate = String(formData.get("due_date") ?? "");

  return {
    title,
    body: body || null,
    projectId: projectId || null,
    priority: PRIORITIES.includes(priority as Priority)
      ? (priority as Priority)
      : undefined,
    effort: EFFORTS.includes(effort as Effort) ? (effort as Effort) : null,
    scheduledFor: scheduledFor || null,
    dueDate: dueDate || null,
  };
}

export async function createTaskAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = parseTaskForm(formData);
  if (!input.title) return { error: "Title is required." };

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
