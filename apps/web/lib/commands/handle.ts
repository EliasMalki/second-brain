import "server-only";

import { captureText } from "@/lib/db/captures";
import { createTask } from "@/lib/db/tasks";
import { createNote, setNoteArchived } from "@/lib/db/notes";
import { createProject as createProjectRow, listProjects } from "@/lib/db/projects";
import { addDaysISO, fmtShort, fmtDayLabel } from "@second-brain/shared/domain/dates";
import type { Database } from "@second-brain/shared/types/database";

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
  recordCreated,
  recordPending,
  loadActivePending,
  loadPendingByToken,
  markPendingResolved,
  undo as storeUndo,
} from "@/lib/commands/store";
import {
  isAnswerLike,
  resolveAnswer,
  type PendingAction,
  type PendingRecord,
} from "@/lib/commands/confirm";
import { handleRead } from "@/lib/commands/reads";
import type {
  CandidateTask,
  CaptureItem,
  CommandVerb,
  Interpretation,
  InterpreterResult,
  ResultChoice,
} from "@/lib/commands/types";

type SourceChannel = Database["public"]["Enums"]["source_channel"];

/**
 * Capture command interpreter — the channel-agnostic orchestrator.
 *
 * handle() is the single entry point every channel calls: it decides intent,
 * matches, and either acts (with undo), asks (a confirmation), files a capture,
 * or answers a read. It returns an InterpreterResult — plain data the in-app
 * route renders as a toast + buttons and a future Telegram webhook renders as
 * text + a keyboard. No channel-specific code lives here.
 */

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
    if (decision.decision === "unrecognized") {
      return pendingToResult(
        pending.token,
        pending.record,
        "Sorry, I didn't catch that. ",
      );
    }
    // Atomically claim the pending so a double-tap / racing reply can't run a
    // non-idempotent action twice. Whoever loses the claim does nothing.
    const claimed = await markPendingResolved(
      pending.token,
      decision.decision === "no" ? "cancelled" : "resolved",
    );
    if (!claimed) return { kind: "info", message: "Already handled." };
    if (decision.decision === "no") return { kind: "info", message: "Okay — left as is." };
    return executeAction(decision.action, pending.record.rawText, opts?.source);
  }

  // 2. A fresh line supersedes any pending: cancel a still-live one so a later
  //    bare "yes" can't reach back and act on the now-abandoned prompt.
  const stale = await loadActivePending();
  if (stale) await markPendingResolved(stale.token, "cancelled");

  const candidates = await fetchCandidates();
  const interp = await interpret(trimmed, {
    today: candidates.today,
    tasks: candidates.tasks,
    projects: candidates.projects,
  });

  if (interp.intent === "read") {
    return handleRead(interp, candidates);
  }
  if (interp.intent === "command") {
    return handleCommand(interp, candidates, trimmed, opts?.source);
  }

  // capture — the default. A multi-item line confirms a routed split first.
  if (interp.captureItems.length >= 2) {
    return splitCaptureConfirm(interp, candidates, trimmed, opts?.source);
  }
  const { noteId, captureId } = await captureText(trimmed);
  return { kind: "captured", message: "Captured — it's in your Inbox", noteId, captureId };
}

/**
 * Propose a multi-item capture as an EDITABLE routed split. Files the raw line
 * as ONE unsorted note up front (never-lose: it survives a "no" or an abandoned
 * prompt) — via createNote, NOT captureText, so the async classifier doesn't
 * also process the same line. Returns a `split` result the client renders with a
 * per-item project picker + a Create button; the pending it records also backs a
 * plain "yes" for a text channel. Creating archives the placeholder; undo
 * reverses the whole split.
 */
