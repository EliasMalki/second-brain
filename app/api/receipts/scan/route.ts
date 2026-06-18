import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isHeic, heicToJpeg, imageExt } from "@/lib/heic";

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

const MAX_BYTES = 10 * 1024 * 1024; // matches the manual receipt-photo cap

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

  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No photo in request" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Photo is too large (10 MB max)." },
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

  try {
    const inputBuf = Buffer.from(await file.arrayBuffer());
    const converted = isHeic(originalMime);
    // HEIC → JPEG; other formats already render + the vision model accepts them.
    const displayBuf = converted ? await heicToJpeg(inputBuf) : inputBuf;
    const imageMime = converted ? "image/jpeg" : originalMime;

    return NextResponse.json({
      imageBase64: displayBuf.toString("base64"),
      imageMime,
      originalMime,
      originalExt,
      originalName: file.name || `receipt.${originalExt}`,
      converted,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Scan failed" },
      { status: 500 },
    );
  }
}
