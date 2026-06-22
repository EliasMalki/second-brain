import "server-only";

import { serverEnv } from "@/lib/env";
import type {
  CandidateProject,
  CandidateTask,
  Interpretation,
  Intent,
  CommandVerb,
  ReadView,
  BatchFilter,
  TaskMatch,
} from "@/lib/commands/types";

/**
 * Capture command interpreter — the three-way intent detector + closed-verb
 * parser (step 1).
 *
 * One Anthropic call (Haiku 4.5, same tier as the classifier) decides whether a
 * captured line is a CAPTURE (a new note/task — the default), a COMMAND on an
 * existing task (the five verbs), or a fixed READ request, and extracts the
 * slots each needs. A thin fetch — no SDK dependency — mirroring the app's
 * existing provider-direct style (see lib/transcribe.ts and the classifier
 * invoke in lib/db/captures.ts).
 *
 * Tenancy + safety, exactly like the classifier (supabase/functions/
 * classify-capture): the model is given the user's own tasks/projects and may
 * only return ids from that set — every id it returns is re-validated here
 * before it leaves this module. And the whole call is best-effort: ANY failure,
 * timeout, or unparseable output falls back to CAPTURE, preserving the
 * never-lose-a-thought invariant (BUILD_SPEC §4). Downstream code applies the
 * confidence rule and decides act-vs-confirm — this layer only parses.
 */

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
// Hard cap on the interactive round-trip so a slow model never wedges the
// capture box; on abort we fall back to capture like any other failure.
const REQUEST_TIMEOUT_MS = 12_000;

const INTENTS: Intent[] = ["capture", "command", "read"];
const VERBS: CommandVerb[] = [
  "complete",
  "reschedule",
  "snooze",
  "reprioritize",
  "refile",
];
const READ_VIEWS: ReadView[] = ["brief", "week", "project_tasks", "overdue"];
const BATCH_FILTERS: Exclude<BatchFilter, null>[] = [
  "all_open",
  "today",
  "overdue",
  "project",
];
const PRIORITIES = ["A", "B", "C", "D"] as const;

export type InterpretContext = {
  /** Today as YYYY-MM-DD (server local) — relative dates resolve against this. */
  today: string;
  /** The user's candidate tasks (org-scoped). Match targets come only from here. */
  tasks: CandidateTask[];
  /** The user's projects (org-scoped) — name + aliases for fuzzy resolution. */
  projects: CandidateProject[];
};

/** The raw shape the model is constrained to return (snake_case, all required). */
const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: {
      type: "string",
      enum: ["capture", "command", "read"],
      description:
        "capture = a new note/task to file (the DEFAULT when unsure); command = act on an existing task; read = ask for one of the fixed views",
    },
    verb: {
      type: ["string", "null"],
      description:
        "for intent=command only: one of complete | reschedule | snooze | reprioritize | refile. Closed set — anything outside these five is NOT a command; use null then.",
    },
    task_matches: {
      type: "array",
      description:
        "for intent=command: the candidate task ids this refers to, best match first, each with a 0..1 confidence. Use ids from the provided list ONLY. Empty if nothing plausibly matches.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", description: "a task id from the provided list" },
          confidence: {
            type: "number",
            description: "0..1 confidence this is the intended task",
          },
        },
        required: ["id", "confidence"],
      },
    },
    is_batch: {
      type: "boolean",
      description:
        "true when the user clearly targets MORE THAN ONE task (e.g. 'close the brakes and the registration').",
    },
    batch_filter: {
      type: ["string", "null"],
      description:
        "set when the user targets a FILTER-defined set rather than named tasks, one of: all_open ('all'/'everything'); today ('all today's'); overdue ('everything overdue'); project ('all the <project> tasks' — also set project_id). null otherwise.",
    },
    scheduled_for: {
      type: ["string", "null"],
      description:
        "for verb=reschedule: the target date as YYYY-MM-DD, resolving relative dates against today. null if none stated.",
    },
    snooze_until: {
      type: ["string", "null"],
      description:
        "for verb=snooze: an EXPLICIT target date as YYYY-MM-DD if the user gave one; null to let the app default it.",
    },
    priority: {
      type: ["string", "null"],
      description: "for verb=reprioritize: the target priority, one of A (highest), B, C, D. null otherwise.",
    },
    project_id: {
      type: ["string", "null"],
      description:
        "for verb=refile or read_view=project_tasks: the matching project id from the provided list, or null if none clearly fits.",
    },
    project_name_phrase: {
      type: ["string", "null"],
      description:
        "the project name the user actually typed/said (even if you couldn't match it to an id), or null.",
    },
    read_view: {
      type: ["string", "null"],
      description:
        "for intent=read: which fixed view, one of brief | week | project_tasks | overdue. Use null when the request is read-like but NOT one of these four (e.g. counts, search, composed filters) — the app will deflect it.",
    },
    ambiguous_capture_vs_command: {
      type: "boolean",
      description:
        "true for phrasing that could be a NEW task or completing an existing one (e.g. 'finish the invoice').",
    },
    notes: {
      type: ["string", "null"],
      description: "one short phrase of rationale, for confirmation wording. May be null.",
    },
  },
  required: [
    "intent",
    "verb",
    "task_matches",
    "is_batch",
    "batch_filter",
    "scheduled_for",
    "snooze_until",
    "priority",
    "project_id",
    "project_name_phrase",
    "read_view",
    "ambiguous_capture_vs_command",
    "notes",
  ],
} as const;

