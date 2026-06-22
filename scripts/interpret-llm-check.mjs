/**
 * Live LLM-behavior check for the capture command interpreter.
 *
 * Replicates lib/commands/interpret.ts's Anthropic call (same model, system
 * prompt, and json_schema) against a fixed FICTIONAL task/project set, and runs
 * a battery of inputs covering all the scenarios: 3-way intent, the five verbs,
 * typo/voice-error matching, batch + "all", the three reads + the deflection
 * fence, create-vs-command, and project-name commands. Prints PASS/FAIL per case.
 *
 * No app data touched — purely exercises the prompt. Run:
 *   node --env-file=.env.local scripts/interpret-llm-check.mjs
 */

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = (process.env.COMMAND_MODEL || "claude-haiku-4-5").trim();
const TODAY = "2026-06-21";

// ---- prompt + schema: copied verbatim from lib/commands/interpret.ts ----
const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: { type: "string", enum: ["capture", "command", "read"], description: "capture = a new note/task to file (the DEFAULT when unsure); command = act on an existing task; read = ask for one of the fixed views" },
    verb: { type: ["string", "null"], description: "for intent=command only: one of complete | reschedule | snooze | reprioritize | refile. Closed set — anything outside these five is NOT a command; use null then." },
    task_matches: { type: "array", description: "for intent=command: the candidate task ids this refers to, best match first, each with a 0..1 confidence. Use ids from the provided list ONLY. Empty if nothing plausibly matches.", items: { type: "object", additionalProperties: false, properties: { id: { type: "string", description: "a task id from the provided list" }, confidence: { type: "number", description: "0..1 confidence this is the intended task" } }, required: ["id", "confidence"] } },
    is_batch: { type: "boolean", description: "true when the user clearly targets MORE THAN ONE task (e.g. 'close the brakes and the registration')." },
    batch_filter: { type: ["string", "null"], description: "set when the user targets a FILTER-defined set rather than named tasks, one of: all_open ('all'/'everything'); today ('all today's'); overdue ('everything overdue'); project ('all the <project> tasks' — also set project_id). null otherwise." },
    scheduled_for: { type: ["string", "null"], description: "for verb=reschedule: the target date as YYYY-MM-DD, resolving relative dates against today. null if none stated." },
    snooze_until: { type: ["string", "null"], description: "for verb=snooze: an EXPLICIT target date as YYYY-MM-DD if the user gave one; null to let the app default it." },
    priority: { type: ["string", "null"], description: "for verb=reprioritize: the target priority, one of A (highest), B, C, D. null otherwise." },
    project_id: { type: ["string", "null"], description: "for verb=refile or read_view=project_tasks: the matching project id from the provided list, or null if none clearly fits." },
    project_name_phrase: { type: ["string", "null"], description: "the project name the user actually typed/said (even if you couldn't match it to an id), or null." },
    read_view: { type: ["string", "null"], description: "for intent=read: which fixed view, one of brief | week | project_tasks | overdue. Use null when the request is read-like but NOT one of these four (e.g. counts, search, composed filters) — the app will deflect it." },
    ambiguous_capture_vs_command: { type: "boolean", description: "true for phrasing that could be a NEW task or completing an existing one (e.g. 'finish the invoice')." },
    notes: { type: ["string", "null"], description: "one short phrase of rationale, for confirmation wording. May be null." },
  },
  required: ["intent", "verb", "task_matches", "is_batch", "batch_filter", "scheduled_for", "snooze_until", "priority", "project_id", "project_name_phrase", "read_view", "ambiguous_capture_vs_command", "notes"],
};

function systemPrompt(today) {
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

// ---- fictional candidates (no real data) ----
const projects = [
  { id: "p1", name: "Epoxy floors", aliases: ["epoxy", "garage floor"] },
  { id: "p2", name: "Civic flip", aliases: ["civic", "2019 civic", "honda"] },
  { id: "p3", name: "Home", aliases: [] },
];
const tasks = [
  { id: "t1", title: "Order E53 brake pads", project: "Civic flip", status: "open", scheduled_for: null },
  { id: "t2", title: "Renew RBQ licence", project: "Epoxy floors", status: "open", scheduled_for: null },
  { id: "t3", title: "Call the dentist", project: "Home", status: "open", scheduled_for: "2026-06-24" },
  { id: "t4", title: "Buy epoxy resin", project: "Epoxy floors", status: "open", scheduled_for: "2026-06-21" },
  { id: "t5", title: "Oil change", project: "Civic flip", status: "open", scheduled_for: "2026-06-21" },
  { id: "t6", title: "Pay the invoice", project: "Civic flip", status: "open", scheduled_for: "2026-06-18" },
  { id: "t7", title: "Detail the Civic", project: "Civic flip", status: "snoozed", scheduled_for: null },
  { id: "n1", title: "Grinder broke, need a new one", project: null, status: "note", scheduled_for: null },
];
const titleById = Object.fromEntries(tasks.map((t) => [t.id, t.title]));
const nameById = Object.fromEntries(projects.map((p) => [p.id, p.name]));

async function interpret(input) {
  const payload = {
    input,
    today: TODAY,
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, project: t.project, status: t.status, scheduled_for: t.scheduled_for })),
    projects,
  };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1024, system: systemPrompt(TODAY), output_config: { format: { type: "json_schema", schema: RESPONSE_SCHEMA } }, messages: [{ role: "user", content: JSON.stringify(payload) }] }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const block = data.content?.find((b) => b.type === "text");
  return JSON.parse(block.text);
}

