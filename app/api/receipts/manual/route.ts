import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createReceipt } from "@/lib/db/receipts";

/**
 * Save a manually-entered receipt (BUILD_SPEC §10). A route handler — not a
 * server action — so the optional photo can exceed the 1 MB server-action body
 * limit, exactly like the scan-save path (/api/receipts/create). The request
 * stays under Vercel's ~4.5 MB serverless body limit (4 MB photo cap).
 *
 * createReceipt does the real work: validates fields, inserts the org-scoped
 * row (RLS-enforced via the cookie session), and stores the photo in the
 * private bucket. The scan/OCR flow is untouched — this is the legacy
 * manual-entry path moving off the body-limited server action.
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

  const projectId = String(form.get("project_id") ?? "");
  const recordId = String(form.get("record_id") ?? "");
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
  const purchasedOn = String(form.get("purchased_on") ?? "").trim();
  const note = String(form.get("note") ?? "").trim();

  // Photo is optional. Reject oversize here with a clean message so the request
  // never trips Vercel's 413 (createReceipt also guards as a backstop).
  const photoEntry = form.get("photo");
  const photo =
    photoEntry instanceof File && photoEntry.size > 0 ? photoEntry : null;
  if (photo && photo.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Photo is too large (4 MB max)." },
      { status: 400 },
    );
  }

  try {
    const receipt = await createReceipt({
      amount,
      currency,
      vendor: vendor || null,
      purchasedOn: purchasedOn || null,
      note: note || null,
      projectId: projectId || null,
      recordId: recordId || null,
      photo,
    });
    return NextResponse.json({ id: receipt.id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Save failed" },
      { status: 500 },
    );
  }
}
