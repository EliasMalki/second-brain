import "server-only";

import { captureText } from "@/lib/db/captures";
import { createTask, type Priority } from "@/lib/db/tasks";
import { addDaysISO, fmtShort, fmtDayLabel } from "@/lib/dates";
import type { Database } from "@/lib/database.types";

import { interpret } from "@/lib/commands/interpret";
import {
  fetchCandidates,
  resolveMatch,
  resolveBatch,
  type Candidates,
} from "@/lib/commands/match";
import {
  applyVerb,
  precheck,
  type ApplySlots,
  type PriorState,
  type VerbOutcome,
} from "@/lib/commands/execute";
import {
  recordActed,
  recordPending,
  loadActivePending,
  markPendingResolved,
  undo as storeUndo,
} from "@/lib/commands/store";
import {
  isAnswerLike,
  resolveAnswer,
  type PendingAction,
  type PendingRecord,
} from "@/lib/commands/confirm";
import type {
  CandidateTask,
  CommandVerb,
  Interpretation,
  InterpreterResult,
  ResultChoice,
} from "@/lib/commands/types";

type SourceChannel = Database["public"]["Enums"]["source_channel"];

/**
 * Capture command interpreter — the channel-agnostic orchestrator (step 4).
 *
 * handle() is the single entry point every channel calls: it decides intent,
 * matches, and either acts (with undo), asks (a confirmation), files a capture,
 * or answers a read. It returns an InterpreterResult — plain data the in-app
 * route renders as a toast + buttons and a future Telegram webhook renders as
 * text + a keyboard. No channel-specific code lives here.
 *
 * Coverage grows by step: reads (step 6) currently deflect; batch (step 5)
 * currently falls through to single-target resolution.
 */

const DEFLECT =
  "I can show your today, this week, a project's tasks, or what's overdue — for anything else, use search in the app.";

export type HandleOptions = { source?: SourceChannel };

export async function handle(
  text: string,
  opts?: HandleOptions,
): Promise<InterpreterResult> {
  const trimmed = text.trim();
  if (!trimmed) return { kind: "info", message: "Nothing to capture." };

  // 1. Answer path: a bare yes/no/number only ever resolves a LIVE pending
  //    confirmation. With none, it's "nothing to confirm" (never a stray note).
  if (isAnswerLike(trimmed)) {
    const pending = await loadActivePending();
    if (!pending) return { kind: "info", message: "Nothing to confirm right now." };

    const decision = resolveAnswer(pending.record, trimmed);
    if (decision.decision === "no") {
      await markPendingResolved(pending.token, "cancelled");
      return { kind: "info", message: "Okay — left as is." };
    }
    if (decision.decision === "unrecognized") {
      return pendingToResult(
        pending.token,
        pending.record,
        "Sorry, I didn't catch that. ",
      );
    }
    await markPendingResolved(pending.token, "resolved");
    return executeAction(decision.action, pending.record.rawText, opts?.source);
  }

  // 2. A fresh line supersedes any pending (the old one expires on its own).
  const candidates = await fetchCandidates();
  const interp = await interpret(trimmed, {
    today: candidates.today,
    tasks: candidates.tasks,
    projects: candidates.projects,
  });

  if (interp.intent === "read") {
    return { kind: "info", message: DEFLECT }; // step 6 implements the three views
  }
  if (interp.intent === "command") {
    return handleCommand(interp, candidates, trimmed, opts?.source);
  }

  // capture — the default
  const { noteId } = await captureText(trimmed);
  return { kind: "captured", message: "Captured — it's in your Inbox", noteId };
}

/** Undo entry point (the undo token is a command-capture id). */
export async function applyUndo(token: string): Promise<InterpreterResult> {
  const res = await storeUndo(token);
  if (res.ok) {
    return {
      kind: "undone",
      message:
        res.count === 1
          ? `Undone — restored “${res.titles[0]}”.`
          : `Undone — reversed all ${res.count}.`,
    };
  }
  const message =
    res.reason === "expired"
      ? "That's too old to undo now."
      : res.reason === "already_undone"
        ? "Already undone."
        : "Nothing to undo.";
  return { kind: "info", message };
}