const top = (r) => (r.task_matches?.[0] ? r.task_matches[0].id : null);

// ---- the battery: each expect() returns true on PASS ----
const cases = [
  { in: "pick up milk on the way home", x: (r) => r.intent === "capture" },
  { in: "I ordered the brake pads", x: (r) => r.intent === "command" && r.verb === "complete" && top(r) === "t1" },
  { in: "done with the RBQ renewal", x: (r) => r.intent === "command" && r.verb === "complete" && top(r) === "t2" },
  { in: "move the dentist call to Friday", x: (r) => r.intent === "command" && r.verb === "reschedule" && top(r) === "t3" && r.scheduled_for > TODAY },
  { in: "push buy epoxy resin to tomorrow", x: (r) => r.intent === "command" && r.verb === "reschedule" && top(r) === "t4" && r.scheduled_for === "2026-06-22" },
  { in: "snooze the dentist task", x: (r) => r.intent === "command" && r.verb === "snooze" && top(r) === "t3" },
  { in: "make the invoice an A", x: (r) => r.intent === "command" && r.verb === "reprioritize" && top(r) === "t6" && r.priority === "A" },
  { in: "move the brake pads to the Home project", x: (r) => r.intent === "command" && r.verb === "refile" && top(r) === "t1" && r.project_id === "p3" },
  { in: "close the brakes and the registration", x: (r) => r.intent === "command" && r.is_batch === true },
  { in: "mark all of today's tasks done", x: (r) => r.intent === "command" && r.verb === "complete" && r.batch_filter === "today" },
  { in: "what's on today", x: (r) => r.intent === "read" && r.read_view === "brief" },
  { in: "what's on this week", x: (r) => r.intent === "read" && r.read_view === "week" },
  { in: "what's left for Epoxy", x: (r) => r.intent === "read" && r.read_view === "project_tasks" && r.project_id === "p1" },
  { in: "what's overdue", x: (r) => r.intent === "read" && r.read_view === "overdue" },
  { in: "how many open tasks do I have", x: (r) => r.intent === "read" && r.read_view === null },
  { in: "I did the are bee cue renewal", x: (r) => r.intent === "command" && r.verb === "complete" && top(r) === "t2", note: "voice-garbled RBQ" },
  { in: "complete teh oil chnage", x: (r) => r.intent === "command" && r.verb === "complete" && top(r) === "t5", note: "typos" },
  { in: "finish the invoice", x: (r) => r.ambiguous_capture_vs_command === true, note: "create-vs-command" },
  { in: "close Epoxy", x: (r) => /epoxy/i.test(r.project_name_phrase || ""), note: "project-name command" },
  { in: "delete the brake pads task", x: (r) => r.verb === null, note: "delete not in verb set" },
  { in: "the grinder is broken, need a replacement", x: (r) => r.intent === "capture" },
];

let pass = 0, fail = 0;
console.log(`Model: ${MODEL}   today: ${TODAY}\n`);
for (const c of cases) {
  let r, ok, detail = "";
  try {
    r = await interpret(c.in);
    ok = !!c.x(r);
  } catch (e) {
    ok = false;
    detail = String(e.message || e);
  }
  if (ok) pass++; else fail++;
  const matches = (r?.task_matches || []).map((m) => `${titleById[m.id] || m.id}@${m.confidence}`).join(", ");
  const slot = [
    r?.verb && `verb=${r.verb}`,
    r?.batch_filter && `batch=${r.batch_filter}`,
    r?.is_batch && "isBatch",
    r?.scheduled_for && `sched=${r.scheduled_for}`,
    r?.snooze_until && `snooze=${r.snooze_until}`,
    r?.priority && `prio=${r.priority}`,
    r?.project_id && `proj=${nameById[r.project_id] || r.project_id}`,
    r?.project_name_phrase && `projName="${r.project_name_phrase}"`,
    r?.read_view && `view=${r.read_view}`,
    r?.ambiguous_capture_vs_command && "ambiguous",
  ].filter(Boolean).join(" ");
  console.log(`${ok ? "✓" : "✗"} "${c.in}"${c.note ? `  (${c.note})` : ""}`);
  console.log(`    → ${r ? r.intent : "ERROR"} ${slot}${matches ? `  [${matches}]` : ""}${detail ? `  ${detail}` : ""}`);
}
console.log(`\nRESULT: ${pass} passed, ${fail} failed of ${cases.length}`);
process.exit(fail === 0 ? 0 : 1);
