import "server-only";

import { serverEnv } from "@/lib/env";

/**
 * Voice transcription via OpenAI's audio API (v1 feature 1). A thin fetch — no
 * SDK dependency — matching the app's existing "fetch the provider directly"
 * style (see the classifier invoke in lib/db/captures.ts).
 *
 * The model is a config value (serverEnv.transcriptionModel, default
 * gpt-4o-mini-transcribe) so it can be swapped to gpt-4o-transcribe with no
 * code change. `prompt` is the vocabulary-steering context (project names,
 * aliases, domain jargon) that biases recognition toward the user's terms.
 */
const OPENAI_TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";

export async function transcribeAudio(
  file: Blob,
  opts: { model: string; prompt?: string; filename?: string },
): Promise<string> {
  const form = new FormData();
  // OpenAI infers the format from the filename extension — keep a real one.
  // (A File carries its own name; a downloaded Blob needs one supplied.)
  const filename =
    opts.filename || (file instanceof File ? file.name : "") || "audio.webm";
  form.append("file", file, filename);
  form.append("model", opts.model);
  form.append("response_format", "json");
  if (opts.prompt) form.append("prompt", opts.prompt);

  const res = await fetch(OPENAI_TRANSCRIBE_URL, {
    method: "POST",
    // Do NOT set Content-Type — fetch adds the multipart boundary itself.
    headers: { Authorization: `Bearer ${serverEnv.openaiApiKey()}` },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `transcription failed (${res.status}): ${detail.slice(0, 300)}`,
    );
  }

  const data = (await res.json()) as { text?: string };
  const text = (data.text ?? "").trim();
  if (!text) throw new Error("transcription returned empty text");
  return text;
}
