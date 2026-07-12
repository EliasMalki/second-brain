"use server";

import { revalidatePath } from "next/cache";
import { disconnectCalendar } from "@/lib/db/calendar";

export async function disconnectCalendarAction(): Promise<void> {
  await disconnectCalendar();
  revalidatePath("/settings/calendar");
  revalidatePath("/");
}