async function splitCaptureConfirm(
  interp: Interpretation,
  candidates: Candidates,
  rawText: string,
  source?: SourceChannel,
): Promise<InterpreterResult> {
  const placeholder = await createNote({ body: rawText });
  const nameById = new Map(candidates.projects.map((p) => [p.id, p.name]));
  const items = interp.captureItems.map((it) => ({
    title: it.title,
    projectId: it.projectId,
    projectName: it.projectId ? nameById.get(it.projectId) ?? null : null,
    scheduledFor: it.scheduledFor,
  }));
  const lines = items.map((it, i) => `${i + 1}. ${it.title} → ${it.projectName ?? "Inbox"}`);

  const token = await recordPending({
    rawText,
    prompt: `File ${items.length} separate tasks?\n${lines.join("\n")}`,
    mode: "yesno",
    yesAction: {
      type: "split_capture",
      items: interp.captureItems,
      placeholderNoteId: placeholder.id,
    },
    source,
  });

  return {
    kind: "split",
    message: `File ${items.length} separate tasks?`,
    items,
    projects: candidates.projects.map((p) => ({ id: p.id, name: p.name })),
    pendingToken: token,
  };
}

/**
 * Create a multi-item split with (possibly user-edited) routing. Loads the
 * pending by token, atomically claims it (so Create can't double-fire), re-
 * validates each item's project against the org (tenancy), then creates the
 * routed tasks + archives the placeholder. Reuses runSplit with executeAction.
 */
export async function createSplit(
  token: string,
  items: { title?: unknown; projectId?: unknown; scheduledFor?: unknown }[],
  source?: SourceChannel,
): Promise<InterpreterResult> {
  const pending = await loadPendingByToken(token);
  if (!pending || pending.yesAction?.type !== "split_capture") {
    return { kind: "info", message: "That split expired — re-capture it." };
  }
  const placeholderNoteId = pending.yesAction.placeholderNoteId;

  const claimed = await markPendingResolved(token, "resolved");
  if (!claimed) return { kind: "info", message: "Already handled." };

  const projectIds = new Set((await listProjects()).map((p) => p.id));
  const clean: CaptureItem[] = (Array.isArray(items) ? items : [])
    .map((it) => ({
      title: typeof it.title === "string" ? it.title.trim() : "",
      projectId:
        typeof it.projectId === "string" && projectIds.has(it.projectId) ? it.projectId : null,
      scheduledFor: typeof it.scheduledFor === "string" ? it.scheduledFor : null,
    }))
    .filter((it) => it.title.length > 0);

  if (clean.length === 0) return { kind: "info", message: "Nothing to create." };
  return runSplit(clean, placeholderNoteId, pending.rawText, source);
}

/** Create the routed tasks for a split, archive the raw-line placeholder note,
 *  and record the creation-undo. Shared by the "yes" path and the edited Create
 *  path so both behave identically. */
async function runSplit(
  items: CaptureItem[],
  placeholderNoteId: string,
  rawText: string,
  source?: SourceChannel,
): Promise<InterpreterResult> {
  const created: string[] = [];
  for (const it of items) {
    const t = await createTask(
      {
        title: it.title,
        projectId: it.projectId,
        scheduledFor: it.scheduledFor,
      },
      "command",
    );
    created.push(t.id);
  }
  if (placeholderNoteId) await setNoteArchived(placeholderNoteId, true);
  const token = await recordCreated({ rawText, createdTaskIds: created, placeholderNoteId, source });
  return {
    kind: "acted",
    message: `Filed ${created.length} ${created.length === 1 ? "task" : "tasks"}`,
    undoToken: token,
  };
}

