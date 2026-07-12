import type { Db } from "../supabase";
import { logActivity } from "./activity";
import type { Database } from "../types/database";
import { EFFORTS, PRIORITIES } from "../domain/priority";

export type RecordType = Database["public"]["Tables"]["record_types"]["Row"];
export type RecordRow = Database["public"]["Tables"]["records"]["Row"];
export type Effort = Database["public"]["Enums"]["effort"];
export type Priority = Database["public"]["Enums"]["priority"];

/**
 * Records data access (BUILD_SPEC §10, minimal v0.5 cut). All reads filter by
 * org_id; all writes set org_id + owner_id. RLS is the backstop, the explicit
 * scope here is the rule.
 *
 * v0.5 surface: one record_type per project (create only, no edit UI), records
 * list + stage dropdown, intake checklist → one task per item on creation,
 * per-record P&L from receipts. NO board/Kanban, NO custom fields.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One intake checklist item, as stored in record_types.intake_checklist. */
export type ChecklistItem = {
  title: string;
  effort?: Effort | null;
  priority?: Priority;
};

/** intake_checklist is jsonb — validate shape on the way out, drop junk. */
export function parseIntakeChecklist(json: unknown): ChecklistItem[] {
  if (!Array.isArray(json)) return [];
  const items: ChecklistItem[] = [];
  for (const raw of json) {
    if (typeof raw !== "object" || raw === null) continue;
    const o = raw as Record<string, unknown>;
    if (typeof o.title !== "string" || !o.title.trim()) continue;
    items.push({
      title: o.title,
      effort: EFFORTS.includes(o.effort as Effort) ? (o.effort as Effort) : null,
      priority: PRIORITIES.includes(o.priority as Priority)
        ? (o.priority as Priority)
        : undefined,
    });
  }
  return items;
}

