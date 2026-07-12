import type { Db } from "../supabase";
import type { Database } from "../types/database";

export type Receipt = Database["public"]["Tables"]["receipts"]["Row"];

/**
 * Receipts data access — the platform-agnostic read/P&L side (BUILD_SPEC §10).
 * All reads filter by org_id. The receipt CREATE paths (manual + scan) live in
 * each app: they orchestrate platform pieces (multipart File/Buffer uploads,
 * the service-role discrepancy-check invoke).
 *
 * Photos live in the private 'receipts' bucket, reachable only through
 * short-lived signed URLs.
 */

const BUCKET = "receipts";

export type ReceiptWithPhoto = Receipt & { photo_path: string | null };

export async function listReceipts(
  db: Db,
  orgId: string,
  scope: {
    projectId?: string;
    recordId?: string;
  },
): Promise<ReceiptWithPhoto[]> {
  let query = db
    .from("receipts")
    .select("*")
    .eq("org_id", orgId)
    .order("purchased_on", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (scope.recordId) query = query.eq("record_id", scope.recordId);
  else if (scope.projectId) query = query.eq("project_id", scope.projectId);
  else throw new Error("listReceipts: a projectId or recordId is required.");

  const { data, error } = await query;
  if (error) throw new Error(`listReceipts: ${error.message}`);
  if (data.length === 0) return [];

  // one round trip for all photo attachments of these receipts
  const { data: atts, error: attErr } = await db
    .from("attachments")
    .select("owner_id, file_url, caption")
    .eq("org_id", orgId)
    .eq("owner_type", "receipt")
    .in(
      "owner_id",
      data.map((r) => r.id),
    );
  if (attErr) throw new Error(`listReceipts attachments: ${attErr.message}`);

  // A scanned receipt has two attachments: the renderable JPEG (caption
  // 'display') and the original HEIC (caption 'original'). Prefer 'display';
  // a legacy single attachment (caption null) is the display by default.
  const photoByReceipt = new Map<string, string>();
  for (const a of atts) {
    if (a.caption === "display" || !photoByReceipt.has(a.owner_id)) {
      photoByReceipt.set(a.owner_id, a.file_url);
    }
  }
  return data.map((r) => ({
    ...r,
    photo_path: photoByReceipt.get(r.id) ?? null,
  }));
}

/** Photos are stored by path; the UI gets a 1-hour signed URL, never a public one. */
export async function signedPhotoUrl(db: Db, path: string): Promise<string | null> {
  const { data, error } = await db.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error) return null; // a missing photo must not break the receipts list
  return data.signedUrl;
}

/**
 * Repoint a receipt to a different project — used by the Inbox discrepancy
 * "reclassify" action (v1 feature 4). Clears any record_id so the receipt lands
 * cleanly under the chosen project.
 */
export async function updateReceiptProject(
  db: Db,
  orgId: string,
  id: string,
  projectId: string,
): Promise<void> {
  const { error } = await db
    .from("receipts")
    .update({ project_id: projectId, record_id: null })
    .eq("org_id", orgId)
    .eq("id", id);
  if (error) throw new Error(`updateReceiptProject: ${error.message}`);
}

/** Hard delete is OK here: a receipt is a data point, nothing references it. */
export async function deleteReceipt(db: Db, orgId: string, id: string): Promise<void> {
  // remove the photo first (object + attachment row); orphaned files in the
  // bucket are invisible-but-paid-for, so don't rely on nightly cleanup
  const { data: atts, error: attErr } = await db
    .from("attachments")
    .select("id, file_url")
    .eq("org_id", orgId)
    .eq("owner_type", "receipt")
    .eq("owner_id", id);
  if (attErr) throw new Error(`deleteReceipt attachments: ${attErr.message}`);

  if (atts.length > 0) {
    await db.storage.from(BUCKET).remove(atts.map((a) => a.file_url));
    const { error: delAttErr } = await db
      .from("attachments")
      .delete()
      .eq("org_id", orgId)
      .in(
        "id",
        atts.map((a) => a.id),
      );
    if (delAttErr) throw new Error(`deleteReceipt: ${delAttErr.message}`);
  }

  const { error } = await db
    .from("receipts")
    .delete()
    .eq("org_id", orgId)
    .eq("id", id);
  if (error) throw new Error(`deleteReceipt: ${error.message}`);
}

/** Sum for a scope (project page / record page header). Currency-blind in v0.5. */
export function sumAmounts(receipts: Receipt[]): number {
  return receipts.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
}
