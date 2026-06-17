import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import { listProjects } from "@/lib/db/projects";
import { transcribeAudio } from "@/lib/transcribe";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Capture pipeline — BUILD_SPEC §4. The invariant: a capture must NEVER block
 * or be lost.
 *
 * The synchronous path always files the capture as an unsorted note
 * (project_id NULL) => Inbox, then returns. Classification is ASYNC and
 * best-effort: the classify-capture Edge Function is invoked fire-and-forget
 * and may re-route the note to a project or replace it with a task. If the
 * invoke is dropped or the LLM fails, the unsorted note is already safe in
 * the Inbox — exactly §4's fallback.
 *
 * Order matters: write the durable `captures` row FIRST, then materialize the
 * note, then back-link. If the note write ever failed, the thought still
 * survives as a captures row to recover from.
 */

/**
 * Fire-and-forget invoke of the classifier Edge Function. Never awaited and
 * never allowed to throw — capture success must not depend on it. The
 * function itself can also be invoked with an empty body to sweep any
 * captures this invoke missed (interpretation IS NULL).
 */
function invokeClassifier(captureId: string): void {
  try {
    void fetch(`${publicEnv.supabaseUrl}/functions/v1/classify-capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serverEnv.supabaseServiceRoleKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ capture_id: captureId }),
    }).catch(() => {});
  } catch {
    // misconfigured env etc. — classification is best-effort by design
  }
}
export async function captureText(rawText: string): Promise<{ noteId: string }> {
  const user = await requireUser();
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  // 1. durable capture record
  const { data: capture, error: capErr } = await supabase
    .from("captures")
    .insert({
      org_id: orgId,
      owner_id: user.id,
      raw_text: rawText,
      source: "app",
      status: "processed",
      result_kind: "note",
    })
    .select("id")
    .single();
  if (capErr) throw new Error(`captureText (capture): ${capErr.message}`);

  // 2. file as an unsorted note (Inbox)
  const { data: note, error: noteErr } = await supabase
    .from("notes")
    .insert({
      org_id: orgId,
      owner_id: user.id,
      project_id: null,
      body: rawText,
      kind: "quick",
      source: "app",
      original_text: rawText,
    })
    .select("id")
    .single();
  if (noteErr) throw new Error(`captureText (note): ${noteErr.message}`);

  // 3. back-link the capture to what it produced
  const { error: linkErr } = await supabase
    .from("captures")
    .update({ result_id: note.id })
    .eq("org_id", orgId)
    .eq("id", capture.id);
  if (linkErr) throw new Error(`captureText (link): ${linkErr.message}`);

  // 4. classify async — never blocks the response above
  invokeClassifier(capture.id);

  return { noteId: note.id };
}

/**
 * Voice capture (v1 feature 1). The recording is the thing we must never lose,
 * so the durable artifacts are written in a deliberate order:
 *   1. the `captures` row (the anchor)
 *   2. the audio, into the PRIVATE voice-captures bucket
 *   3. the `attachments` row (owner_type='capture')
 * ...all BEFORE any transcription is attempted. Transcription + filing into the
 * Inbox pipeline are layered on in later steps; even if they fail, the audio is
 * already safe and re-transcribable.
 *
 * Mirrors the storage pattern in lib/db/receipts.ts: user-scoped client (RLS
 * enforced), org_id as the first path segment, signed URLs only.
 */
const VOICE_BUCKET = "voice-captures";

// OpenAI's transcription endpoint accepts all of these; map the container mime
// (sans codecs) to a file extension. iOS gives audio/mp4, others webm/ogg.
const AUDIO_EXT_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/aac": "aac",
};

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // OpenAI upload limit

function audioExt(mimeType: string): string {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  return AUDIO_EXT_BY_MIME[base] ?? "webm";
}

/**
 * Vocabulary steering (BUILD_SPEC: improve recognition of domain words). Feed
 * the transcriber the user's project names + aliases plus a small jargon seed,
 * so part names / supplier names / "RBQ" / "epoxy" come back spelled right.
 * Pulled from the org's projects at request time — never hardcoded.
 */
export function buildVocabPrompt(
  projects: { name: string; aliases: string[] }[],
): string {
  const terms = new Set<string>();
  for (const p of projects) {
    if (p.name) terms.add(p.name.trim());
    for (const a of p.aliases ?? []) if (a?.trim()) terms.add(a.trim());
  }
  // A few domain terms the recognizer otherwise mangles.
  for (const seed of ["RBQ", "epoxy"]) terms.add(seed);

  const vocab = [...terms].filter(Boolean).join(", ");
  return vocab
    ? `A short personal voice note about the user's projects and tasks. Proper nouns and domain terms that may appear: ${vocab}.`
    : "A short personal voice note about the user's projects and tasks.";
}

export type VoiceCaptureResult = {
  captureId: string;
  transcript: string | null;
  transcriptionFailed: boolean;
};

export async function captureVoice(input: {
  audio: File;
  mimeType: string;
}): Promise<VoiceCaptureResult> {
  const user = await requireUser();
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  if (!input.audio || input.audio.size === 0) {
    throw new Error("Empty audio recording.");
  }
  if (input.audio.size > MAX_AUDIO_BYTES) {
    throw new Error("Recording is too large (25 MB max).");
  }

  // 1. durable capture record FIRST. raw_text stays null until transcription;
  //    result_kind stays 'none' until we file a note (a later step).
  const { data: capture, error: capErr } = await supabase
    .from("captures")
    .insert({
      org_id: orgId,
      owner_id: user.id,
      source: "voice",
      status: "processed",
      result_kind: "none",
    })
    .select("id")
    .single();
  if (capErr) throw new Error(`captureVoice (capture): ${capErr.message}`);

  // 2. save the audio to the private bucket (org_id-scoped path => RLS isolated)
  const path = `${orgId}/${capture.id}/audio.${audioExt(input.mimeType)}`;
  const { error: upErr } = await supabase.storage
    .from(VOICE_BUCKET)
    .upload(path, input.audio, { contentType: input.mimeType });
  if (upErr) throw new Error(`captureVoice (upload): ${upErr.message}`);

  // 3. attach it to the capture
  const { error: attErr } = await supabase.from("attachments").insert({
    org_id: orgId,
    owner_type: "capture",
    owner_id: capture.id,
    file_url: path,
    mime_type: input.mimeType,
  });
  if (attErr) throw new Error(`captureVoice (attachment): ${attErr.message}`);

  // 4. transcribe (vocabulary-steered). The audio is already durable above, so
  //    a failure here loses nothing — we mark the capture failed for a later
  //    retry and report it back rather than throwing the recording away.
  let transcript: string;
  try {
    const projects = await listProjects();
    transcript = await transcribeAudio(input.audio, {
      model: serverEnv.transcriptionModel(),
      prompt: buildVocabPrompt(projects),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase
      .from("captures")
      .update({ status: "failed", interpretation: { transcription_error: message } })
      .eq("org_id", orgId)
      .eq("id", capture.id);
    return { captureId: capture.id, transcript: null, transcriptionFailed: true };
  }

  // 5. file the transcript EXACTLY like typed text (captureText): persist it on
  //    the capture, drop an unsorted note in the Inbox, then classify async.
  //    From here the voice path is indistinguishable from a typed capture, so
  //    it gets identical routing/splitting behavior.
  await supabase
    .from("captures")
    .update({ raw_text: transcript })
    .eq("org_id", orgId)
    .eq("id", capture.id);

  const { data: note, error: noteErr } = await supabase
    .from("notes")
    .insert({
      org_id: orgId,
      owner_id: user.id,
      project_id: null,
      body: transcript,
      kind: "quick",
      source: "voice",
      original_text: transcript,
    })
    .select("id")
    .single();
  if (noteErr) throw new Error(`captureVoice (note): ${noteErr.message}`);

  const { error: linkErr } = await supabase
    .from("captures")
    .update({ result_kind: "note", result_id: note.id })
    .eq("org_id", orgId)
    .eq("id", capture.id);
  if (linkErr) throw new Error(`captureVoice (link): ${linkErr.message}`);

  // classify async — never blocks the response (same as captureText)
  invokeClassifier(capture.id);

  return { captureId: capture.id, transcript, transcriptionFailed: false };
}