/* ---------- command handling --------------------------------------------- */

async function handleCommand(
  interp: Interpretation,
  candidates: Candidates,
  rawText: string,
  source?: SourceChannel,
): Promise<InterpreterResult> {
  const slots = buildSlots(interp, candidates.today);
  const destName = interp.projectId
    ? candidates.projects.find((p) => p.id === interp.projectId)?.name ?? null
    : null;

  // (a) ambiguous create-vs-command ("finish the invoice"): ask, never guess.
  if (interp.ambiguousCaptureVsCommand) {
    const res = resolveMatch(interp, candidates);
    const task =
      res.kind === "single" ? res.task : res.kind === "ambiguous" ? res.candidates[0] : null;
    if (task) {
      const verb = interp.verb ?? "complete";
      return askConfirm({
        rawText,
        prompt: `Did you mean to ${verbPhrase(verb)} “${task.title}”, or add “${rawText}” as a new task?`,
        mode: "choose",
        options: [
          {
            label: `${verbCap(verb)} “${task.title}”`,
            action: { type: "apply_verb", verb, taskIds: [task.id], slots, destProjectName: destName },
          },
          { label: `Add “${rawText}” as a new task`, action: { type: "capture", text: rawText } },
        ],
        source,
      });
    }
    // No plausible existing task — it's just a new capture.
    const { noteId } = await captureText(rawText);
    return { kind: "captured", message: "Captured — it's in your Inbox", noteId };
  }

  if (!interp.verb) {
    return {
      kind: "info",
      message:
        "I can capture that or act on a task — I didn't catch a command I handle (complete, reschedule, snooze, reprioritize, or move).",
    };
  }
  const verb = interp.verb;

  // (b) slot checks: a verb missing its required value asks the user to re-issue.
  const missing = missingSlotMessage(verb, slots, interp);
  if (missing) return { kind: "info", message: missing };

  // (c) batch: resolve the whole set first, confirm ONCE, act atomically.
  if (interp.isBatch || interp.batchFilter) {
    return handleBatch(interp, candidates, rawText, verb, slots, destName, source);
  }

  // (d) resolve the target (single).
  const res = resolveMatch(interp, candidates);

  if (res.kind === "none") {
    if (res.closest.length === 0) {
      return { kind: "info", message: "I couldn't find an open task matching that." };
    }
    return askConfirm({
      rawText,
      prompt: "I couldn't find an exact match — did you mean one of these?",
      mode: "choose",
      options: res.closest.map((t) => ({
        label: optionLabel(t),
        action: { type: "apply_verb", verb, taskIds: [t.id], slots, destProjectName: destName },
      })),
      source,
    });
  }

  if (res.kind === "ambiguous") {
    return askConfirm({
      rawText,
      prompt: "Which one?",
      mode: "choose",
      options: res.candidates.map((t) => ({
        label: optionLabel(t),
        action: { type: "apply_verb", verb, taskIds: [t.id], slots, destProjectName: destName },
      })),
      source,
    });
  }

  // res.kind === "single": one confident match. State-check before acting.
  const task = res.task;
  const issue = precheck(task);
  if (issue) {
    if (issue.kind === "already_done") {
      return { kind: "info", message: `“${task.title}” is already done.` };
    }
    if (issue.kind === "is_note") {
      return askConfirm({
        rawText,
        prompt: `“${task.title}” is a note, not a task. Add it as a task?`,
        mode: "yesno",
        yesAction: { type: "create_task", title: task.title, projectId: task.project_id },
        source,
      });
    }
    // snoozed / waiting → report and ask.
    return askConfirm({
      rawText,
      prompt: `“${task.title}” is ${issue.kind}. ${verbCap(verb)} it anyway?`,
      mode: "yesno",
      yesAction: { type: "apply_verb", verb, taskIds: [task.id], slots, destProjectName: destName },
      source,
    });
  }

  // Confident + clean → act immediately, with undo.
  return executeAction(
    { type: "apply_verb", verb, taskIds: [task.id], slots, destProjectName: destName },
    rawText,
    source,
  );
}

/* ---------- batch handling ------------------------------------------------ */

const BATCH_CAP = 10;

