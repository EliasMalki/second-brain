"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  archiveRecord,
  createRecord,
  createRecordType,
  updateRecordStage,
  type ChecklistItem,
  type Effort,
  type Priority,
} from "@/lib/db/records";

export type FormState = { error?: string };

const EFFORTS: Effort[] = ["quick", "deep"];
const PRIORITIES: Priority[] = ["A", "B", "C", "D"];

/** One stage per line, ordered, deduped. */
function parseStages(raw: string): string[] {
  const seen = new Set<string>();
  const stages: string[] = [];
  for (const line of raw.split("\n")) {
    const s = line.trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    stages.push(s);
  }
  return stages;
}

/**
 * One checklist item per line: "Title | effort | priority".
 * Effort (quick/deep) and priority (A–D) are optional, in either order.
 */
function parseChecklist(
  raw: string,
): { items: ChecklistItem[] } | { error: string } {
  const items: ChecklistItem[] = [];
  for (const line of raw.split("\n")) {
    const parts = line.split("|").map((p) => p.trim());
    const title = parts[0];
    if (!title) continue;

    const item: ChecklistItem = { title };
    for (const extra of parts.slice(1)) {
      const low = extra.toLowerCase();
      const up = extra.toUpperCase();
      if (EFFORTS.includes(low as Effort)) item.effort = low as Effort;
      else if (PRIORITIES.includes(up as Priority))
        item.priority = up as Priority;
      else if (extra) {
        return {
          error: `Unknown effort/priority "${extra}" — use quick/deep or A–D.`,
        };
      }
    }
    items.push(item);
  }
  return { items };
}

export async function createRecordTypeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const projectId = String(formData.get("project_id") ?? "");
  const labelSingular = String(formData.get("label_singular") ?? "").trim();
  const labelPlural = String(formData.get("label_plural") ?? "").trim();
  const stages = parseStages(String(formData.get("stages") ?? ""));
  const parsed = parseChecklist(String(formData.get("checklist") ?? ""));

  if (!projectId) return { error: "Missing project id." };
  if (!labelSingular) return { error: "Singular label is required." };
  if (!labelPlural) return { error: "Plural label is required." };
  if (stages.length === 0) return { error: "At least one stage is required." };
  if ("error" in parsed) return { error: parsed.error };

  try {
    await createRecordType({
      projectId,
      labelSingular,
      labelPlural,
      stages,
      intakeChecklist: parsed.items,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create." };
  }

  revalidatePath(`/projects/${projectId}`);
  return {};
}

export async function createRecordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const projectId = String(formData.get("project_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const stage = String(formData.get("stage") ?? "");

  if (!projectId) return { error: "Missing project id." };
  if (!name) return { error: "Name is required." };
  if (!stage) return { error: "Stage is required." };

  try {
    await createRecord({ projectId, name, stage });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create." };
  }

  revalidatePath(`/projects/${projectId}`);
  return {};
}

export async function updateRecordStageAction(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const stage = String(formData.get("stage") ?? "");
  if (!id || !stage) return;

  const record = await updateRecordStage(id, stage);
  revalidatePath(`/projects/${record.project_id}`);
  revalidatePath(`/records/${id}`);
}

export async function archiveRecordAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const projectId = String(formData.get("project_id") ?? "");
  if (!id) return;

  await archiveRecord(id);
  revalidatePath(`/records/${id}`);
  if (projectId) {
    revalidatePath(`/projects/${projectId}`);
    redirect(`/projects/${projectId}`);
  }
}
