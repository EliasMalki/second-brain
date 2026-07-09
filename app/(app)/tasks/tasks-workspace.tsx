"use client";

import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { TaskList } from "./task-list";
import { TaskGrid } from "./task-grid";
import { TaskPanel } from "./task-panel";
import { buildSections } from "./bucket";
import { isOverdue } from "./overdue";
import { UndoToast, useUndoToast } from "../undo-toast";
import {
  completeTaskAction,
  deleteTaskAction,
  hardDeleteTaskAction,
  quickUpdateTaskAction,
  reopenTaskQuietAction,
} from "./actions";
import type { TaskSort, TaskView } from "./params";
import { todayISO } from "@/lib/dates";
import type { Availability, Effort, Priority, Task } from "@/lib/db/tasks";
import type { Recurrence } from "@/lib/db/recurrences";

type ProjectOption = { id: string; name: string; color?: string | null };
type Layout = "list" | "grid";
const LAYOUT_KEY = "sb_tasks_view";

type Mut = { type: "remove"; id: string } | { type: "patch"; id: string; patch: Partial<Task> };

/** Map a quick-edit field+value to the optimistic Task patch. */
function toPatch(field: string, value: string): Partial<Task> {
  switch (field) {
    case "title":
      return { title: value };
    case "priority":
      return { priority: value as Priority };
    case "scheduled_for":
      return { scheduled_for: value || null };
    case "due_date":
      return { due_date: value || null };
    case "project_id":
      return { project_id: value || null, record_id: null };
    case "record_id":
      return { record_id: value || null };
    case "effort":
      return { effort: (value || null) as Effort | null };
    case "availability":
      return { availability: (value || null) as Availability | null };
    case "body":
      return { body: value || null };
    case "start_at": {
      const day = value ? new Date(value).toLocaleDateString("en-CA") : null;
      const end = value
        ? new Date(new Date(value).getTime() + 3_600_000).toISOString()
        : null;
      return { start_at: value || null, scheduled_for: day, end_at: end };
    }
    case "all_day":
      return { scheduled_for: value || null, start_at: null, end_at: null };
    default:
      return {};
  }
}

function filterByView(tasks: Task[], view: TaskView, today: string): Task[] {
  switch (view) {
    case "today":
      return tasks.filter((t) => t.scheduled_for === today || isOverdue(t, today));
    case "overdue":
      return tasks.filter((t) => isOverdue(t, today));
    case "backlog":
      return tasks.filter((t) => !t.scheduled_for && !t.due_date);
    default:
      return tasks;
  }
}

function syncTaskParam(id: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("task", id);
  else url.searchParams.delete("task");
  window.history.replaceState(null, "", url);
}

/**
 * Owns the optimistic task list + the List/Grid layout + panel selection. The
 * body renders the shared time-buckets (List or Grid); the detail panel opens
 * on row/card click and edits the same optimistic task, so list and panel never
 * disagree. Header pulse counts run live off the optimistic open set.
 */