function joinTitles(tasks: CandidateTask[], max = 8): string {
  const shown = tasks.slice(0, max).map((t) => t.title);
  const extra = tasks.length - shown.length;
  return shown.join(", ") + (extra > 0 ? `, and ${extra} more` : "");
}

/**
 * Resolve a batch to a concrete set, surface count + per-item state, and
 * confirm ONCE. Never acts instantly; never confirms per-item. State-divergent
 * items (already done / notes / snoozed / waiting) are excluded and noted, and
 * an unclear element is surfaced rather than guessed. The "yes" applies all
 * actionable targets as one undoable operation.
 */
async function handleBatch(
  interp: Interpretation,
  candidates: Candidates,
  rawText: string,
  verb: CommandVerb,
  slots: ApplySlots,
  destName: string | null,
  source?: SourceChannel,
): Promise<InterpreterResult> {
  if (interp.batchFilter === "project" && !interp.projectId) {
    return { kind: "info", message: "Which project's tasks?" };
  }

  const { confirmed, uncertain } = resolveBatch(interp, candidates);

  const actionable: CandidateTask[] = [];
  const flagged: CandidateTask[] = [];
  let skippedDone = 0;
  for (const t of confirmed) {
    const issue = precheck(t);
    if (!issue) actionable.push(t);
    else if (issue.kind === "already_done") skippedDone++;
    else flagged.push(t); // note / snoozed / waiting → handle individually
  }

  if (actionable.length === 0) {
    if (confirmed.length === 0) {
      return { kind: "info", message: "I couldn't find tasks matching that." };
    }
    return {
      kind: "info",
      message: "Nothing to do — those are already done or need handling individually.",
    };
  }

  const notes: string[] = [];
  if (skippedDone) notes.push(`skipping ${skippedDone} already done`);
  if (flagged.length) notes.push(`not touching ${flagged.length} note/snoozed/waiting`);
  if (uncertain.length) {
    notes.push(`unsure about ${joinTitles(uncertain)} — re-send separately`);
  }
  const tail = notes.length ? ` (${notes.join("; ")})` : "";
  const head = `${verbCap(verb)} ${actionable.length}: ${joinTitles(actionable)}`;

  const prompt =
    actionable.length > BATCH_CAP
      ? `That's ${actionable.length} tasks — ${head}${tail}. Confirm here, or use multi-select on the Tasks page.`
      : `${head}${tail} — confirm?`;

  return askConfirm({
    rawText,
    prompt,
    mode: "yesno",
    yesAction: {
      type: "apply_verb",
      verb,
      taskIds: actionable.map((t) => t.id),
      slots,
      destProjectName: destName,
    },
    source,
  });
}

/* ---------- action execution --------------------------------------------- */

async function executeAction(
  action: PendingAction,
  rawText: string,
  source?: SourceChannel,
): Promise<InterpreterResult> {
  if (action.type === "capture") {
    const { noteId } = await captureText(action.text);
    return { kind: "captured", message: "Captured — it's in your Inbox", noteId };
  }
  if (action.type === "create_task") {
    await createTask({ title: action.title, projectId: action.projectId });
    return { kind: "info", message: `Added “${action.title}” as a task.` };
  }

  // apply_verb (one or many tasks → one undoable operation)
  const applied: { prior: PriorState; outcome: VerbOutcome }[] = [];
  let alreadyDone = false;
  for (const id of action.taskIds) {
    const r = await applyVerb(id, action.verb, action.slots);
    if (r.ok) applied.push({ prior: r.prior, outcome: r.outcome });
    else if (r.reason === "already_done") alreadyDone = true;
  }

  if (applied.length === 0) {
    return {
      kind: "info",
      message: alreadyDone ? "That's already done." : "That task no longer exists.",
    };
  }

  const token = await recordActed({
    rawText,
    verb: action.verb,
    snapshots: applied.map((a) => a.prior),
    source,
  });
  return {
    kind: "acted",
    message: summarizeActed(action.verb, applied, action.destProjectName ?? null),
    undoToken: token,
  };
}

/* ---------- slot resolution + phrasing ------------------------------------ */

