import type { ApplySlots } from "@/lib/commands/execute";
import type { CommandVerb } from "@/lib/commands/types";

/**
 * Capture command interpreter — pending-confirmation model + answer parsing
 * (step 4). Pure, channel-agnostic, no I/O (persistence lives in store.ts).
 *
 * A confirmation is "what to do once the user says yes / picks an option."
 * Storing the resolved ACTION (not the raw text) means resolving a reply never
 * re-runs the model — the decision is already made, we just execute it. The
 * same record renders as tappable buttons in-app and as a numbered/yes-no text
 * prompt on Telegram.
 */

/** The concrete thing a confirmed/picked option does — fully resolved. */
export type PendingAction =
  | {
      type: "apply_verb";
      verb: CommandVerb;
      taskIds: string[];
      slots: ApplySlots;
      destProjectName?: string | null;
      /** refile: create this project first, then move into it (destination not
       *  found at interpret time). */
      createProject?: string;
    }
  | { type: "capture"; text: string }
  | { type: "create_task"; title: string; projectId: string | null };

/**
 * A pending confirmation, stored verbatim in captures.interpretation. `state`
 * and `expiresAt` are shared with the acted record so the store can treat both
 * uniformly; only live (state=pending, unexpired) records resolve a reply.
 */
export type PendingRecord = {
  kind: "command";
  state: "pending" | "resolved" | "cancelled";
  rawText: string;
  expiresAt: string;
  prompt: string;
  mode: "yesno" | "choose";
  /** mode=yesno: the action to run on "yes". */
  yesAction?: PendingAction;
  /** mode=choose: numbered options, each with its own action. */
  options?: { label: string; action: PendingAction }[];
};

const AFFIRM = new Set([
  "yes", "y", "yeah", "yep", "yup", "ok", "okay", "sure", "confirm",
  "confirmed", "do it", "go", "go ahead", "proceed", "correct",
]);
const NEGATE = new Set([
  "no", "n", "nope", "nah", "cancel", "stop", "nevermind", "never mind",
  "don't", "dont", "skip",
]);

function leadingInt(s: string): number | null {
  const m = s.match(/^\s*(\d{1,3})\b/);
  return m ? Number(m[1]) : null;
}

/**
 * Does this line look like an ANSWER to a confirmation (a bare yes/no/number),
 * rather than a fresh capture or command? Used to gate the pending-resolution
 * path: an answer-like line resolves an active pending; a fresh line supersedes
 * it (and a bare yes/no with no pending is "nothing to confirm").
 */
export function isAnswerLike(text: string): boolean {
  const norm = text.trim().toLowerCase();
  if (!norm) return false;
  if (AFFIRM.has(norm) || NEGATE.has(norm)) return true;
  return /^\d{1,3}$/.test(norm);
}

export type AnswerDecision =
  | { decision: "yes"; action: PendingAction }
  | { decision: "pick"; action: PendingAction; label: string }
  | { decision: "no" }
  | { decision: "unrecognized" };

/**
 * Resolve a reply against a live pending record. Never executes — returns the
 * action to run (or no/unrecognized). A number picks an option; yes/no work in
 * either mode (a lone "yes" picks the only option when there's exactly one).
 */
export function resolveAnswer(record: PendingRecord, text: string): AnswerDecision {
  const norm = text.trim().toLowerCase();
  if (NEGATE.has(norm)) return { decision: "no" };

  if (record.mode === "yesno") {
    if (AFFIRM.has(norm) && record.yesAction) {
      return { decision: "yes", action: record.yesAction };
    }
    return { decision: "unrecognized" };
  }

  // mode === "choose"
  const options = record.options ?? [];
  const n = leadingInt(norm);
  if (n !== null && n >= 1 && n <= options.length) {
    const opt = options[n - 1];
    return { decision: "pick", action: opt.action, label: opt.label };
  }
  // A bare "yes" is only unambiguous when there's a single option.
  if (AFFIRM.has(norm) && options.length === 1) {
    return { decision: "pick", action: options[0].action, label: options[0].label };
  }
  return { decision: "unrecognized" };
}
