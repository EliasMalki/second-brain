import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { heicToJpeg } from "@/lib/heic";

/**
 * TEMPORARY — Step 1 proof of the Receipt OCR feature. This route is the HARD
 * GATE: it confirms heic-convert decodes a real iPhone HEIC in the ACTUAL
 * serverless deploy environment (Vercel), returning a valid JPEG within the
 * time/memory budget. Deleted before the feature merges.
 *
 * Writes nothing to storage and logs no receipt content — it only reports
 * conversion metadata so we can judge feasibility on a deployed preview.
 *
 *   curl -F file=@receipt.heic https://<preview>/api/receipts/heic-check
 *   (must be authenticated — send your session cookie)
 */
export const runtime = "nodejs";
export const maxDuration = 60;

/** Minimal JPEG dimension reader (SOFn marker) — proves the output isn't 0×0. */
function readJpegSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let off = 2;
  while (off + 9 < buf.length) {
    if (buf[off] !== 0xff) {
      off++;
      continue;
    }
    const marker = buf[off + 1];
    const len = buf.readUInt16BE(off + 2);
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isSof) {
      return {
        height: buf.readUInt16BE(off + 5),
        width: buf.readUInt16BE(off + 7),
      };
    }
    off += 2 + len;
  }
  return null;
}

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

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }

  const started = Date.now();
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const jpeg = await heicToJpeg(input);
    const decodeMs = Date.now() - started;
    const validJpeg =
      jpeg.length > 3 &&
      jpeg[0] === 0xff &&
      jpeg[1] === 0xd8 &&
      jpeg[2] === 0xff;
    const dims = readJpegSize(jpeg);

    return NextResponse.json({
      ok: validJpeg,
      inputMime: file.type || null,
      inputBytes: input.length,
      outBytes: jpeg.length,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
      decodeMs,
      node: process.version,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "convert failed",
        decodeMs: Date.now() - started,
        node: process.version,
      },
      { status: 500 },
    );
  }
}