function systemPrompt(today: string): string {
  return [
    "You are the command interpreter of a personal note/task secretary app.",
    "You receive one captured line (typed or voice-transcribed) plus the user's",
    "own open tasks and projects. Decide the user's INTENT, then extract slots.",
    "",
    "THREE intents:",
    "1. capture — a new thought to file (note or task). This is the DEFAULT:",
    "   when in doubt between capture and command, choose capture.",
    "2. command — an action on an EXISTING task. Closed verb set, nothing else:",
    "   - complete: 'done', 'finished X', 'I did X', 'mark X done'",
    "   - reschedule: move a task to a date ('move X to Friday', 'push X to tomorrow')",
    "   - snooze: hide a task until later ('snooze X', 'snooze X till Monday')",
    "   - reprioritize: change priority ('make X an A', 'bump X to B')",
    "   - refile: move a task to a different project ('move X to the Epoxy project')",
    "   Anything action-like outside these five is NOT a command — treat as capture.",
    "3. read — ask for ONE of four fixed views, and nothing else:",
    "   - brief: 'today', \"what's on today\", 'brief'",
    "   - week: 'this week', \"what's on this week\"",
    "   - project_tasks: \"what's left for <project>\", '<project> tasks'",
    "   - overdue: \"what's overdue\", \"what's late\"",
    "   For any other question (counts, search, composed filters, history), set",
    "   intent=read and read_view=null — the app will deflect it. Never invent a view.",
    "",
    "Matching tasks (for commands):",
    "- Match on task IDENTITY (title + project), tolerating typos and voice errors",
    "  ('RBQ' may arrive as 'are be cue', 'registration' as 'registrtion'). Do fuzzy,",
    "  semantic matching — never require an exact string.",
    "- Return task_matches as candidate ids from the provided list ONLY, best first,",
    "  each with a calibrated 0..1 confidence. One clear winner => one high-confidence",
    "  entry. Several plausible => list them with moderate confidence. Nothing fits =>",
    "  empty list.",
    "- Set is_batch=true only when the user clearly names more than one task.",
    "- If the user's target phrase is a PROJECT name rather than a task (e.g. 'close",
    "  Epoxy'), put it in project_name_phrase and keep task_matches conservative — the",
    "  app will ask what they meant.",
    "",
    `Dates: today is ${today}. Resolve relative dates ('tomorrow', 'Friday', 'next week')`,
    "against it and emit YYYY-MM-DD. Never invent a date the user didn't imply.",
    "",
    "Be conservative: a wrong action is worse than asking. When unsure, prefer capture.",
  ].join("\n");
}

type RawResponse = {
  intent: string;
  verb: string | null;
  task_matches: { id: unknown; confidence: unknown }[];
  is_batch: unknown;
  batch_filter: string | null;
  scheduled_for: string | null;
  snooze_until: string | null;
  priority: string | null;
  project_id: string | null;
  project_name_phrase: string | null;
  read_view: string | null;
  ambiguous_capture_vs_command: unknown;
  notes: string | null;
};

/**
 * Coerce a model-produced date to a strict YYYY-MM-DD, or null. The model is
 * told to emit ISO dates, but a malformed ("Friday") or calendar-invalid
 * ("2026-13-40") value must never reach the `date` columns — it would throw at
 * the DB (500-ing the route, partially mutating a batch) or mis-schedule a task.
 * Anything that doesn't round-trip cleanly becomes null, so the caller re-asks
 * (reschedule) or applies its default (snooze).
 */
function toISODate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  // Reject values JS would silently roll over (2026-02-30 → Mar 2).
  return d.toISOString().slice(0, 10) === s ? s : null;
}