/** Undo entry point (the undo token is a command-capture id). */
export async function applyUndo(token: string): Promise<InterpreterResult> {
  const res = await storeUndo(token);
  if (res.ok) {
    if (res.creation) {
      return {
        kind: "undone",
        message: `Undone — removed ${res.count} ${res.count === 1 ? "task" : "tasks"}; kept your note in the Inbox.`,
      };
    }
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

  // (a) ambiguous create-vs-command ("finish the invoice"): file the thought
  //     FIRST so it can never be lost (whatever the user answers, or if they
  //     abandon the prompt), then offer to also complete the matched task. The
  //     flag's contract is capture-vs-COMPLETE, so the offered verb is complete.
  if (interp.ambiguousCaptureVsCommand) {
    const { noteId, captureId } = await captureText(rawText);
    const res = resolveMatch(interp, candidates);
    const task =
      res.kind === "single" ? res.task : res.kind === "ambiguous" ? res.candidates[0] : null;
    if (task) {
      return askConfirm({
        rawText,
        prompt: `Filed “${rawText}” to your Inbox. Also mark “${task.title}” done?`,
        mode: "yesno",
        yesAction: { type: "apply_verb", verb: "complete", taskIds: [task.id], slots: {} },
        source,
      });
    }
    return { kind: "captured", message: "Captured — it's in your Inbox", noteId, captureId };
  }

  if (!interp.verb) {
    // intent=command but no verb we handle. Return info, not a note: the client
    // restores the typed text so the thought isn't lost, and we avoid filing
    // unsupported commands ("delete X") as junk.
    return {
      kind: "info",
      message:
        "I can capture that or act on a task — I didn't catch a command I handle (complete, reschedule, snooze, reprioritize, or move).",
    };
  }
  const verb = interp.verb;

  // (b) slot checks (reschedule date, reprioritize priority). Refile's
  //     destination is resolved separately just below.
  const missing = missingSlotMessage(verb, slots);
  if (missing) return { kind: "info", message: missing };

  // (c) refile destination — the same confidence rule, applied to the target
  //     project: a resolved id is used; a named-but-unknown project is offered
  //     for creation (confirmed below); a missing name asks which.
  let createProject: string | undefined;
  let destName: string | null = null;
  if (verb === "refile") {
    if (interp.projectId) {
      destName = candidates.projects.find((p) => p.id === interp.projectId)?.name ?? null;
    } else if (interp.projectNamePhrase) {
      createProject = interp.projectNamePhrase;
      destName = interp.projectNamePhrase;
    } else {
      return { kind: "info", message: "Which project should I move it to?" };
    }
  }

  const mkAction = (taskIds: string[]): PendingAction => ({
    type: "apply_verb",
    verb,
    taskIds,
    slots,
    destProjectName: destName,
    ...(createProject ? { createProject } : {}),
  });

  // (d) batch: resolve the whole set first, confirm ONCE, act atomically.
  if (interp.isBatch || interp.batchFilter) {
    return handleBatch(interp, candidates, rawText, verb, slots, destName, createProject, source);
  }

  // (e) resolve the target (single).
  const res = resolveMatch(interp, candidates);

  if (res.kind === "none") {
    // "close <Project>" — a command naming a PROJECT, not a task. Offer the
    // project-wide interpretation rather than guess (the spec's edge case).
    const project = interp.projectNamePhrase
      ? findProjectByName(interp.projectNamePhrase, candidates.projects)
      : null;
    if (project) {
      const open = candidates.tasks.filter(
        (t) => !t.is_note && t.status === "open" && t.project_id === project.id,
      );
      if (open.length === 0) {
        return { kind: "info", message: `No open tasks in ${project.name}.` };
      }
      return askConfirm({
        rawText,
        prompt: `“${interp.projectNamePhrase}” is a project. ${verbCap(verb)} all ${open.length} open ${open.length === 1 ? "task" : "tasks"} in it?`,
        mode: "yesno",
        yesAction: mkAction(open.map((t) => t.id)),
        source,
      });
    }
    if (res.closest.length === 0) {
      return { kind: "info", message: "I couldn't find an open task matching that." };
    }
    return askConfirm({
      rawText,
      prompt: "I couldn't find an exact match — did you mean one of these?",
      mode: "choose",
      options: res.closest.map((t) => ({ label: optionLabel(t), action: mkAction([t.id]) })),
      source,
    });
  }

  if (res.kind === "ambiguous") {
    return askConfirm({
      rawText,
      prompt: "Which one?",
      mode: "choose",
      options: res.candidates.map((t) => ({ label: optionLabel(t), action: mkAction([t.id]) })),
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
      yesAction: mkAction([task.id]),
      source,
    });
  }

  // Refile into a not-yet-existing project always confirms (it creates the project).
  if (createProject) {
    return askConfirm({
      rawText,
      prompt: `Move “${task.title}” to a new project “${createProject}”? I'll create it.`,
      mode: "yesno",
      yesAction: mkAction([task.id]),
      source,
    });
  }

  // Confident + clean → act immediately, with undo.
  return executeAction(mkAction([task.id]), rawText, source);
}

function findProjectByName(
  phrase: string,
  projects: { id: string; name: string; aliases: string[] }[],
): { id: string; name: string } | null {
  const norm = phrase.trim().toLowerCase();
  if (!norm) return null;
  const hit = projects.find(
    (p) =>
      p.name.toLowerCase() === norm || p.aliases.some((a) => a.toLowerCase() === norm),
  );
  return hit ? { id: hit.id, name: hit.name } : null;
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
  createProject: string | undefined,
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
      ...(createProject ? { createProject } : {}),
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
    const { noteId, captureId } = await captureText(action.text);
    return { kind: "captured", message: "Captured — it's in your Inbox", noteId, captureId };
  }
  if (action.type === "create_task") {
    await createTask({ title: action.title, projectId: action.projectId }, "command");
    return { kind: "info", message: `Added “${action.title}” as a task.` };
  }

  if (action.type === "split_capture") {
    // The "yes" path (text channel): create with the model's original routing.
    return runSplit(action.items, action.placeholderNoteId, rawText, source);
  }

  // apply_verb (one or many tasks → one undoable operation). For a refile into
  // a new project, create it first and point the slot at it.
  let slots = action.slots;
  let destName = action.destProjectName ?? null;
  if (action.createProject) {
    const project = await createProjectRow({ name: action.createProject });
    slots = { ...action.slots, projectId: project.id };
    destName = project.name;
  }

  const applied: { prior: PriorState; outcome: VerbOutcome }[] = [];
  let alreadyDone = false;
  for (const id of action.taskIds) {
    const r = await applyVerb(id, action.verb, slots);
    if (r.ok) applied.push({ prior: r.prior, outcome: r.outcome });
    else if (r.reason === "already_done") alreadyDone = true;
  }

  if (applied.length === 0) {
    const many = action.taskIds.length > 1;
    return {
      kind: "info",
      message: alreadyDone
        ? many ? "Those are already done." : "That's already done."
        : many ? "Those tasks no longer exist." : "That task no longer exists.",
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
    message: summarizeActed(action.verb, applied, destName),
    undoToken: token,
  };
}

/* ---------- slot resolution + phrasing ------------------------------------ */

function buildSlots(interp: Interpretation, today: string): ApplySlots {
  // Snooze always lands strictly in the future (ISO strings compare lexically),
  // so a contradictory "snooze till yesterday/today" can't hide a task until the
  // next nightly run. Default and floor are both tomorrow.
  const tomorrow = addDaysISO(today, 1);
  const snooze = interp.snoozeUntil ?? tomorrow;
  return {
    scheduledFor: interp.scheduledFor ?? undefined,
    snoozeUntil: interp.verb === "snooze" ? (snooze > today ? snooze : tomorrow) : undefined,
    priority: interp.priority ?? undefined,
    projectId: interp.verb === "refile" ? interp.projectId ?? undefined : undefined,
  };
}

function missingSlotMessage(verb: CommandVerb, slots: ApplySlots): string | null {
  if (verb === "reschedule" && !slots.scheduledFor) {
    return "When should I move it to? Re-send like “move <task> to Friday”.";
  }
  if (verb === "reprioritize" && !slots.priority) {
    return "Which priority (A–D)? Re-send like “make <task> an A”.";
  }
  // refile's destination is resolved separately (it may need creating).
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
