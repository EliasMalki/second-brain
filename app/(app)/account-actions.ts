"use server";

import { revalidatePath } from "next/cache";
import { saveDisplayName } from "@/lib/db/settings";

/**
 * Save the display name from the account-menu card. users.name is NOT NULL, so
 * an empty submit is a no-op rather than an error. Revalidates the whole layout
 * — the Home greeting and the sidebar both read the name.
 */
export async function updateDisplayNameAction(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, 80);
  if (!name) return;
  await saveDisplayName(name);
  revalidatePath("/", "layout");
}
