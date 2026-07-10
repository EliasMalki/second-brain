import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { transcribeVoiceCapture } from "@/lib/db/captures";

/**
 * Voice transcription over HTTP (v1 feature 1). Receives the recorded audio as
 * multipart form-data and transcribes it, returning the text for the composer
 * to review/edit — it does NOT auto-file (transcribe-first). Only a failed
 * transcription is persisted server-side (durable audio + retry-able Inbox
 * note). Node runtime: reuses the org-scoped query layer and streams a real
 * File to Supabase Storage.
 */
export const runtime = "nodejs";
export const maxDuration = 60; // headroom for the transcription round-trip

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
    const result = await transcribeVoiceCapture({ audio, mimeType });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Voice transcription failed" },
      { status: 500 },
    );
  }
}
