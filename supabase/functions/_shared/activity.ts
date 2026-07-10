// deno-lint-ignore-file no-explicit-any
// Deno-side activity logger for the edge functions (nightly, classify-capture).
// Separate impl from lib/db/activity.ts — Deno/npm-specifier runtime, and the
// edge client is untyped (service role, BYPASSRLS), so org_id/owner_id are set
// by hand from the mutated row. Best-effort: NEVER throws — a failed log must
// not fail the night or discard a capture.

type SupabaseClient = any;

export async function logActivity(
  supabase: SupabaseClient,
  input: {
    orgId: string;
    ownerId: string | null;
    actor: string; // 'nightly' | 'classifier' | 'recurrence' | ...
    action: string;
    entityType?: string; // default 'task'
    entityId: string | null;
    summary?: string | null;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const { error } = await supabase.from("activity_log").insert({
      org_id: input.orgId,
      owner_id: input.ownerId,
      actor: input.actor,
      action: input.action,
      entity_type: input.entityType ?? "task",
      entity_id: input.entityId,
      summary: input.summary ?? null,
      detail: input.detail ?? {},
    });
    if (error) console.error("logActivity(edge):", error.message);
  } catch (e) {
    console.error("logActivity(edge) threw (swallowed):", e);
  }
}
