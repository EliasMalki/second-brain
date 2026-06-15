"use server";

import { revalidatePath } from "next/cache";
import { updateTask } from "@/lib/db/tasks";
import { todayISO } from "@/lib/dates";

/**
 * Pull a backlog task into Today from the Home hub's backlog pool — sets
 * scheduled_for = today. Reuses the shared updateTask write path; the Tasks
 * page is untouched. Revalidates Home (where it's invoked) and the Tasks list.
 */
export async function scheduleTaskTodayAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await updateTask(id, { scheduledFor: todayISO() });
  revalidatePath("/");
  revalidatePath("/tasks");
}
