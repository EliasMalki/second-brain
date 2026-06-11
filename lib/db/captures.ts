import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
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
