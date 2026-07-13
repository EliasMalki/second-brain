import type { Db } from "@second-brain/shared";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import { listProjects } from "@/lib/db/projects";
import { listProjects as sharedListProjects } from "@second-brain/shared/db/projects";
import { transcribeAudio } from "@/lib/transcribe";
import { publicEnv, serverEnv } from "@/lib/env";
import { cookieCtx, type ApiAuth } from "@/lib/api-auth";
import { VOICE_FAILED_TAG } from "@second-brain/shared/domain/tags";
import * as shared from "@second-brain/shared/db/captures";
import { buildVocabPrompt } from "@second-brain/shared/db/captures";
import type { CaptureOutcome, FilingSuggestion } from "@second-brain/shared/db/captures";

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
 *
 * The WRITE pipeline stays in this app on purpose (service-role env for the
 * classifier invoke, OpenAI transcription, storage uploads); the shared module
 * owns the platform-agnostic read side (captureOutcome, listFilingSuggestions,
 * buildVocabPrompt) — re-exported below at the same import path.
 */

export { buildVocabPrompt };
export type { CaptureOutcome, FilingSuggestion };

export async function captureOutcome(captureId: string): Promise<CaptureOutcome> {
  return shared.captureOutcome(createClient(), await getCurrentOrgId(), captureId);
}

export async function listFilingSuggestions(input: {
  noteIds: string[];
  taskIds: string[];
}): Promise<{
  notes: Record<string, FilingSuggestion>;
  tasks: Record<string, FilingSuggestion>;
}> {
  return shared.listFilingSuggestions(createClient(), await getCurrentOrgId(), input);
}

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
export async function captureText(
  rawText: string,
  ctx?: ApiAuth,
): Promise<{ noteId: string; captureId: string }> {
  const { supabase, userId, orgId } = ctx ?? (await cookieCtx());
  const user = { id: userId };

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

  return { noteId: note.id, captureId: capture.id };
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
  // iOS (expo-audio) records m4a and may report either of these mimes; without
  // the mapping a failed transcription is stored as .webm and retry re-sends the
  // wrong filename to OpenAI, breaking retry.
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/aac": "aac",
};

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // OpenAI upload limit

// Marks the placeholder note a failed transcription leaves in the Inbox (moved
// to shared/domain/tags so client components can read it; re-exported for
// server callers).
export { VOICE_FAILED_TAG };

function audioExt(mimeType: string): string {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  return AUDIO_EXT_BY_MIME[base] ?? "webm";
}

export type VoiceTranscriptionResult = {
  // Set only on failure — the id of the recovery capture whose audio can be
  // re-transcribed from the Inbox. Null on success (nothing is filed).
  captureId: string | null;
  transcript: string | null;
  transcriptionFailed: boolean;
};

/**
 * Voice transcription (v1 feature 1, transcribe-first). The recording is
 * transcribed and the text is handed straight back to the composer for the
 * user to review/edit — it does NOT auto-file. From the box the user sends it
 * through the normal capture/command path, exactly like typed text (so a voice
 * note can become a task, note, or command, not just an Inbox note).
 *
 * The never-lose invariant still holds where it counts: a *failed* transcription
 * is not thrown away. We persist the audio durably (capture row + private
 * bucket + attachment) and drop a retry-able placeholder note in the Inbox —
 * the same recording the Inbox "Retry" re-downloads and re-transcribes. A
 * *successful* transcript needs no server-side archive: it's now in the user's
 * hands in the composer, just like anything they typed.
 */
export async function transcribeVoiceCapture(
  input: {
    audio: File;
    mimeType: string;
  },
  ctx?: ApiAuth,
): Promise<VoiceTranscriptionResult> {
  const { supabase, userId, orgId } = ctx ?? (await cookieCtx());

  if (!input.audio || input.audio.size === 0) {
    throw new Error("Empty audio recording.");
  }
  if (input.audio.size > MAX_AUDIO_BYTES) {
    throw new Error("Recording is too large (25 MB max).");
  }

  // Transcribe first (vocabulary-steered). On success the text goes back to the
  // composer and nothing is written server-side.
  try {
    const projects = await sharedListProjects(supabase, orgId);
    const transcript = await transcribeAudio(input.audio, {
      model: serverEnv.transcriptionModel(),
      prompt: buildVocabPrompt(projects),
    });
    return { captureId: null, transcript, transcriptionFailed: false };
  } catch (e) {
    // Transcription failed — do NOT lose the recording. Persist it durably and
    // surface a retry-able placeholder in the Inbox.
    const message = e instanceof Error ? e.message : String(e);
    const captureId = await persistFailedVoiceCapture({
      supabase,
      orgId,
      ownerId: userId,
      audio: input.audio,
      mimeType: input.mimeType,
      error: message,
    });
    return { captureId, transcript: null, transcriptionFailed: true };
  }
}

