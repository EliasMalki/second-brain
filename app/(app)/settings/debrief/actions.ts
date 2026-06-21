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

type FnResult = {
  generated?: number;
  swept?: number;
  results?: Record<string, string>;
};

/** Invoke a Supabase Edge Function with the service-role bearer (same gate the
 * capture pipeline uses). Awaited so the caller can report what it found. */
async function invokeFunction(
  name: string,
  body: unknown,
): Promise<FnResult | null> {
  try {
    const res = await fetch(`${publicEnv.supabaseUrl}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serverEnv.supabaseServiceRoleKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return (await res.json()) as FnResult;
  } catch {
    return null;
  }
}

/**
 * Tuning: run the gap-miner now, ignoring the cadence. Questions surface
 * immediately (the debrief function sets surface_after=now). Redirects back here
 * with a result so the action is never silent — a quiet outcome is legitimate.
 */
export async function runDebriefNowAction(): Promise<void> {
  const user = await requireUser();
  const orgId = await getCurrentOrgId();
  const result = await invokeFunction("debrief", {
    org_id: orgId,
    user_id: user.id,
  });
  const generated = Number(result?.generated ?? 0);
  revalidatePath("/inbox");
  redirect(`/settings/debrief?debriefed=${generated}`);
}

/**
 * Tuning: re-check recent filed items for misfilings (the sweep). Only true
 * mismatches become Inbox rows; "fits" and "skipped (no description)" are
 * silent. Reports the tally so the user knows what was checked and why it was
 * quiet, instead of landing on an unchanged Inbox.
 */
export async function scanRecentMismatchesAction(): Promise<void> {
  const orgId = await getCurrentOrgId();
  const result = await invokeFunction("check-discrepancy", {
    sweep: true,
    org_id: orgId,
  });
  const vals = result?.results ? Object.values(result.results) : [];
  const flagged = vals.filter((v) => v.startsWith("flagged")).length;
  const noDesc = vals.filter((v) =>
    v.includes("no substantial description"),
  ).length;
  const swept = Number(result?.swept ?? vals.length);
  revalidatePath("/inbox");
  redirect(
    `/settings/debrief?scanned=${swept}&flagged=${flagged}&nodesc=${noDesc}`,
  );
}
