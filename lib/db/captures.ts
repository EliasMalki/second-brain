import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";

/**
 * Capture pipeline — BUILD_SPEC §4. The invariant: a capture must NEVER block
 * or be lost.
 *
 * v0.5 has no LLM classifier yet (Week 2), so every capture deterministically
 * files as an unsorted note (project_id NULL) => Inbox — which is exactly §4's
 * low-confidence fallback. When the async classifier lands, it replaces the
 * "always unsorted" routing here; this write path stays the same.
 *
 * Order matters: write the durable `captures` row FIRST, then materialize the
 * note, then back-link. If the note write ever failed, the thought still
 * survives as a captures row to recover from.
 */
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

  return { noteId: note.id };
}
