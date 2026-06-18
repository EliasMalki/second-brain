import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import type { Database } from "@/lib/database.types";

export type Receipt = Database["public"]["Tables"]["receipts"]["Row"];

/**
 * Receipts data access (BUILD_SPEC §10): MANUAL entry only in v0.5 — amount,
 * currency, vendor, date, note, optional photo. No OCR. All reads filter by
 * org_id; all writes set org_id + owner_id. Photos live in the private
 * 'receipts' bucket, reachable only through short-lived signed URLs.
 */

const BUCKET = "receipts";

export type ReceiptWithPhoto = Receipt & { photo_path: string | null };

export async function listReceipts(scope: {
  projectId?: string;
  recordId?: string;
}): Promise<ReceiptWithPhoto[]> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  let query = supabase
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
  const { data: atts, error: attErr } = await supabase
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
export async function signedPhotoUrl(path: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error) return null; // a missing photo must not break the receipts list
  return data.signedUrl;
}

const IMAGE_EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

// 4 MB keeps the upload under Vercel's ~4.5 MB serverless body limit. The
// /api/receipts/manual route enforces the same cap before the bytes reach here.
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

export async function createReceipt(input: {
  amount: number;
  currency: string;
  vendor?: string | null;
  purchasedOn?: string | null;
  note?: string | null;
  projectId?: string | null;
  recordId?: string | null;
  photo?: File | null;
}): Promise<Receipt> {
  const user = await requireUser();
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  if (!input.projectId && !input.recordId) {
    throw new Error("A receipt needs a project or a record.");
  }

  // validate the photo BEFORE creating the row, so a bad file rejects cleanly
  let ext: string | null = null;
  if (input.photo && input.photo.size > 0) {
    ext = IMAGE_EXT_BY_MIME[input.photo.type] ?? null;
    if (!ext) throw new Error("Photo must be a JPEG, PNG, WebP, or HEIC image.");
    if (input.photo.size > MAX_PHOTO_BYTES) {
      throw new Error("Photo is too large (4 MB max).");
    }
  }

  const { data: receipt, error } = await supabase
    .from("receipts")
    .insert({
      org_id: orgId,
      owner_id: user.id,
      project_id: input.projectId ?? null,
      record_id: input.recordId ?? null,
      amount: input.amount,
      currency: input.currency,
      vendor: input.vendor ?? null,
      purchased_on: input.purchasedOn ?? null,
      note: input.note ?? null,
      source: "app" as const,
    })
    .select()
    .single();

  if (error) throw new Error(`createReceipt: ${error.message}`);

  if (input.photo && ext) {
    const path = `${orgId}/${receipt.id}/photo.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, input.photo, { contentType: input.photo.type });
    if (upErr) {
      throw new Error(`Receipt saved, but photo upload failed: ${upErr.message}`);
    }

    const { error: attErr } = await supabase.from("attachments").insert({
      org_id: orgId,
      owner_type: "receipt",
      owner_id: receipt.id,
      file_url: path,
      mime_type: input.photo.type,
      caption: "display",
    });
    if (attErr) {
      throw new Error(`Receipt saved, but photo link failed: ${attErr.message}`);
    }
  }

  return receipt;
}

/**
 * Create a receipt from a scan (v1 feature 2). The images were already produced
 * by /api/receipts/scan; here we persist them under the new receipt id (the
 * upload-at-save model — no storage orphans). A scanned HEIC stores BOTH the
 * renderable JPEG (caption 'display') and the original HEIC (caption
 * 'original'); a non-HEIC stores its single image as 'display'.
 *
 * Order mirrors createReceipt: row first, then uploads, then attachment rows.
 */
export async function createReceiptFromScan(input: {
  amount: number;
  currency: string;
  vendor?: string | null;
  purchasedOn?: string | null;
  note?: string | null;
  projectId?: string | null;
  recordId?: string | null;
  display: { data: Buffer; mime: string; ext: string };
  original?: { data: Buffer; mime: string; ext: string } | null;
}): Promise<Receipt> {
  const user = await requireUser();
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  if (!input.projectId && !input.recordId) {
    throw new Error("A receipt needs a project or a record.");
  }

  const { data: receipt, error } = await supabase
    .from("receipts")
    .insert({
      org_id: orgId,
      owner_id: user.id,
      project_id: input.projectId ?? null,
      record_id: input.recordId ?? null,
      amount: input.amount,
      currency: input.currency,
      vendor: input.vendor ?? null,
      purchased_on: input.purchasedOn ?? null,
      note: input.note ?? null,
      source: "app" as const,
    })
    .select()
    .single();
  if (error) throw new Error(`createReceiptFromScan: ${error.message}`);

  const images: { data: Buffer; mime: string; path: string; caption: string }[] = [
    {
      data: input.display.data,
      mime: input.display.mime,
      path: `${orgId}/${receipt.id}/image.${input.display.ext}`,
      caption: "display",
    },
  ];
  if (input.original) {
    images.push({
      data: input.original.data,
      mime: input.original.mime,
      path: `${orgId}/${receipt.id}/original.${input.original.ext}`,
      caption: "original",
    });
  }

  for (const img of images) {
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(img.path, img.data, { contentType: img.mime });
    if (upErr) {
      throw new Error(`Receipt saved, but image upload failed: ${upErr.message}`);
    }
    const { error: attErr } = await supabase.from("attachments").insert({
      org_id: orgId,
      owner_type: "receipt",
      owner_id: receipt.id,
      file_url: img.path,
      mime_type: img.mime,
      caption: img.caption,
    });
    if (attErr) {
      throw new Error(`Receipt saved, but image link failed: ${attErr.message}`);
    }
  }

  return receipt;
}

/** Hard delete is OK here: a receipt is a data point, nothing references it. */
export async function deleteReceipt(id: string): Promise<void> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  // remove the photo first (object + attachment row); orphaned files in the
  // bucket are invisible-but-paid-for, so don't rely on nightly cleanup
  const { data: atts, error: attErr } = await supabase
    .from("attachments")
    .select("id, file_url")
    .eq("org_id", orgId)
    .eq("owner_type", "receipt")
    .eq("owner_id", id);
  if (attErr) throw new Error(`deleteReceipt attachments: ${attErr.message}`);

  if (atts.length > 0) {
    await supabase.storage.from(BUCKET).remove(atts.map((a) => a.file_url));
    const { error: delAttErr } = await supabase
      .from("attachments")
      .delete()
      .eq("org_id", orgId)
      .in(
        "id",
        atts.map((a) => a.id),
      );
    if (delAttErr) throw new Error(`deleteReceipt: ${delAttErr.message}`);
  }

  const { error } = await supabase
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