/**
 * Durable landing spot for a voice note whose transcription failed. Writes the
 * anchor capture, uploads the audio to the private bucket (org-scoped path =>
 * RLS isolated), attaches it, and files a retry-able placeholder note in the
 * Inbox. retryVoiceTranscription (below) finds this capture by its result_id and
 * re-transcribes the still-durable audio — so the recording is never lost.
 */
async function persistFailedVoiceCapture(input: {
  supabase: Db;
  orgId: string;
  ownerId: string;
  audio: File;
  mimeType: string;
  error: string;
}): Promise<string> {
  const { supabase, orgId, ownerId, audio, mimeType, error } = input;

  // 1. anchor capture row (already known-failed)
  const { data: capture, error: capErr } = await supabase
    .from("captures")
    .insert({
      org_id: orgId,
      owner_id: ownerId,
      source: "voice",
      status: "failed",
      result_kind: "none",
    })
    .select("id")
    .single();
  if (capErr) throw new Error(`voiceFail (capture): ${capErr.message}`);

  // 2. save the audio to the private bucket so Retry can re-transcribe it
  const path = `${orgId}/${capture.id}/audio.${audioExt(mimeType)}`;
  const { error: upErr } = await supabase.storage
    .from(VOICE_BUCKET)
    .upload(path, audio, { contentType: mimeType });
  if (upErr) throw new Error(`voiceFail (upload): ${upErr.message}`);

  // 3. attach it to the capture
  const { error: attErr } = await supabase.from("attachments").insert({
    org_id: orgId,
    owner_type: "capture",
    owner_id: capture.id,
    file_url: path,
    mime_type: mimeType,
  });
  if (attErr) throw new Error(`voiceFail (attachment): ${attErr.message}`);

  // 4. retry-able placeholder note in the Inbox
  const { data: note } = await supabase
    .from("notes")
    .insert({
      org_id: orgId,
      owner_id: ownerId,
      project_id: null,
      body: "🎙️ Voice note — couldn’t transcribe it. Use Retry to try again.",
      kind: "quick",
      source: "voice",
      tags: [VOICE_FAILED_TAG],
    })
    .select("id")
    .single();

  // 5. link the note + stash the error so Retry can find the recording
  await supabase
    .from("captures")
    .update({
      result_kind: note ? "note" : "none",
      result_id: note?.id ?? null,
      interpretation: { transcription_error: error },
    })
    .eq("org_id", orgId)
    .eq("id", capture.id);

  return capture.id;
}

/**
 * Retry a failed voice transcription from the Inbox. Finds the failed voice
 * capture behind the placeholder note, re-downloads its (still durable) audio
 * from the private bucket, transcribes again, and on success heals the note +
 * capture and classifies — joining the normal pipeline. Best-effort: a second
 * failure leaves everything in place to retry again.
 */
export async function retryVoiceTranscription(
  noteId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data: capture, error: capErr } = await supabase
    .from("captures")
    .select("id, result_id, source, status")
    .eq("org_id", orgId)
    .eq("source", "voice")
    .eq("result_id", noteId)
    .maybeSingle();
  if (capErr) throw new Error(`retryVoice (capture): ${capErr.message}`);
  if (!capture) return { ok: false, error: "No voice recording to retry." };

  const { data: att, error: attErr } = await supabase
    .from("attachments")
    .select("file_url")
    .eq("org_id", orgId)
    .eq("owner_type", "capture")
    .eq("owner_id", capture.id)
    .maybeSingle();
  if (attErr) throw new Error(`retryVoice (attachment): ${attErr.message}`);
  if (!att) return { ok: false, error: "The recording is missing." };

  const { data: blob, error: dlErr } = await supabase.storage
    .from(VOICE_BUCKET)
    .download(att.file_url);
  if (dlErr || !blob) return { ok: false, error: "Couldn't read the recording." };

  let transcript: string;
  try {
    const projects = await listProjects();
    transcript = await transcribeAudio(blob, {
      model: serverEnv.transcriptionModel(),
      prompt: buildVocabPrompt(projects),
      filename: att.file_url.split("/").pop() || "audio.webm",
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Transcription failed again.",
    };
  }

  // Heal the placeholder note + capture, then classify (interpretation back to
  // null so the classifier re-evaluates it as a fresh thought).
  await supabase
    .from("notes")
    .update({ body: transcript, original_text: transcript, tags: [] })
    .eq("org_id", orgId)
    .eq("id", noteId);
  await supabase
    .from("captures")
    .update({ raw_text: transcript, status: "processed", interpretation: null })
    .eq("org_id", orgId)
    .eq("id", capture.id);

  invokeClassifier(capture.id);
  return { ok: true };
}
