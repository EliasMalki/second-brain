"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { TaskTable } from "./task-table";
import { TaskPanel } from "./task-panel";
import { isOverdue } from "./overdue";
import {
  bulkCompleteAction,
  bulkMoveProjectAction,
  bulkPriorityAction,
  bulkRescheduleAction,
  completeTaskAction,
  deleteTaskAction,
  hardDeleteTaskAction,
  quickUpdateTaskAction,
  reopenTaskQuietAction,
} from "./actions";
import type { TaskSort, TaskView } from "./params";
import { addDaysISO, endOfWeekISO, todayISO } from "@/lib/dates";
import type { Availability, Effort, Priority, Task } from "@/lib/db/tasks";
import type { Recurrence } from "@/lib/db/recurrences";

type ProjectOption = { id: string; name: string; color?: string | null };

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
      // a record belongs to a project — moving projects drops the record link
      return { project_id: value || null, record_id: null };
    case "record_id":
      return { record_id: value || null };
    case "effort":
      return { effort: (value || null) as Effort | null };
    case "availability":
      return { availability: (value || null) as Availability | null };
    case "body":
      return { body: value || null };
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
 * Owns the optimistic task list + selection. The table renders from the filtered
 * set; the detail panel (right) opens on row click and edits the same optimistic
 * task, so list and panel never disagree. Edits apply locally then persist;
 * revalidation refreshes the base.
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
}) {
  const today = todayISO();
  const [optimistic, applyMut] = useOptimistic(tasks, (state: Task[], m: Mut) =>
    m.type === "remove"
      ? state.filter((t) => t.id !== m.id)
      : state.map((t) => (t.id === m.id ? { ...t, ...m.patch } : t)),
  );

  const [, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(initialTaskId);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const visible = useMemo(
    () => filterByView(optimistic, view, today),
    [optimistic, view, today],
  );
  const selectedTask = useMemo(
    () => (selectedId ? optimistic.find((t) => t.id === selectedId) ?? null : null),
    [optimistic, selectedId],
  );
  const selectedRecurrence = selectedTask?.recurrence_id
    ? recurrences.find((r) => r.id === selectedTask.recurrence_id) ?? null
    : null;

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

  const file = (id: string, projectId: string) => patch(id, "project_id", projectId);

  const complete = (id: string) =>
    startTransition(async () => {
      applyMut({ type: "remove", id });
      if (id === selectedId) close();
      await completeTaskAction(fd({ id }));
    });

  const del = (id: string) =>
    startTransition(async () => {
      applyMut({ type: "remove", id });
      if (id === selectedId) close();
      await deleteTaskAction(fd({ id }));
    });

  const reopen = (id: string) =>
    startTransition(async () => {
      applyMut({ type: "remove", id });
      if (id === selectedId) close();
      await reopenTaskQuietAction(fd({ id }));
    });

  const hardDelete = (id: string) =>
    startTransition(async () => {
      applyMut({ type: "remove", id });
      if (id === selectedId) close();
      await hardDeleteTaskAction(fd({ id }));
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
          recordNameById={recordNameById}
          sort={sort}
          view={view}
          selectedId={selectedId}
          selectMode={selectMode}
          selectedSet={selected}
          onSelect={select}
          onToggleBulk={toggleBulk}
          onFile={file}
        />
        {selectedTask ? (
          <TaskPanel
            key={selectedTask.id}
            task={selectedTask}
            projects={projects}
            recurrence={selectedRecurrence}
            recordsByProject={recordsByProject}
            recordLabelByProject={recordLabelByProject}
            onPatch={(field, value) => patch(selectedTask.id, field, value)}
            onComplete={() => complete(selectedTask.id)}
            onDelete={() => del(selectedTask.id)}
            onReopen={() => reopen(selectedTask.id)}
            onHardDelete={() => hardDelete(selectedTask.id)}
            onClose={close}
          />
        ) : null}
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
