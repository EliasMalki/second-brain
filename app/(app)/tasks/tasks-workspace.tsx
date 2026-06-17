"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { TaskTable } from "./task-table";
import { isOverdue } from "./overdue";
import {
  bulkCompleteAction,
  bulkMoveProjectAction,
  bulkPriorityAction,
  bulkRescheduleAction,
  quickUpdateTaskAction,
} from "./actions";
import type { TaskSort, TaskView } from "./params";
import { addDaysISO, endOfWeekISO, todayISO } from "@/lib/dates";
import type { Priority, Task } from "@/lib/db/tasks";

type ProjectOption = { id: string; name: string };

const PRIORITIES: Priority[] = ["A", "B", "C", "D"];

function rescheduleChoices(): { label: string; value: string }[] {
  return [
    { label: "Today", value: todayISO() },
    { label: "Tomorrow", value: addDaysISO(todayISO(), 1) },
    { label: "End of week", value: endOfWeekISO() },
    { label: "No date", value: "" },
  ];
}
function closeMenu(el: HTMLElement) {
  el.closest("details")?.removeAttribute("open");
}

type Mut =
  | { type: "remove"; id: string }
  | { type: "project"; id: string; projectId: string | null }
  | { type: "priority"; id: string; priority: Priority }
  | { type: "reschedule"; id: string; date: string | null }
  | { type: "title"; id: string; title: string };

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
 * Owns the optimistic task list and selection. The table renders from the
 * filtered/optimistic set; filing and bulk edits apply locally before the server
 * confirms, then revalidation refreshes the base. (Detail panel arrives next.)
 */
export function TasksWorkspace({
  tasks,
  projects,
  view,
  sort,
  initialTaskId,
}: {
  tasks: Task[];
  projects: ProjectOption[];
  view: TaskView;
  sort: TaskSort;
  initialTaskId: string | null;
}) {
  const today = todayISO();
  const [optimistic, applyMut] = useOptimistic(tasks, (state: Task[], m: Mut) => {
    switch (m.type) {
      case "remove":
        return state.filter((t) => t.id !== m.id);
      case "project":
        return state.map((t) =>
          t.id === m.id ? { ...t, project_id: m.projectId } : t,
        );
      case "priority":
        return state.map((t) => (t.id === m.id ? { ...t, priority: m.priority } : t));
      case "reschedule":
        return state.map((t) =>
          t.id === m.id ? { ...t, scheduled_for: m.date } : t,
        );
      case "title":
        return state.map((t) => (t.id === m.id ? { ...t, title: m.title } : t));
    }
  });

  const [, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(initialTaskId);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const visible = useMemo(
    () => filterByView(optimistic, view, today),
    [optimistic, view, today],
  );

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

  const file = (id: string, projectId: string) =>
    startTransition(async () => {
      applyMut({ type: "project", id, projectId });
      await quickUpdateTaskAction(fd({ id, field: "project_id", value: projectId }));
    });

  // ---- bulk ---------------------------------------------------------------
  const toggleBulk = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const clearBulk = () => setSelected(new Set());
  const exitSelect = () => {
    setSelectMode(false);
    clearBulk();
  };
  const idsCsv = useMemo(() => [...selected].join(","), [selected]);

  const bulk = (action: () => Promise<void>, removeAll = false) => {
    const ids = [...selected];
    startTransition(async () => {
      if (removeAll) for (const id of ids) applyMut({ type: "remove", id });
      await action();
      clearBulk();
    });
  };

  const showTools = view !== "completed";

  return (
    <>
      {showTools ? (
        <div className="table-tools">
          <button
            type="button"
            className={selectMode ? "btn-pill go" : "btn-pill"}
            onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
          >
            <i className="ti ti-checklist" aria-hidden="true" />
            {selectMode ? "Done" : "Select"}
          </button>
          <span className="table-count">{visible.length} shown</span>
        </div>
      ) : null}

      <div className="panes">
        <TaskTable
          tasks={visible}
          projects={projects}
          sort={sort}
          view={view}
          selectedId={selectedId}
          selectMode={selectMode}
          selectedSet={selected}
          onSelect={select}
          onToggleBulk={toggleBulk}
          onFile={file}
        />
      </div>

      {selected.size > 0 ? (
        <div className="bulk-bar" role="toolbar" aria-label="Bulk actions">
          <span className="bulk-count">{selected.size} selected</span>
          <button
            type="button"
            className="btn-pill go"
            onClick={() => bulk(() => bulkCompleteAction(fd({ ids: idsCsv })), true)}
          >
            <i className="ti ti-check" aria-hidden="true" />
            Complete
          </button>

          <BulkMenu icon="ti-calendar" label="Reschedule">
            {rescheduleChoices().map((c) => (
              <button
                key={c.label}
                type="button"
                className="fmenu-item"
                onClick={(e) => {
                  closeMenu(e.currentTarget);
                  bulk(() => bulkRescheduleAction(fd({ ids: idsCsv, value: c.value })));
                }}
              >
                {c.label}
              </button>
            ))}
          </BulkMenu>

          <BulkMenu icon="ti-flag" label="Priority">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                className="fmenu-item"
                onClick={(e) => {
                  closeMenu(e.currentTarget);
                  bulk(() => bulkPriorityAction(fd({ ids: idsCsv, value: p })));
                }}
              >
                Priority {p}
              </button>
            ))}
          </BulkMenu>

          <BulkMenu icon="ti-folder" label="Move">
            <button
              type="button"
              className="fmenu-item"
              onClick={(e) => {
                closeMenu(e.currentTarget);
                bulk(() => bulkMoveProjectAction(fd({ ids: idsCsv, value: "" })));
              }}
            >
              No project
            </button>
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                className="fmenu-item"
                onClick={(e) => {
                  closeMenu(e.currentTarget);
                  bulk(() => bulkMoveProjectAction(fd({ ids: idsCsv, value: p.id })));
                }}
              >
                {p.name}
              </button>
            ))}
          </BulkMenu>

          <button type="button" className="btn-pill" onClick={clearBulk}>
            Clear
          </button>
        </div>
      ) : null}
    </>
  );
}

function BulkMenu({
  icon,
  label,
  children,
}: {
  icon: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <details className="fdrop fdrop-up">
      <summary className="btn-pill">
        <i className={`ti ${icon}`} aria-hidden="true" />
        {label}
        <i className="ti ti-chevron-up" aria-hidden="true" />
      </summary>
      <div className="fmenu">{children}</div>
    </details>
  );
}
