/**
 * The Tasks page is URL-driven so every view is shareable and server-rendered
 * (RLS-scoped fetch). One place parses the query and one builds links, so the
 * page and the control bar can't drift.
 *
 * v4: the primary axis is the segmented "view" (all/today/overdue/backlog/
 * recurring, plus a quiet "completed"). Grouping is IMPLIED by sort — Project →
 * by project, Priority → by priority, Due → by day, Created → flat — so there is
 * no separate group control to crowd the bar.
 */

export type TaskView =
  | "all"
  | "today"
  | "overdue"
  | "backlog"
  | "recurring"
  | "completed";
export type TaskSort = "priority" | "due" | "project" | "created";
export type TaskGroup = "project" | "priority" | "day" | "flat";

export type TasksParams = {
  view: TaskView;
  projectIds: string[];
  sort: TaskSort;
  /** Selected task id for the detail panel (deep-link / initial open). */
  task: string | null;
};

const VIEWS: TaskView[] = [
  "all",
  "today",
  "overdue",
  "backlog",
  "recurring",
  "completed",
];
const SORTS: TaskSort[] = ["priority", "due", "project", "created"];

export const DEFAULTS: TasksParams = {
  view: "all",
  projectIds: [],
  sort: "priority",
  task: null,
};

export function parseTasksParams(sp: {
  view?: string;
  project?: string;
  sort?: string;
  task?: string;
}): TasksParams {
  return {
    view: VIEWS.includes(sp.view as TaskView) ? (sp.view as TaskView) : "all",
    projectIds: (sp.project ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    sort: SORTS.includes(sp.sort as TaskSort) ? (sp.sort as TaskSort) : "priority",
    task: sp.task ? sp.task : null,
  };
}

/** Grouping is a function of the chosen sort (no separate control). */
export function groupForSort(sort: TaskSort): TaskGroup {
  switch (sort) {
    case "project":
      return "project";
    case "due":
      return "day";
    case "created":
      return "flat";
    default:
      return "priority";
  }
}

/**
 * Build /tasks?... from current params + overrides, omitting defaults. The
 * `task` (panel) param is deliberately NOT carried here — filter/view links
 * drop the panel; the workspace manages selection via history.replaceState so
 * selecting a row never triggers a server refetch.
 */
export function buildTasksHref(
  current: TasksParams,
  overrides: Partial<TasksParams> = {},
): string {
  const p: TasksParams = { ...current, ...overrides };
  const q = new URLSearchParams();
  if (p.view !== DEFAULTS.view) q.set("view", p.view);
  if (p.projectIds.length > 0) q.set("project", p.projectIds.join(","));
  if (p.sort !== DEFAULTS.sort) q.set("sort", p.sort);
  const s = q.toString();
  return s ? `/tasks?${s}` : "/tasks";
}

/** Toggle a project id in/out of the multi-select set. */
export function toggleProject(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}
