import type { Priority } from "@/lib/db/tasks";

/**
 * Capture command interpreter — shared types (v1).
 *
 * The interpreter is the pipeline upgrade that lets the capture box do three
 * things instead of one: CAPTURE (the existing behavior), act on an existing
 * task via a COMMAND, or answer a fixed READ request. Everything here is
 * channel-agnostic on purpose — the in-app route and (later) a Telegram webhook
 * both speak in these types, so the messaging channel inherits the interpreter
 * for free.
 *
 * This file is data-only (no I/O). The LLM call lives in interpret.ts; the
 * deterministic act-vs-confirm decision lives in the matcher (step 2).
 */

export type Intent = "capture" | "command" | "read";

/** The closed verb set — nothing else is a command. No delete-by-command. */
export type CommandVerb =
  | "complete"
  | "reschedule"
  | "snooze"
  | "reprioritize"
  | "refile";

/** The three fixed read views — NOT a general query engine. */
export type ReadView = "brief" | "week" | "project_tasks" | "overdue";

/**
 * A task as the matcher/LLM sees it — a minimal, org-scoped projection. The
 * candidate set spans the user's actionable tasks (open/snoozed/waiting) plus a
 * little recently-completed context so state checks ("that's already done") can
 * fire. `status` is carried so the matcher never has to trust the model for it.
 */
export type CandidateTask = {
  id: string;
  title: string;
  status: string;
  project_id: string | null;
  project_name: string | null;
  scheduled_for: string | null;
  /** True when the underlying row is a note placeholder, not a task — lets the
   *  "that's a note, not a task" state check fire. Reserved for the matcher. */
  is_note?: boolean;
};

/** A project as the matcher/LLM sees it (name + aliases for fuzzy resolution). */
export type CandidateProject = {
  id: string;
  name: string;
  aliases: string[];
};

/**
 * One candidate match the model proposes. `id` MUST be validated against the
 * org-scoped candidate set before use — the model is never trusted with
 * tenancy (same rule as the classifier).
 */
export type TaskMatch = {
  id: string;
  /** 0..1 — the model's confidence that this candidate is the intended task. */
  confidence: number;
};

/**
 * The validated output of one interpret() call. This is RAW interpretation
 * only: which intent, which verb, which candidate ids, and the slot values.
 * The act-immediately-vs-confirm decision (the confidence rule, batch handling,
 * state checks) is applied downstream — this layer just parses and tenancy-
 * checks what the model returned.
 */
export type Interpretation = {
  intent: Intent;

  // --- command fields (intent === "command") ---
  verb: CommandVerb | null;
  /** Candidate task ids (validated ⊆ the provided set), best-first, with confidence. */
  taskMatches: TaskMatch[];
  /** The model judged that more than one task is targeted (a batch command). */
  isBatch: boolean;

  // --- verb slots ---
  /** reschedule: target date YYYY-MM-DD, relative dates resolved against today. */
  scheduledFor: string | null;
  /** snooze: explicit target date YYYY-MM-DD; null => caller applies the default. */
  snoozeUntil: string | null;
  /** reprioritize: target priority. */
  priority: Priority | null;
  /** refile destination / project read: matched project id (validated ⊆ set). */
  projectId: string | null;
  /** The raw project-name phrase the user used (for confirm prompts + the
   *  "close <Project>" ambiguity), even when projectId couldn't be resolved. */
  projectNamePhrase: string | null;

  // --- read fields (intent === "read") ---
  /** Which fixed view; null when the request is read-like but outside the three
   *  views (the caller then emits the deflection fence). */
  readView: ReadView | null;

  // --- meta ---
  /** "finish the invoice"-style input that could be a new task OR completing one. */
  ambiguousCaptureVsCommand: boolean;
  /** Short model rationale — used to phrase confirmations and for debugging. */
  notes: string | null;
};

/**
 * The channel-agnostic output of the interpreter. handle() returns one of these
 * and every channel renders it its own way: in-app as a toast + tappable
 * buttons, Telegram as text + a reply keyboard. All fields are plain data so
 * the same result ports directly to a text-only channel.
 */
export type ResultChoice = { index: number; label: string };

export type InterpreterResult =
  /** A new note/task was filed (the existing capture behavior). */
  | { kind: "captured"; message: string; noteId?: string }
  /** A command (or batch) was applied; undoToken reverses the whole operation. */
  | { kind: "acted"; message: string; undoToken: string }
  /** An undo (or batch-undo) completed. */
  | { kind: "undone"; message: string }
  /**
   * The user must choose or confirm before anything happens. `mode` is "yesno"
   * (confirm a proposed action) or "choose" (pick a numbered option). Replying
   * through any channel routes back via `pendingToken`.
   */
  | {
      kind: "confirm";
      message: string;
      mode: "yesno" | "choose";
      choices: ResultChoice[];
      pendingToken: string;
    }
  /** Informational — deflections, "nothing to confirm", "already done", etc. */
  | { kind: "info"; message: string };
