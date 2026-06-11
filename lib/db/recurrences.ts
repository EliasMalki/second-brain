import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import type { Database } from "@/lib/database.types";

export type Recurrence = Database["public"]["Tables"]["recurrences"]["Row"];
export type RecurFreq = Database["public"]["Enums"]["recur_freq"];
export type RecurPriority = Database["public"]["Enums"]["priority"];
export type RecurEffort = Database["public"]["Enums"]["effort"];

/**
 * Recurrences data access. v0.5 creates FIXED-anchor rules only (BUILD_SPEC
 * §0 defers completion-anchored creation; the completion hook in tasks.ts
 * handles any that exist). The nightly job materializes these to a 14-day
 * horizon (§3 step 2).
 *
 * Simplification: weekly rules fire on the start date's weekday, monthly on
 * its month-day — no byday/bymonthday UI in v0.5.
 */

export async function listRecurrences(): Promise<Recurrence[]> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("recurrences")
    .select("*")
    .eq("org_id", orgId)
    .order("active", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(`listRecurrences: ${error.message}`);
  return data;
}

export async function createRecurrence(input: {
  titleTemplate: string;
  freq: RecurFreq;
  interval: number;
  startDate: string;
  until?: string | null;
  projectId?: string | null;
  priority?: RecurPriority;
  effort?: RecurEffort | null;
}): Promise<Recurrence> {
  const user = await requireUser();
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("recurrences")
    .insert({
      org_id: orgId,
      owner_id: user.id,
      title_template: input.titleTemplate,
      freq: input.freq,
      interval: input.interval,
      anchor: "fixed" as const, // v0.5: fixed only (§0)
      start_date: input.startDate,
      until: input.until ?? null,
      project_id: input.projectId ?? null,
      ...(input.priority ? { default_priority: input.priority } : {}),
      default_effort: input.effort ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`createRecurrence: ${error.message}`);
  return data;
}

export async function setRecurrenceActive(
  id: string,
  active: boolean,
): Promise<void> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { error } = await supabase
    .from("recurrences")
    .update({ active })
    .eq("org_id", orgId)
    .eq("id", id);

  if (error) throw new Error(`setRecurrenceActive: ${error.message}`);
}
