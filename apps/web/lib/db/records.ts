import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import * as shared from "@second-brain/shared/db/records";
import type {
  ChecklistItem,
  RecordRow,
  RecordType,
} from "@second-brain/shared/db/records";
import type { Database } from "@second-brain/shared/types/database";

/**
 * Thin Next adapter over the shared records module: resolve the request's
 * client/org/user here, keep query logic in @second-brain/shared/db/records.
 */

export type {
  ChecklistItem,
  Effort,
  Priority,
  RecordRow,
  RecordType,
} from "@second-brain/shared/db/records";

export { parseIntakeChecklist } from "@second-brain/shared/db/records";

export async function getRecordTypeForProject(
  projectId: string,
): Promise<RecordType | null> {
  return shared.getRecordTypeForProject(createClient(), await getCurrentOrgId(), projectId);
}

export async function getRecordType(id: string): Promise<RecordType | null> {
  return shared.getRecordType(createClient(), await getCurrentOrgId(), id);
}

export async function createRecordType(input: {
  projectId: string;
  labelSingular: string;
  labelPlural: string;
  stages: string[];
  intakeChecklist: ChecklistItem[];
}): Promise<RecordType> {
  return shared.createRecordType(createClient(), await getCurrentOrgId(), input);
}

export async function listRecords(
  projectId: string,
  opts?: { includeArchived?: boolean },
): Promise<RecordRow[]> {
  return shared.listRecords(createClient(), await getCurrentOrgId(), projectId, opts);
}

export async function getRecord(id: string): Promise<RecordRow | null> {
  return shared.getRecord(createClient(), await getCurrentOrgId(), id);
}

export async function createRecord(input: {
  projectId: string;
  name: string;
  stage: string;
}): Promise<RecordRow> {
  const user = await requireUser();
  return shared.createRecord(createClient(), await getCurrentOrgId(), user.id, input);
}

export async function updateRecordStage(id: string, stage: string): Promise<RecordRow> {
  return shared.updateRecordStage(createClient(), await getCurrentOrgId(), id, stage);
}

export async function archiveRecord(id: string): Promise<void> {
  return shared.archiveRecord(createClient(), await getCurrentOrgId(), id);
}

export async function sumReceiptsByRecord(
  recordIds: string[],
): Promise<Map<string, number>> {
  return shared.sumReceiptsByRecord(createClient(), await getCurrentOrgId(), recordIds);
}

export async function countOpenTasksByRecord(
  recordIds: string[],
): Promise<Map<string, number>> {
  return shared.countOpenTasksByRecord(createClient(), await getCurrentOrgId(), recordIds);
}

export async function countReceiptsByRecord(
  recordIds: string[],
): Promise<Map<string, number>> {
  return shared.countReceiptsByRecord(createClient(), await getCurrentOrgId(), recordIds);
}

export async function recordPickerData(): Promise<{
  byProject: Record<string, { id: string; name: string }[]>;
  labelByProject: Record<string, string>;
  nameById: Record<string, string>;
}> {
  return shared.recordPickerData(createClient(), await getCurrentOrgId());
}

export async function listRecordTasks(
  recordId: string,
): Promise<Database["public"]["Tables"]["tasks"]["Row"][]> {
  return shared.listRecordTasks(createClient(), await getCurrentOrgId(), recordId);
}
