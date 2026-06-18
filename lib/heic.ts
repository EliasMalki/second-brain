import "server-only";

import convert from "heic-convert";

/**
 * HEIC/HEIF → JPEG conversion (v1 feature 2). iPhone receipts arrive as HEIC,
 * which browsers and the vision API can't render — so this is the MAIN path,
 * not an edge case. heic-convert uses a pure-JS/WASM libheif, so it decodes in
 * the serverless runtime without a native binary (unlike sharp's prebuilds).
 */

const HEIC_MIMES = new Set(["image/heic", "image/heif"]);

/** True if this mime type needs HEIC→JPEG conversion before display/vision. */
export function isHeic(mimeType: string): boolean {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  return HEIC_MIMES.has(base);
}

/** Decode a HEIC/HEIF buffer to a JPEG buffer. */
export async function heicToJpeg(
  input: ArrayBuffer | Buffer | Uint8Array,
  quality = 0.8,
): Promise<Buffer> {
  let buffer: Buffer;
  if (Buffer.isBuffer(input)) buffer = input;
  else if (input instanceof Uint8Array) buffer = Buffer.from(input);
  else buffer = Buffer.from(new Uint8Array(input));
  const out = await convert({ buffer, format: "JPEG", quality });
  return Buffer.from(out);
}
