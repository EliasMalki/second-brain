import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { captureVoice } from "@/lib/db/captures";

/**
 * Voice capture over HTTP (v1 feature 1). Receives the recorded audio as
 * multipart form-data, persists it to the private bucket + a capture row, then
 * (in a later step) transcribes it. Node runtime: it reuses the org-scoped
 * query layer and streams a real File to Supabase Storage.
 */
export const runtime = "nodejs";
export const maxDuration = 60; // headroom for transcription added in Step 3

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

  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "No audio in request" }, { status: 400 });
  }
  const mimeType =
    String(form.get("mimeType") ?? "").trim() || audio.type || "audio/webm";

  try {
    const result = await captureVoice({ audio, mimeType });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Voice capture failed" },
      { status: 500 },
    );
  }
}
