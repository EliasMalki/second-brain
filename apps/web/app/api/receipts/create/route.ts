import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { imageExt, isHeic, heicToJpeg } from "@/lib/heic";
import { createReceiptFromScan } from "@/lib/db/receipts";

/**
 * Save a scanned receipt (v1 feature 2). A route handler (not a server action)
 * because the image exceeds the 1 MB server-action body limit. Persists the
 * receipt + its image(s) under the new receipt id — the upload-at-save model,
 * so nothing is written to storage until there's a receipt to own it.
 *
 * The client sends ONLY the original photo (one image), so the request stays
 * under Vercel's ~4.5 MB body limit; the server re-converts HEIC→JPEG here
 * (fast, ~1s) rather than receiving both images. All writes are org-scoped +
 * RLS-enforced (cookie session).
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // stay under Vercel's serverless body limit

export async function POST(request: Request): Promise<Response> {
  const user = await getUser();
  if (!user) {
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

  const projectId = String(form.get("projectId") ?? "");
  const recordId = String(form.get("recordId") ?? "");
  if (!projectId && !recordId) {
    return NextResponse.json({ error: "Missing project context." }, { status: 400 });
  }

  const rawAmount = String(form.get("amount") ?? "").trim();
  const amount = Number(rawAmount.replace(/[$,\s]/g, ""));
  if (!rawAmount || !Number.isFinite(amount)) {
    return NextResponse.json({ error: "Amount must be a number." }, { status: 400 });
  }
  const currency = (String(form.get("currency") ?? "").trim() || "CAD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    return NextResponse.json(
      { error: "Currency must be a 3-letter code (e.g. CAD)." },
      { status: 400 },
    );
  }
  const vendor = String(form.get("vendor") ?? "").trim();
  const purchasedOn = String(form.get("purchasedOn") ?? "").trim();
  const note = String(form.get("note") ?? "").trim();

  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return NextResponse.json({ error: "No photo in request" }, { status: 400 });
  }
  if (photo.size > MAX_BYTES) {
    return NextResponse.json({ error: "Photo is too large (4 MB max)." }, { status: 400 });
  }
  const originalMime = photo.type || "";
  const originalExt = imageExt(originalMime);
  if (!originalExt) {
    return NextResponse.json({ error: "Unsupported image type." }, { status: 400 });
  }
  const originalBytes = Buffer.from(await photo.arrayBuffer());

  let display: { data: Buffer; mime: string; ext: string };
  let original: { data: Buffer; mime: string; ext: string } | null;
  if (isHeic(originalMime)) {
    // Store the renderable JPEG (display) + the original HEIC. Re-convert here
    // so the client only had to upload one image.
    display = { data: await heicToJpeg(originalBytes), mime: "image/jpeg", ext: "jpg" };
    original = { data: originalBytes, mime: originalMime, ext: originalExt };
  } else {
    // Non-HEIC: the original renders directly — it is the display, no separate copy.
    display = { data: originalBytes, mime: originalMime, ext: originalExt };
    original = null;
  }

  try {
    const receipt = await createReceiptFromScan({
      amount,
      currency,
      vendor: vendor || null,
      purchasedOn: purchasedOn || null,
      note: note || null,
      projectId: projectId || null,
      recordId: recordId || null,
      display,
      original,
    });
    return NextResponse.json({ id: receipt.id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Save failed" },
      { status: 500 },
    );
  }
}
