/**
 * The Tasks page is URL-driven so every filter/sort/group view is shareable and
 * server-rendered (RLS-scoped fetch, no client data leak). One place parses the
 * query and one builds links, so the page and the filter bar can't drift.
 */

export type TaskView = "list" | "recurring";
export type TaskListStatus = "open" | "done" | "cancelled";
export type TaskTiming = "timed" | "undated";
export type TaskSort = "priority" | "due" | "project" | "created";
export type TaskGroup = "project" | "priority" | "day" | "flat";

export type TasksParams = {
  status: TaskListStatus;
  view: TaskView;
  projectIds: string[];
  timing: TaskTiming | null;
  sort: TaskSort;
  group: TaskGroup;
};

const STATUSES: TaskListStatus[] = ["open", "done", "cancelled"];
const SORTS: TaskSort[] = ["priority", "due", "project", "created"];
const GROUPS: TaskGroup[] = ["project", "priority", "day", "flat"];

export const DEFAULTS: TasksParams = {
  status: "open",
  view: "list",
  projectIds: [],
  timing: null,
  sort: "priority",
  group: "day",
};

export function parseTasksParams(sp: {
  status?: string;
  view?: string;
  project?: string;
  timing?: string;
  sort?: string;
  group?: string;
}): TasksParams {
  return {
    status: STATUSES.includes(sp.status as TaskListStatus)
      ? (sp.status as TaskListStatus)
      : "open",
    view: sp.view === "recurring" ? "recurring" : "list",
    projectIds: (sp.project ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    timing:
      sp.timing === "timed" || sp.timing === "undated"
        ? (sp.timing as TaskTiming)
        : null,
    sort: SORTS.includes(sp.sort as TaskSort) ? (sp.sort as TaskSort) : "priority",
    group: GROUPS.includes(sp.group as TaskGroup)
      ? (sp.group as TaskGroup)
      : "day",
  };
}

/** Build /tasks?... from the current params + overrides, omitting defaults. */
export function buildTasksHref(
  current: TasksParams,
  overrides: Partial<TasksParams> = {},
): string {
  const p: TasksParams = { ...current, ...overrides };
  const q = new URLSearchParams();
  if (p.status !== DEFAULTS.status) q.set("status", p.status);
  if (p.view !== DEFAULTS.view) q.set("view", p.view);
  if (p.projectIds.length > 0) q.set("project", p.projectIds.join(","));
  if (p.timing) q.set("timing", p.timing);
  if (p.sort !== DEFAULTS.sort) q.set("sort", p.sort);
  if (p.group !== DEFAULTS.group) q.set("group", p.group);
  const s = q.toString();
  return s ? `/tasks?${s}` : "/tasks";
}

/** Toggle a project id in/out of the multi-select set. */
export function toggleProject(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}
