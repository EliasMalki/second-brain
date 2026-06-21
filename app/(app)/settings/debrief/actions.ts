"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/db/org";
import { publicEnv, serverEnv } from "@/lib/env";
import { isDebriefCadence, saveDebriefCadenceDays } from "@/lib/db/settings";

/** Persist the debrief cadence (Off / 7 / 10 / 30 days). */
export async function saveDebriefCadenceAction(
  formData: FormData,
): Promise<void> {
  const raw = Number(formData.get("cadence") ?? 0);
  const days = isDebriefCadence(raw) ? raw : 0;
  await saveDebriefCadenceDays(days);
  revalidatePath("/settings/debrief");
}

/** Invoke a Supabase Edge Function with the service-role bearer (same gate the
 * capture pipeline uses). Awaited so the caller can redirect to fresh results. */
async function invokeFunction(name: string, body: unknown): Promise<void> {
  await fetch(`${publicEnv.supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serverEnv.supabaseServiceRoleKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

/**
 * Tuning: run the gap-miner now, ignoring the cadence. Questions surface
 * immediately (the debrief function sets surface_after=now), so the user lands
 * in the Inbox and sees the batch right away.
 */
export async function runDebriefNowAction(): Promise<void> {
  const user = await requireUser();
  const orgId = await getCurrentOrgId();
  await invokeFunction("debrief", { org_id: orgId, user_id: user.id });
  revalidatePath("/inbox");
  redirect("/inbox");
}

/**
 * Tuning: re-check recent filed items for misfilings (the sweep). New
 * discrepancy prompts land in the Inbox; already-flagged items are skipped.
 */
export async function scanRecentMismatchesAction(): Promise<void> {
  const orgId = await getCurrentOrgId();
  await invokeFunction("check-discrepancy", { sweep: true, org_id: orgId });
  revalidatePath("/inbox");
  redirect("/inbox");
}
