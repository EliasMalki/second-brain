import "server-only";

import { generatePayload, type BriefPayload } from "@/lib/db/brief";
import { listTasks, listTasksScheduledBetween, type Priority } from "@/lib/db/tasks";
import { isOverdue, overdueDate } from "@second-brain/shared/domain/buckets";
import { endOfWeekISO, fmtShort, fmtLate } from "@second-brain/shared/domain/dates";
import type { Candidates } from "@/lib/commands/match";
import type { Interpretation, InterpreterResult } from "@/lib/commands/types";

/**
 * Capture command interpreter — the three fixed read views + the fence (step 6).
 *
 * This is deliberately NOT a query engine. It serves exactly four reads (brief,
 * this week, a project's open tasks, overdue) by REUSING the queries the app
 * already runs, and deflects everything else to in-app search. Each view
 * renders to plain text so it ports straight to a messaging channel.
 */

export const DEFLECT =
  "I can show your today, this week, a project's tasks, or what's overdue — for anything else, use search in the app.";

const ORDER: Priority[] = ["A", "B", "C", "D"];

function renderBrief(payload: BriefPayload): string {
  const all = ORDER.flatMap((p) => payload.by_priority[p]);
  if (all.length === 0) return "Nothing scheduled for today — you're clear.";

  const lines = all.map((t) => {
    const proj = t.project_id ? payload.project_names[t.project_id] : null;
    return `[${t.priority}] ${t.title}${proj ? ` · ${proj}` : ""}`;
  });
  let msg = `Today — ${all.length} ${all.length === 1 ? "item" : "items"}:\n${lines.join("\n")}`;
  if (payload.hidden_business_hours > 0) {
    msg += `\n(+${payload.hidden_business_hours} off-hours hidden right now)`;
  }
  return msg;
}

async function renderWeek(today: string): Promise<string> {
  const tasks = await listTasksScheduledBetween(today, endOfWeekISO());
  if (tasks.length === 0) return "Nothing scheduled this week.";
  const lines = tasks.map(
    (t) => `${t.scheduled_for ? fmtShort(t.scheduled_for) : "—"} · [${t.priority}] ${t.title}`,
  );
  return `This week — ${tasks.length} ${tasks.length === 1 ? "item" : "items"}:\n${lines.join("\n")}`;
}

async function renderOverdue(): Promise<string> {
  // Match the Tasks page rule (due_date OR scheduled_for in the past), not the
  // brief's scheduled_for-only set.
  const open = await listTasks({ status: "open" });
  const overdue = open.filter((t) => isOverdue(t));
  if (overdue.length === 0) return "Nothing overdue — nice.";

  const lines = overdue.map((t) => {
    const d = overdueDate(t);
    return `[${t.priority}] ${t.title}${d ? ` · ${fmtLate(d)}` : ""}`;
  });
  return `Overdue — ${overdue.length} ${overdue.length === 1 ? "item" : "items"}:\n${lines.join("\n")}`;
}

async function renderProject(projectId: string, name: string): Promise<string> {
  const tasks = await listTasks({ status: "open", projectId });
  if (tasks.length === 0) return `No open tasks in ${name}.`;
  const lines = tasks.map((t) => `[${t.priority}] ${t.title}`);
  return `${name} — ${tasks.length} open ${tasks.length === 1 ? "task" : "tasks"}:\n${lines.join("\n")}`;
}

/**
 * Serve a read request, or deflect. Project resolution uses the same confidence
 * rule as commands: a resolved id is used; a named-but-unmatched project asks;
 * a missing project name asks which.
 */
export async function handleRead(
  interp: Interpretation,
  candidates: Candidates,
): Promise<InterpreterResult> {
  switch (interp.readView) {
    case "brief": {
      const { payload } = await generatePayload();
      return { kind: "read", view: "brief", message: renderBrief(payload) };
    }
    case "week":
      return { kind: "read", view: "week", message: await renderWeek(candidates.today) };
    case "overdue":
      return { kind: "read", view: "overdue", message: await renderOverdue() };
    case "project_tasks": {
      if (interp.projectId) {
        const name =
          candidates.projects.find((p) => p.id === interp.projectId)?.name ?? "that project";
        return {
          kind: "read",
          view: "project_tasks",
          message: await renderProject(interp.projectId, name),
        };
      }
      if (interp.projectNamePhrase) {
        return {
          kind: "info",
          message: `I couldn't find a project called “${interp.projectNamePhrase}”.`,
        };
      }
      return { kind: "info", message: "Which project?" };
    }
    default:
      // read-like, but not one of the four → the fence.
      return { kind: "info", message: DEFLECT };
  }
}
