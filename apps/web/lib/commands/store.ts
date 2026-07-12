import "server-only";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import type { Database } from "@second-brain/shared/types/database";
import { reverse, type PriorState } from "@/lib/commands/execute";
import { deleteTaskHard } from "@/lib/db/tasks";
import { setNoteArchived } from "@/lib/db/notes";
import type { CommandVerb } from "@/lib/commands/types";
import type { PendingAction, PendingRecord } from "@/lib/commands/confirm";

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
  /** Present for a confirmed multi-item split instead of snapshots: undo deletes
   *  the created tasks and restores (un-archives) the original raw-line note. */
  creation?: { createdTaskIds: string[]; placeholderNoteId: string | null };
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

/**
 * Record a confirmed multi-item split, returning the undo token. Undo deletes
 * the created tasks and un-archives the original raw-line note (no field
 * snapshots — this is a creation, not a mutation).
 */
export async function recordCreated(input: {
  rawText: string;
  createdTaskIds: string[];
  placeholderNoteId: string | null;
  source?: SourceChannel;
}): Promise<string> {
  const user = await requireUser();
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const now = Date.now();
  const record: CommandRecord = {
    kind: "command",
    state: "acted",
    verb: null,
    appliedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + COMMAND_WINDOW_MS).toISOString(),
    snapshots: [],
    creation: { createdTaskIds: input.createdTaskIds, placeholderNoteId: input.placeholderNoteId },
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

  if (error) throw new Error(`recordCreated: ${error.message}`);
  return data.id;
}

export type UndoResult =
  | {
      ok: true;
      count: number;
      titles: string[];
      verb: CommandVerb | null;
      creation?: boolean;
    }
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

  if (record.creation) {
    // A confirmed multi-item split: delete the created tasks and bring the
    // original raw-line note back from the archive.
    for (const id of record.creation.createdTaskIds)
      await deleteTaskHard(id, "command", { reason: "undo" });
    if (record.creation.placeholderNoteId) {
      await setNoteArchived(record.creation.placeholderNoteId, false);
    }
  } else {
    for (const snapshot of record.snapshots) await reverse(snapshot);
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

  if (record.creation) {
    return { ok: true, count: record.creation.createdTaskIds.length, titles: [], verb: null, creation: true };
  }
  return {
    ok: true,
    count: record.snapshots.length,
    titles: record.snapshots.map((s) => s.title),
    verb: record.verb,
  };
}

/* ---------- pending confirmations (step 4) -------------------------------- */

const jsonb = (r: unknown) =>
  r as unknown as Database["public"]["Tables"]["captures"]["Row"]["interpretation"];

/**
 * Record a pending confirmation as a needs_clarification command capture,
 * returning the capture id as the pending token. Expiry is stamped here; only
 * live records resolve a later reply.
 */
export async function recordPending(input: {
  rawText: string;
  prompt: string;
  mode: "yesno" | "choose";
  yesAction?: PendingAction;
  options?: { label: string; action: PendingAction }[];
  source?: SourceChannel;
}): Promise<string> {
  const user = await requireUser();
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const record: PendingRecord = {
    kind: "command",
    state: "pending",
    rawText: input.rawText,
    expiresAt: new Date(Date.now() + COMMAND_WINDOW_MS).toISOString(),
    prompt: input.prompt,
    mode: input.mode,
    yesAction: input.yesAction,
    options: input.options,
  };

  const { data, error } = await supabase
    .from("captures")
    .insert({
      org_id: orgId,
      owner_id: user.id,
      raw_text: input.rawText,
      source: input.source ?? "app",
      status: "needs_clarification",
      result_kind: "command",
      interpretation: jsonb(record),
    })
    .select("id")
    .single();

  if (error) throw new Error(`recordPending: ${error.message}`);
  return data.id;
}

/**
 * The user's most recent LIVE pending confirmation (state=pending, unexpired),
 * org+owner scoped. Returns null when there's nothing to resolve — including
 * when the latest pending has expired, so a late "yes" can never act on a
 * forgotten prompt (the spec's stray/expired-affirmation rule).
 */
export async function loadActivePending(): Promise<
  { token: string; record: PendingRecord } | null
> {
  const user = await requireUser();
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("captures")
    .select("id, interpretation")
    .eq("org_id", orgId)
    .eq("owner_id", user.id)
    .eq("result_kind", "command")
    .eq("status", "needs_clarification")
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`loadActivePending: ${error.message}`);
  if (!data) return null;

  const record = data.interpretation as unknown as PendingRecord | null;
  if (!record || record.kind !== "command" || record.state !== "pending") return null;
  if (Date.now() > Date.parse(record.expiresAt)) return null;

  return { token: data.id, record };
}

/** Load a specific pending by token, if it's still live (state=pending, unexpired). */
export async function loadPendingByToken(
  token: string,
): Promise<PendingRecord | null> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("captures")
    .select("interpretation")
    .eq("org_id", orgId)
    .eq("id", token)
    .eq("result_kind", "command")
    .maybeSingle();
  if (error) throw new Error(`loadPendingByToken: ${error.message}`);
  if (!data) return null;

  const record = data.interpretation as unknown as PendingRecord | null;
  if (!record || record.kind !== "command" || record.state !== "pending") return null;
  if (Date.now() > Date.parse(record.expiresAt)) return null;
  return record;
}

/**
 * Atomically claim + close out a pending confirmation. Returns true only if THIS
 * call flipped it from needs_clarification → processed; a concurrent second
 * resolution (double-tap, racing typed reply, another channel/tab) gets false
 * and must NOT execute the action — otherwise a non-idempotent verb (create a
 * project, file a note) would run twice. The conditional UPDATE's matched-row
 * count is the load-bearing guard; the prior read only builds the merged jsonb.
 */
export async function markPendingResolved(
  token: string,
  state: "resolved" | "cancelled",
): Promise<boolean> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("captures")
    .select("interpretation")
    .eq("org_id", orgId)
    .eq("id", token)
    .maybeSingle();
  if (error) throw new Error(`markPendingResolved (load): ${error.message}`);
  if (!data) return false;

  const record = data.interpretation as unknown as PendingRecord | null;
  if (!record || record.kind !== "command") return false;

  const { data: claimed, error: upErr } = await supabase
    .from("captures")
    .update({ status: "processed", interpretation: jsonb({ ...record, state }) })
    .eq("org_id", orgId)
    .eq("id", token)
    .eq("status", "needs_clarification") // CAS: only the first resolver matches
    .select("id");
  if (upErr) throw new Error(`markPendingResolved (update): ${upErr.message}`);

  return (claimed?.length ?? 0) > 0;
}
