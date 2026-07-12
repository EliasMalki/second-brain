import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import { publicEnv, serverEnv } from "@/lib/env";
import * as shared from "@second-brain/shared/db/receipts";
import type { Receipt, ReceiptWithPhoto } from "@second-brain/shared/db/receipts";

/**
 * Receipts — web side. The read/P&L half lives in @second-brain/shared/db/
 * receipts (adapters + re-exports below). The CREATE paths stay here on
 * purpose: they orchestrate platform pieces — multipart File/Buffer uploads to
 * the private bucket and the service-role discrepancy-check invoke.
 */

export type { Receipt, ReceiptWithPhoto } from "@second-brain/shared/db/receipts";
export { sumAmounts } from "@second-brain/shared/db/receipts";

const BUCKET = "receipts";

/**
 * Fire-and-forget discrepancy check (v1 feature 4, Part A). Mirrors
 * invokeClassifier in lib/db/captures.ts: never awaited, never throws — a
 * receipt save must not depend on (or wait for) the misfiling check. The
 * check-discrepancy Edge Function compares the receipt against its project's
 * description and, only on a clear mismatch, files a gentle Inbox question.
 * Receipts filed to a record (no project_id) are skipped by the caller.
 */
function invokeDiscrepancyCheck(receiptId: string): void {
  try {
    void fetch(`${publicEnv.supabaseUrl}/functions/v1/check-discrepancy`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serverEnv.supabaseServiceRoleKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ item_type: "receipt", item_id: receiptId }),
    }).catch(() => {});
  } catch {
    // misconfigured env etc. — discrepancy detection is best-effort by design
  }
}

export async function listReceipts(scope: {
  projectId?: string;
  recordId?: string;
}): Promise<ReceiptWithPhoto[]> {
  return shared.listReceipts(createClient(), await getCurrentOrgId(), scope);
}

export async function signedPhotoUrl(path: string): Promise<string | null> {
  return shared.signedPhotoUrl(createClient(), path);
}

export async function updateReceiptProject(id: string, projectId: string): Promise<void> {
  return shared.updateReceiptProject(createClient(), await getCurrentOrgId(), id, projectId);
}

export async function deleteReceipt(id: string): Promise<void> {
  return shared.deleteReceipt(createClient(), await getCurrentOrgId(), id);
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

  // Filed to a project => check for a misfiling (best-effort, never blocks).
  // Fire here, before the photo upload, so a later photo failure can't skip it.
  if (receipt.project_id) invokeDiscrepancyCheck(receipt.id);

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

  // Filed to a project => check for a misfiling (best-effort, never blocks).
  if (receipt.project_id) invokeDiscrepancyCheck(receipt.id);

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