/** A project optionally has ONE record_type in v0.5 (§10). */
export async function getRecordTypeForProject(
  db: Db,
  orgId: string,
  projectId: string,
): Promise<RecordType | null> {
  if (!UUID_RE.test(projectId)) return null;

  const { data, error } = await db
    .from("record_types")
    .select("*")
    .eq("org_id", orgId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getRecordTypeForProject: ${error.message}`);
  return data;
}

export async function getRecordType(
  db: Db,
  orgId: string,
  id: string,
): Promise<RecordType | null> {
  if (!UUID_RE.test(id)) return null;

  const { data, error } = await db
    .from("record_types")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`getRecordType: ${error.message}`);
  return data;
}

export async function createRecordType(
  db: Db,
  orgId: string,
  input: {
    projectId: string;
    labelSingular: string;
    labelPlural: string;
    stages: string[];
    intakeChecklist: ChecklistItem[];
  },
): Promise<RecordType> {
  // §10: one record_type per project — refuse a second.
  const existing = await getRecordTypeForProject(db, orgId, input.projectId);
  if (existing) {
    throw new Error("This project already has a record type.");
  }

  const { data, error } = await db
    .from("record_types")
    .insert({
      org_id: orgId,
      project_id: input.projectId,
      label_singular: input.labelSingular,
      label_plural: input.labelPlural,
      stages: input.stages,
      intake_checklist: input.intakeChecklist,
    })
    .select()
    .single();

  if (error) throw new Error(`createRecordType: ${error.message}`);
  return data;
}

export async function listRecords(
  db: Db,
  orgId: string,
  projectId: string,
  opts?: { includeArchived?: boolean },
): Promise<RecordRow[]> {
  let query = db
    .from("records")
    .select("*")
    .eq("org_id", orgId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (!opts?.includeArchived) {
    query = query.eq("status", "active");
  }

  const { data, error } = await query;
  if (error) throw new Error(`listRecords: ${error.message}`);
  return data;
}

export async function getRecord(db: Db, orgId: string, id: string): Promise<RecordRow | null> {
  if (!UUID_RE.test(id)) return null;

  const { data, error } = await db
    .from("records")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`getRecord: ${error.message}`);
  return data;
}

/**
 * Create a record, then run its type's intake checklist: one task per item,
 * each with record_id set (§10 — reuses the plain tasks write path). If the
 * task insert fails the record still exists; the error surfaces to the form.
 */
export async function createRecord(
  db: Db,
  orgId: string,
  ownerId: string,
  input: {
    projectId: string;
    name: string;
    stage: string;
  },
): Promise<RecordRow> {
  const type = await getRecordTypeForProject(db, orgId, input.projectId);
  if (!type) throw new Error("This project has no record type.");
  if (!type.stages.includes(input.stage)) {
    throw new Error(`Unknown stage "${input.stage}".`);
  }

  const { data: record, error } = await db
    .from("records")
    .insert({
      org_id: orgId,
      owner_id: ownerId,
      project_id: input.projectId,
      record_type_id: type.id,
      name: input.name,
      stage: input.stage,
    })
    .select()
    .single();

  if (error) throw new Error(`createRecord: ${error.message}`);

  const checklist = parseIntakeChecklist(type.intake_checklist);
  if (checklist.length > 0) {
    const { data: intakeTasks, error: taskErr } = await db
      .from("tasks")
      .insert(
        checklist.map((item) => ({
          org_id: orgId,
          owner_id: ownerId,
          project_id: input.projectId,
          record_id: record.id,
          title: item.title,
          effort: item.effort ?? null,
          // checklist defaults are system defaults, so priority_set_by stays
          // 'system' (the schema default)
          ...(item.priority ? { priority: item.priority } : {}),
          source: "app" as const,
        })),
      )
      .select("id, title");
    if (taskErr) {
      throw new Error(
        `Record created, but intake tasks failed: ${taskErr.message}`,
      );
    }
    // Log each intake task (best-effort). Manual actor — the user created the
    // record; record_intake is the reason.
    for (const t of intakeTasks ?? []) {
      await logActivity(db, {
        orgId,
        ownerId,
        actor: "user",
        action: "task_created",
        entityId: t.id,
        summary: t.title,
        detail: { reason: "record_intake", record_id: record.id },
      });
    }
  }

  return record;
}

/** Stage is app-enforced against record_type.stages (schema comment). */
export async function updateRecordStage(
  db: Db,
  orgId: string,
  id: string,
  stage: string,
): Promise<RecordRow> {
  const record = await getRecord(db, orgId, id);
  if (!record) throw new Error("Record not found.");

  const type = await getRecordType(db, orgId, record.record_type_id);
  if (!type || !type.stages.includes(stage)) {
    throw new Error(`Unknown stage "${stage}".`);
  }

  const { data, error } = await db
    .from("records")
    .update({ stage })
    .eq("org_id", orgId)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`updateRecordStage: ${error.message}`);
  return data;
}

/** Archive = status change. No hard delete: tasks/receipts may point here. */
export async function archiveRecord(db: Db, orgId: string, id: string): Promise<void> {
  const { error } = await db
    .from("records")
    .update({ status: "archived" as const })
    .eq("org_id", orgId)
    .eq("id", id);

  if (error) throw new Error(`archiveRecord: ${error.message}`);
}

/**
 * Per-record P&L (§10): sum(receipts.amount) per record_id, one query for a
 * whole record list. Records with no receipts simply aren't in the map.
 */
export async function sumReceiptsByRecord(
  db: Db,
  orgId: string,
  recordIds: string[],
): Promise<Map<string, number>> {
  if (recordIds.length === 0) return new Map();

  const { data, error } = await db
    .from("receipts")
    .select("record_id, amount")
    .eq("org_id", orgId)
    .in("record_id", recordIds);

  if (error) throw new Error(`sumReceiptsByRecord: ${error.message}`);

  const totals = new Map<string, number>();
  for (const r of data) {
    if (!r.record_id || r.amount === null) continue;
    totals.set(r.record_id, (totals.get(r.record_id) ?? 0) + Number(r.amount));
  }
  return totals;
}

/**
 * Open-task count per record (board cards). One query for a whole record list;
 * "open" matches listRecordTasks — open/snoozed/waiting. Records with none
 * simply aren't in the map.
 */
export async function countOpenTasksByRecord(
  db: Db,
  orgId: string,
  recordIds: string[],
): Promise<Map<string, number>> {
  if (recordIds.length === 0) return new Map();

  const { data, error } = await db
    .from("tasks")
    .select("record_id")
    .eq("org_id", orgId)
    .in("record_id", recordIds)
    .in("status", ["open", "snoozed", "waiting"]);

  if (error) throw new Error(`countOpenTasksByRecord: ${error.message}`);

  const counts = new Map<string, number>();
  for (const r of data) {
    if (!r.record_id) continue;
    counts.set(r.record_id, (counts.get(r.record_id) ?? 0) + 1);
  }
  return counts;
}

/** Receipt count per record (board cards), one query for a whole record list. */
export async function countReceiptsByRecord(
  db: Db,
  orgId: string,
  recordIds: string[],
): Promise<Map<string, number>> {
  if (recordIds.length === 0) return new Map();

  const { data, error } = await db
    .from("receipts")
    .select("record_id")
    .eq("org_id", orgId)
    .in("record_id", recordIds);

  if (error) throw new Error(`countReceiptsByRecord: ${error.message}`);

  const counts = new Map<string, number>();
  for (const r of data) {
    if (!r.record_id) continue;
    counts.set(r.record_id, (counts.get(r.record_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Data for the task↔record picker + record badges: active records grouped by
 * project, each project's record-type singular label, and a flat id→name map.
 * One pass over the org's records (+ its record types). All org-scoped.
 */
export async function recordPickerData(
  db: Db,
  orgId: string,
): Promise<{
  byProject: Record<string, { id: string; name: string }[]>;
  labelByProject: Record<string, string>;
  nameById: Record<string, string>;
}> {
  const [recsRes, typesRes] = await Promise.all([
    db
      .from("records")
      .select("id, name, project_id")
      .eq("org_id", orgId)
      .eq("status", "active")
      .order("name", { ascending: true }),
    db
      .from("record_types")
      .select("project_id, label_singular")
      .eq("org_id", orgId),
  ]);

  if (recsRes.error) throw new Error(`recordPickerData: ${recsRes.error.message}`);
  if (typesRes.error) throw new Error(`recordPickerData: ${typesRes.error.message}`);

  const byProject: Record<string, { id: string; name: string }[]> = {};
  const nameById: Record<string, string> = {};
  for (const r of recsRes.data ?? []) {
    if (!r.project_id) continue;
    if (!byProject[r.project_id]) byProject[r.project_id] = [];
    byProject[r.project_id].push({ id: r.id, name: r.name });
    nameById[r.id] = r.name;
  }

  const labelByProject: Record<string, string> = {};
  for (const t of typesRes.data ?? []) {
    if (t.project_id) labelByProject[t.project_id] = t.label_singular;
  }

  return { byProject, labelByProject, nameById };
}

/** Open tasks belonging to one record, for the record detail page. */
export async function listRecordTasks(
  db: Db,
  orgId: string,
  recordId: string,
): Promise<Database["public"]["Tables"]["tasks"]["Row"][]> {
  const { data, error } = await db
    .from("tasks")
    .select("*")
    .eq("org_id", orgId)
    .eq("record_id", recordId)
    .in("status", ["open", "snoozed", "waiting"])
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`listRecordTasks: ${error.message}`);
  return data;
}
