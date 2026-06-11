"use server";

import { revalidatePath } from "next/cache";
import {
  createRecurrence,
  setRecurrenceActive,
  type RecurFreq,
  type RecurPriority,
  type RecurEffort,
} from "@/lib/db/recurrences";

export type FormState = { error?: string };

const FREQS: RecurFreq[] = ["daily", "weekly", "monthly", "yearly"];
const PRIORITIES: RecurPriority[] = ["A", "B", "C", "D"];
const EFFORTS: RecurEffort[] = ["quick", "deep"];

export async function createRecurrenceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const title = String(formData.get("title") ?? "").trim();
  const freq = String(formData.get("freq") ?? "");
  const interval = Number(formData.get("interval") ?? 1);
  const startDate = String(formData.get("start_date") ?? "");
  const until = String(formData.get("until") ?? "");
  const projectId = String(formData.get("project_id") ?? "");
  const priority = String(formData.get("priority") ?? "");
  const effort = String(formData.get("effort") ?? "");

  if (!title) return { error: "Title is required." };
  if (!FREQS.includes(freq as RecurFreq)) {
    return { error: "Pick a frequency." };
  }
  if (!startDate) return { error: "Start date is required." };
  if (!Number.isInteger(interval) || interval < 1 || interval > 365) {
    return { error: "Interval must be a whole number ≥ 1." };
  }

  try {
    await createRecurrence({
      titleTemplate: title,
      freq: freq as RecurFreq,
      interval,
      startDate,
      until: until || null,
      projectId: projectId || null,
      priority: PRIORITIES.includes(priority as RecurPriority)
        ? (priority as RecurPriority)
        : undefined,
      effort: EFFORTS.includes(effort as RecurEffort)
        ? (effort as RecurEffort)
        : null,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create." };
  }

  revalidatePath("/recurrences");
  return {};
}

export async function toggleRecurrenceAction(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "1";
  if (!id) return;
  await setRecurrenceActive(id, active);
  revalidatePath("/recurrences");
}
