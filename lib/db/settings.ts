import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * User preferences stored in users.settings (jsonb). Read-modify-write merge,
 * mirroring saveTimezone in lib/db/calendar.ts — never overwrite the whole blob
 * (the calendar feature keeps the user's IANA timezone in here too).
 *
 * Debrief cadence (v1 feature 4, Part B): how often the gap-miner may run for
 * this user. Absent / 0 = OFF (the default — the engine stays silent until the
 * user turns it on). Allowed periods: 7 (weekly), 10, 30 (monthly).
 */

export type DebriefCadence = 0 | 7 | 10 | 30; // 0 = off

export function isDebriefCadence(n: number): n is DebriefCadence {
  return n === 0 || n === 7 || n === 10 || n === 30;
}

export async function getDebriefCadenceDays(): Promise<DebriefCadence> {
  const user = await requireUser();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("users")
    .select("settings")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error(`getDebriefCadenceDays: ${error.message}`);

  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const v = Number(settings.debrief_cadence_days ?? 0);
  return isDebriefCadence(v) ? v : 0;
}

export async function saveDebriefCadenceDays(
  days: DebriefCadence,
): Promise<void> {
  const user = await requireUser();
  const supabase = createClient();

  const { data } = await supabase
    .from("users")
    .select("settings")
    .eq("id", user.id)
    .maybeSingle();

  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const { error } = await supabase
    .from("users")
    .update({ settings: { ...settings, debrief_cadence_days: days } })
    .eq("id", user.id);
  if (error) throw new Error(`saveDebriefCadenceDays: ${error.message}`);
}
