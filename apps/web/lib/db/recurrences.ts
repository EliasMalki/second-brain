import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import * as shared from "@second-brain/shared/db/recurrences";
import type {
  Recurrence,
  RecurEffort,
  RecurFreq,
  RecurPriority,
} from "@second-brain/shared/db/recurrences";

/**
 * Thin Next adapter over the shared recurrences module: resolve the request's
 * client/org/user here, keep query logic in @second-brain/shared/db/recurrences.
 */

export type {
  Recurrence,
  RecurEffort,
  RecurFreq,
  RecurPriority,
} from "@second-brain/shared/db/recurrences";

export async function listRecurrences(): Promise<Recurrence[]> {
  return shared.listRecurrences(createClient(), await getCurrentOrgId());
}

export async function getRecurrence(id: string): Promise<Recurrence | null> {
  return shared.getRecurrence(createClient(), await getCurrentOrgId(), id);
}

export async function createRecurrence(input: {
  titleTemplate: string;
  freq: RecurFreq;
  interval: number;
  startDate: string;
  byday?: string[] | null;
  until?: string | null;
  projectId?: string | null;
  priority?: RecurPriority;
  effort?: RecurEffort | null;
  lastMaterializedThrough?: string | null;
}): Promise<Recurrence> {
  const user = await requireUser();
  return shared.createRecurrence(createClient(), await getCurrentOrgId(), user.id, input);
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
  return shared.updateRecurrence(createClient(), await getCurrentOrgId(), id, input);
}

export async function setRecurrenceActive(id: string, active: boolean): Promise<void> {
  return shared.setRecurrenceActive(createClient(), await getCurrentOrgId(), id, active);
}

export async function deleteRecurrence(id: string): Promise<void> {
  return shared.deleteRecurrence(createClient(), await getCurrentOrgId(), id);
}