/** The safe default: every failure path resolves to a plain capture. */
export function captureFallback(): Interpretation {
  return {
    intent: "capture",
    verb: null,
    taskMatches: [],
    isBatch: false,
    scheduledFor: null,
    snoozeUntil: null,
    priority: null,
    projectId: null,
    projectNamePhrase: null,
    readView: null,
    batchFilter: null,
    ambiguousCaptureVsCommand: false,
    notes: null,
  };
}

async function callClaude(text: string, ctx: InterpretContext): Promise<RawResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // Trim the payload to what the model needs — ids + the fields it matches on.
  const payload = {
    input: text,
    today: ctx.today,
    tasks: ctx.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      project: t.project_name,
      status: t.status,
      scheduled_for: t.scheduled_for,
    })),
    projects: ctx.projects.map((p) => ({
      id: p.id,
      name: p.name,
      aliases: p.aliases,
    })),
  };

  try {
    const res = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-api-key": serverEnv.anthropicApiKey(),
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: serverEnv.commandModel(),
        max_tokens: 1024,
        system: systemPrompt(ctx.today),
        output_config: { format: { type: "json_schema", schema: RESPONSE_SCHEMA } },
        messages: [{ role: "user", content: JSON.stringify(payload) }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`interpret failed (${res.status}): ${detail.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    const block = data.content?.find((b) => b.type === "text");
    if (!block?.text) throw new Error("interpret returned no text block");
    return JSON.parse(block.text) as RawResponse;
  } finally {
    clearTimeout(timeout);
  }
}

/** Coerce + tenancy-validate the raw model output into a safe Interpretation. */
function validate(raw: RawResponse, ctx: InterpretContext): Interpretation {
  const taskIds = new Set(ctx.tasks.map((t) => t.id));
  const projectIds = new Set(ctx.projects.map((p) => p.id));

  const intent: Intent = INTENTS.includes(raw.intent as Intent)
    ? (raw.intent as Intent)
    : "capture";

  const verb: CommandVerb | null =
    raw.verb && VERBS.includes(raw.verb as CommandVerb)
      ? (raw.verb as CommandVerb)
      : null;

  // Keep only matches the user actually owns; clamp confidence; drop dupes.
  const seen = new Set<string>();
  const taskMatches: TaskMatch[] = (Array.isArray(raw.task_matches) ? raw.task_matches : [])
    .map((m) => ({
      id: typeof m.id === "string" ? m.id : "",
      confidence: typeof m.confidence === "number" ? m.confidence : 0,
    }))
    .filter((m) => {
      if (!taskIds.has(m.id) || seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    })
    .map((m) => ({ id: m.id, confidence: Math.max(0, Math.min(1, m.confidence)) }))
    .sort((a, b) => b.confidence - a.confidence);

  const priority =
    raw.priority && PRIORITIES.includes(raw.priority.toUpperCase() as (typeof PRIORITIES)[number])
      ? (raw.priority.toUpperCase() as Interpretation["priority"])
      : null;

  const projectId =
    raw.project_id && projectIds.has(raw.project_id) ? raw.project_id : null;

  const readView: ReadView | null =
    raw.read_view && READ_VIEWS.includes(raw.read_view as ReadView)
      ? (raw.read_view as ReadView)
      : null;

  const batchFilter: BatchFilter =
    raw.batch_filter && BATCH_FILTERS.includes(raw.batch_filter as Exclude<BatchFilter, null>)
      ? (raw.batch_filter as BatchFilter)
      : null;

  return {
    intent,
    verb: intent === "command" ? verb : null,
    taskMatches: intent === "command" ? taskMatches : [],
    isBatch: intent === "command" && raw.is_batch === true,
    batchFilter: intent === "command" ? batchFilter : null,
    scheduledFor: toISODate(raw.scheduled_for),
    snoozeUntil: toISODate(raw.snooze_until),
    priority,
    projectId,
    projectNamePhrase:
      typeof raw.project_name_phrase === "string" && raw.project_name_phrase.trim()
        ? raw.project_name_phrase.trim()
        : null,
    readView: intent === "read" ? readView : null,
    ambiguousCaptureVsCommand: raw.ambiguous_capture_vs_command === true,
    notes: typeof raw.notes === "string" && raw.notes.trim() ? raw.notes.trim() : null,
  };
}

/**
 * Interpret one captured line. Never throws: on any model/parse failure it
 * resolves to a plain capture, so the caller can always fall through to the
 * existing capture write and the thought is never lost.
 */
export async function interpret(
  text: string,
  ctx: InterpretContext,
): Promise<Interpretation> {
  const trimmed = text.trim();
  if (!trimmed) return captureFallback();

  try {
    const raw = await callClaude(trimmed, ctx);
    return validate(raw, ctx);
  } catch {
    // Best-effort by design — any failure files the line as a capture.
    return captureFallback();
  }
}