export function TasksWorkspace({
  tasks,
  projects,
  recurrences,
  view,
  sort,
  initialTaskId,
  recordsByProject,
  recordLabelByProject,
  recordNameById,
  openCount,
  overdueCount,
  todayCount,
  quickAdd,
  filterBar,
  recurring,
}: {
  tasks: Task[];
  projects: ProjectOption[];
  recurrences: Recurrence[];
  view: TaskView;
  sort: TaskSort;
  initialTaskId: string | null;
  recordsByProject: Record<string, { id: string; name: string }[]>;
  recordLabelByProject: Record<string, string>;
  recordNameById: Record<string, string>;
  openCount: number;
  overdueCount: number;
  todayCount: number;
  quickAdd: React.ReactNode;
  filterBar: React.ReactNode;
  recurring: React.ReactNode | null;
}) {
  const today = todayISO();
  const [optimistic, applyMut] = useOptimistic(tasks, (state: Task[], m: Mut) =>
    m.type === "remove"
      ? state.filter((t) => t.id !== m.id)
      : state.map((t) => (t.id === m.id ? { ...t, ...m.patch } : t)),
  );
  const [, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(initialTaskId);
  const undo = useUndoToast();

  // Layout preference: default "list" for a stable first paint, then adopt the
  // saved choice on mount (prototype persisted this to localStorage['sb_tasks_view']).
  const [layout, setLayout] = useState<Layout>("list");
  useEffect(() => {
    const saved = localStorage.getItem(LAYOUT_KEY);
    if (saved === "grid" || saved === "list") setLayout(saved);
  }, []);
  const chooseLayout = (v: Layout) => {
    setLayout(v);
    try {
      localStorage.setItem(LAYOUT_KEY, v);
    } catch {
      /* storage disabled — the in-memory choice still applies */
    }
  };

  const projectName = useMemo(() => {
    const m = new Map(projects.map((p) => [p.id, p.name]));
    return (id: string | null) => (id ? m.get(id) ?? null : null);
  }, [projects]);

  const visible = useMemo(
    () => filterByView(optimistic, view, today),
    [optimistic, view, today],
  );
  const sections = useMemo(
    () => buildSections(visible, sort, projectName, today, view === "completed"),
    [visible, sort, projectName, today, view],
  );

  const selectedTask = useMemo(
    () => (selectedId ? optimistic.find((t) => t.id === selectedId) ?? null : null),
    [optimistic, selectedId],
  );
  const selectedRecurrence = selectedTask?.recurrence_id
    ? recurrences.find((r) => r.id === selectedTask.recurrence_id) ?? null
    : null;

  // Live pulse counts off the optimistic OPEN set (page passes the full open set
  // for every non-completed view), so completing a task ticks the numbers down.
  const live = view !== "completed";
  const openN = live ? optimistic.length : openCount;
  const overdueN = live ? optimistic.filter((t) => isOverdue(t, today)).length : overdueCount;
  const todayN = live
    ? optimistic.filter(
        (t) => !isOverdue(t, today) && (t.scheduled_for === today || t.due_date === today),
      ).length
    : todayCount;

  const fd = (entries: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(entries)) f.set(k, v);
    return f;
  };

  const select = (id: string) => {
    const next = id === selectedId ? null : id;
    setSelectedId(next);
    syncTaskParam(next);
  };
  const close = () => {
    setSelectedId(null);
    syncTaskParam(null);
  };

  const patch = (id: string, field: string, value: string) =>
    startTransition(async () => {
      applyMut({ type: "patch", id, patch: toPatch(field, value) });
      await quickUpdateTaskAction(fd({ id, field, value }));
    });

  const remove = (id: string, action: (f: FormData) => Promise<void>) =>
    startTransition(async () => {
      applyMut({ type: "remove", id });
      if (id === selectedId) close();
      await action(fd({ id }));
    });

  const complete = (id: string) => remove(id, completeTaskAction);
  const del = (id: string) => remove(id, deleteTaskAction);
  const reopen = (id: string) => remove(id, reopenTaskQuietAction);
  const hardDelete = (id: string) => remove(id, hardDeleteTaskAction);

  // Complete + offer undo (reopen). Used by the row circle and the panel's Done
  // button so both are reversible, matching Inbox/Home/Projects.
  const completeWithUndo = (t: Task) => {
    complete(t.id);
    undo.show({
      msg: `Completed “${t.title}”`,
      undo: () =>
        startTransition(async () => {
          await reopenTaskQuietAction(fd({ id: t.id }));
        }),
    });
  };

  // Circle / Done pill: complete an open task, reopen a done one — either way it
  // leaves the current view's list.
  const check = (t: Task) =>
    t.status === "done" || t.status === "cancelled" ? reopen(t.id) : completeWithUndo(t);

  const empty = sections.length === 0;
  const emptyCopy =
    view === "completed"
      ? "Nothing completed yet."
      : view === "backlog"
        ? "Backlog is clear."
        : view === "overdue"
          ? "Nothing overdue — nice."
          : view === "today"
            ? "Nothing due today."
            : "Nothing here — add a task above.";

  return (
    <>
    <div className="tasks2" data-view={layout}>
      <div className="t-head">
        <div>
          <h1 className="t-title">Tasks</h1>
          <p className="t-sub">
            <b>{openN}</b>&nbsp;open
            {overdueN > 0 ? (
              <>
                <span className="dotsep" />
                <span className="od">
                  {overdueN} overdue
                </span>
              </>
            ) : null}
            <span className="dotsep" />
            <span>{todayN} today</span>
          </p>
        </div>
        <div className="t-headrail">
          {recurring ? null : (
            <div className="t-toggle" role="group" aria-label="Layout">
              <button
                type="button"
                className={layout === "list" ? "on" : undefined}
                aria-pressed={layout === "list"}
                onClick={() => chooseLayout("list")}
              >
                <i className="ti ti-list" aria-hidden="true" />
                List
              </button>
              <button
                type="button"
                className={layout === "grid" ? "on" : undefined}
                aria-pressed={layout === "grid"}
                onClick={() => chooseLayout("grid")}
              >
                <i className="ti ti-layout-grid" aria-hidden="true" />
                Grid
              </button>
            </div>
          )}
        </div>
      </div>

      {quickAdd}
      {filterBar}

      {recurring ? (
        recurring
      ) : (
        <div className="panes">
          <div className="t-body">
            {empty ? (
              <div className={layout === "grid" ? "t-board-empty" : "t-list-empty"}>
                {emptyCopy}
              </div>
            ) : layout === "grid" ? (
              <TaskGrid
                sections={sections}
                projects={projects}
                selectedId={selectedId}
                onSelect={select}
                onCheck={check}
              />
            ) : (
              <TaskList
                sections={sections}
                projects={projects}
                selectedId={selectedId}
                onSelect={select}
                onCheck={check}
              />
            )}
          </div>

          {selectedTask ? (
            <TaskPanel
              key={selectedTask.id}
              task={selectedTask}
              projects={projects}
              recurrence={selectedRecurrence}
              recordsByProject={recordsByProject}
              recordLabelByProject={recordLabelByProject}
              onPatch={(field, value) => patch(selectedTask.id, field, value)}
              onComplete={() => completeWithUndo(selectedTask)}
              onDelete={() => del(selectedTask.id)}
              onReopen={() => reopen(selectedTask.id)}
              onHardDelete={() => hardDelete(selectedTask.id)}
              onClose={close}
            />
          ) : null}
        </div>
      )}
    </div>
    <UndoToast toast={undo.toast} onClear={undo.clear} />
    </>
  );
}
