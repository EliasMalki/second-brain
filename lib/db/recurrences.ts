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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getRecurrence(id: string): Promise<Recurrence | null> {
  if (!UUID_RE.test(id)) return null;

  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("recurrences")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`getRecurrence: ${error.message}`);
  return data;
}

export async function createRecurrence(input: {
  titleTemplate: string;
  freq: RecurFreq;
  interval: number;
  startDate: string;
  /** Weekly day-of-week codes (SU MO TU WE TH FR SA); the nightly job reads this. */
  byday?: string[] | null;
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
      // byday only carries for weekly rules; null otherwise so the materializer
      // falls back to the start date's weekday (its existing behavior).
      byday: input.freq === "weekly" ? input.byday ?? null : null,
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

export async function updateRecurrence(
  id: string,
  input: {
    titleTemplate?: string;
    freq?: RecurFreq;
    interval?: number;
    byday?: string[] | null;
    until?: string | null;
    projectId?: string | null;
    priority?: RecurPriority;
    effort?: RecurEffort | null;
  },
): Promise<Recurrence> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  // Resolve the effective frequency so byday is only persisted for weekly rules
  // (matches createRecurrence). If freq isn't changing, read the current row.
  let freq = input.freq;
  if (input.byday !== undefined && freq === undefined) {
    freq = (await getRecurrence(id))?.freq;
  }

  const { data, error } = await supabase
    .from("recurrences")
    .update({
      ...(input.titleTemplate !== undefined
        ? { title_template: input.titleTemplate }
        : {}),
      ...(input.freq !== undefined ? { freq: input.freq } : {}),
      ...(input.interval !== undefined ? { interval: input.interval } : {}),
      ...(input.byday !== undefined
        ? { byday: freq === "weekly" ? input.byday : null }
        : {}),
      ...(input.until !== undefined ? { until: input.until } : {}),
      ...(input.projectId !== undefined
        ? { project_id: input.projectId }
        : {}),
      ...(input.priority !== undefined
        ? { default_priority: input.priority }
        : {}),
      ...(input.effort !== undefined ? { default_effort: input.effort } : {}),
    })
    .eq("org_id", orgId)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`updateRecurrence: ${error.message}`);
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

/**
 * Hard-delete a rule. Already-materialized tasks survive: tasks.recurrence_id
 * is ON DELETE SET NULL, so past instances stay, only future materialization
 * stops. (Pause via setRecurrenceActive keeps the rule for later resume.)
 */
export async function deleteRecurrence(id: string): Promise<void> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { error } = await supabase
    .from("recurrences")
    .delete()
    .eq("org_id", orgId)
    .eq("id", id);

  if (error) throw new Error(`deleteRecurrence: ${error.message}`);
}