function buildSlots(interp: Interpretation, today: string): ApplySlots {
  return {
    scheduledFor: interp.scheduledFor ?? undefined,
    snoozeUntil:
      interp.verb === "snooze" ? interp.snoozeUntil ?? addDaysISO(today, 1) : undefined,
    priority: interp.priority ?? undefined,
    projectId: interp.verb === "refile" ? interp.projectId ?? undefined : undefined,
  };
}

function missingSlotMessage(
  verb: CommandVerb,
  slots: ApplySlots,
  interp: Interpretation,
): string | null {
  if (verb === "reschedule" && !slots.scheduledFor) {
    return "When should I move it to? Re-send like “move <task> to Friday”.";
  }
  if (verb === "reprioritize" && !slots.priority) {
    return "Which priority (A–D)? Re-send like “make <task> an A”.";
  }
  if (verb === "refile" && slots.projectId === undefined) {
    // step 7 refines this (offer to create / match the destination name).
    return interp.projectNamePhrase
      ? `I couldn't find a project called “${interp.projectNamePhrase}”.`
      : "Which project should I move it to?";
  }
  return null;
}

function optionLabel(t: CandidateTask): string {
  const parts = [t.title];
  if (t.project_name) parts.push(t.project_name);
  if (t.scheduled_for) parts.push(fmtShort(t.scheduled_for));
  return parts.join(" · ");
}

function verbPhrase(verb: CommandVerb): string {
  return verb === "refile" ? "move" : verb;
}
function verbCap(verb: CommandVerb): string {
  const p = verbPhrase(verb);
  return p.charAt(0).toUpperCase() + p.slice(1);
}
function verbPast(verb: CommandVerb): string {
  switch (verb) {
    case "complete": return "Completed";
    case "reschedule": return "Rescheduled";
    case "snooze": return "Snoozed";
    case "reprioritize": return "Reprioritized";
    case "refile": return "Moved";
  }
}

function summarizeActed(
  verb: CommandVerb,
  applied: { prior: PriorState; outcome: VerbOutcome }[],
  destProjectName: string | null,
): string {
  if (applied.length > 1) {
    const list = applied.map((a) => `✓ ${a.prior.title}`).join(", ");
    return `${verbPast(verb)} ${applied.length}: ${list}`;
  }
  const { prior, outcome } = applied[0];
  const t = prior.title;
  switch (verb) {
    case "complete": {
      let m = `Done ✓ ${t}`;
      if (outcome.recurrenceNext) m += ` — next on ${fmtShort(outcome.recurrenceNext)}`;
      return m;
    }
    case "reschedule":
      return `Moved “${t}” to ${outcome.scheduledFor ? fmtDayLabel(outcome.scheduledFor) : "no date"}`;
    case "snooze":
      return `Snoozed “${t}” until ${outcome.snoozeUntil ? fmtShort(outcome.snoozeUntil) : "later"}`;
    case "reprioritize":
      return `Set “${t}” to priority ${outcome.priority}`;
    case "refile":
      return `Moved “${t}” to ${destProjectName ?? "Inbox"}`;
  }
}

/* ---------- confirmation result building ---------------------------------- */

function choicesFrom(
  mode: "yesno" | "choose",
  options?: { label: string }[],
): ResultChoice[] {
  if (mode === "yesno") {
    return [
      { index: 1, label: "Yes" },
      { index: 2, label: "No" },
    ];
  }
  return (options ?? []).map((o, i) => ({ index: i + 1, label: o.label }));
}

async function askConfirm(input: {
  rawText: string;
  prompt: string;
  mode: "yesno" | "choose";
  yesAction?: PendingAction;
  options?: { label: string; action: PendingAction }[];
  source?: SourceChannel;
}): Promise<InterpreterResult> {
  const token = await recordPending(input);
  return {
    kind: "confirm",
    message: input.prompt,
    mode: input.mode,
    choices: choicesFrom(input.mode, input.options),
    pendingToken: token,
  };
}

function pendingToResult(
  token: string,
  record: PendingRecord,
  prefix = "",
): InterpreterResult {
  return {
    kind: "confirm",
    message: prefix + record.prompt,
    mode: record.mode,
    choices: choicesFrom(record.mode, record.options),
    pendingToken: token,
  };
}
