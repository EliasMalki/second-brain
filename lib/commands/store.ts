import "server-only";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import type { Database } from "@/lib/database.types";
import { reverse, type PriorState } from "@/lib/commands/execute";
import type { CommandVerb } from "@/lib/commands/types";

/**
 * Capture command interpreter — channel-agnostic command state, stored with NO
 * schema change (step 3: acted + undo; step 4 adds pending confirmations).
 *
 * The schema already anticipated this: result_kind has a 'command' value and
 * capture_status has 'needs_clarification'. So a command is recorded as an
 * ordinary `captures` row (raw_text = the user's line) whose `interpretation`
 * jsonb holds the command state. Because it's DB state, not client state, the
 * same record drives undo from the app today and from Telegram later — the undo
 * token is just the capture id.
 *
 * Expiry is enforced in code (there's no native TTL): an acted command can be
 * undone only within UNDO_WINDOW_MS.
 */

type SourceChannel = Database["public"]["Enums"]["source_channel"];

export const COMMAND_WINDOW_MS = 30 * 60 * 1000; // 30 min — undo + (step 4) confirm

/** The shape stored in captures.interpretation for a command row. */
type CommandRecord = {
  kind: "command";
  state: "acted" | "undone";
  verb: CommandVerb | null;
  appliedAt: string;
  expiresAt: string;
  snapshots: PriorState[];
};

function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Record a command that was just applied, returning the capture id to hand back
 * as the undo token. Stores the full prior-state snapshot set (the batch-undo
 * unit) so undo can reverse it exactly.
 */
export async function recordActed(input: {
  rawText: string;
  verb: CommandVerb;
  snapshots: PriorState[];
  source?: SourceChannel;
}): Promise<string> {
  const user = await requireUser();
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const now = Date.now();
  const record: CommandRecord = {
    kind: "command",
    state: "acted",
    verb: input.verb,
    appliedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + COMMAND_WINDOW_MS).toISOString(),
    snapshots: input.snapshots,
  };

  const { data, error } = await supabase
    .from("captures")
    .insert({
      org_id: orgId,
      owner_id: user.id,
      raw_text: input.rawText,
      source: input.source ?? "app",
      status: "processed",
      result_kind: "command",
      interpretation: record as unknown as Database["public"]["Tables"]["captures"]["Row"]["interpretation"],
    })
    .select("id")
    .single();

  if (error) throw new Error(`recordActed: ${error.message}`);
  return data.id;
}

export type UndoResult =
  | { ok: true; count: number; titles: string[]; verb: CommandVerb | null }
  | { ok: false; reason: "not_found" | "expired" | "already_undone" };

/**
 * Undo an acted command by its token (capture id). Org-scoped; reverses every
 * snapshot as one operation and marks the record undone so a double-undo is a
 * no-op. Past the window, the token is dead.
 */
export async function undo(token: string): Promise<UndoResult> {
  await requireUser();
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data: capture, error } = await supabase
    .from("captures")
    .select("id, interpretation")
    .eq("org_id", orgId)
    .eq("id", token)
    .eq("result_kind", "command")
    .maybeSingle();
  if (error) throw new Error(`undo (load): ${error.message}`);
  if (!capture) return { ok: false, reason: "not_found" };

  const record = capture.interpretation as unknown as CommandRecord | null;
  if (!record || record.kind !== "command" || record.state !== "acted") {
    return { ok: false, reason: record?.state === "undone" ? "already_undone" : "not_found" };
  }
  if (Date.now() > Date.parse(record.expiresAt)) {
    return { ok: false, reason: "expired" };
  }

  for (const snapshot of record.snapshots) {
    await reverse(snapshot);
  }

  const undone: CommandRecord = { ...record, state: "undone" };
  const { error: upErr } = await supabase
    .from("captures")
    .update({
      interpretation:
        undone as unknown as Database["public"]["Tables"]["captures"]["Row"]["interpretation"],
    })
    .eq("org_id", orgId)
    .eq("id", capture.id);
  if (upErr) throw new Error(`undo (mark): ${upErr.message}`);

  return {
    ok: true,
    count: record.snapshots.length,
    titles: record.snapshots.map((s) => s.title),
    verb: record.verb,
  };
}
