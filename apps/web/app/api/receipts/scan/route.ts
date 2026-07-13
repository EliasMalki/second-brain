import { NextResponse } from "next/server";
import { resolveApiAuth } from "@/lib/api-auth";
import { isHeic, heicToJpeg, imageExt } from "@/lib/heic";
import { listRecords } from "@second-brain/shared/db/records";
import { extractReceipt, type ReceiptExtraction } from "@/lib/receipt-ocr";
import { serverEnv } from "@/lib/env";

/**
 * Receipt scan (v1 feature 2). Receives a photo, converts HEIC→JPEG if needed,
 * and returns the displayable image bytes to the client. It writes NOTHING to
 * storage — images are persisted only on Save (under the receipt id), so an
 * abandoned scan leaves no orphans.
 *
 * Step 3: convert + return only. Step 4 adds vision extraction to the response.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // stay under Vercel's serverless body limit

export async function POST(request: Request): Promise<Response> {
  const auth = await resolveApiAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data" },
      { status: 400 },
    );
  }

  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No photo in request" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Photo is too large (4 MB max)." },
      { status: 400 },
    );
  }
  const originalMime = file.type || "";
  const originalExt = imageExt(originalMime);
  if (!originalExt) {
    return NextResponse.json(
      { error: "Photo must be a JPEG, PNG, WebP, or HEIC image." },
      { status: 400 },
    );
  }

  const projectId = String(form.get("projectId") ?? "");
  const recordId = String(form.get("recordId") ?? "");

  try {
    const inputBuf = Buffer.from(await file.arrayBuffer());
    const converted = isHeic(originalMime);
    // HEIC → JPEG; other formats already render + the vision model accepts them.
    const displayBuf = converted ? await heicToJpeg(inputBuf) : inputBuf;
    const imageMime = converted ? "image/jpeg" : originalMime;
    const imageBase64 = displayBuf.toString("base64");

    // Candidate records for the suggestion — only when scanning at project level
    // (on a record page the record is already fixed). org-scoped via listRecords.
    let records: { id: string; name: string }[] = [];
    if (projectId && !recordId) {
      try {
        const recs = await listRecords(auth.supabase, auth.orgId, projectId);
        records = recs.map((r) => ({ id: r.id, name: r.name }));
      } catch {
        records = []; // a suggestion is best-effort; never blocks the scan
      }
    }

    // Vision extraction — best-effort. On failure we still return the image so
    // the confirm form opens as manual entry (the photo is never lost).
    let extraction: ReceiptExtraction | null = null;
    try {
      extraction = await extractReceipt(
        { base64: imageBase64, mime: imageMime },
        {
          model: serverEnv.receiptVisionModel(),
          today: new Date().toISOString().slice(0, 10),
          records,
        },
      );
    } catch {
      extraction = null;
    }

    // Never trust the model with tenancy: only keep a suggested record id that is
    // actually one of this project's records.
    const suggestedRecordId =
      extraction?.suggested_record_id &&
      records.some((r) => r.id === extraction!.suggested_record_id)
        ? extraction.suggested_record_id
        : null;

    return NextResponse.json({
      imageBase64,
      imageMime,
      originalMime,
      originalExt,
      originalName: file.name || `receipt.${originalExt}`,
      converted,
      readable: extraction?.readable ?? false,
      extraction: extraction
        ? { ...extraction, suggested_record_id: suggestedRecordId }
        : null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Scan failed" },
      { status: 500 },
    );
  }
}
