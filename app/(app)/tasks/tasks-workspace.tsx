"use client";

import { useMemo, useState } from "react";
import { TaskTable } from "./task-table";
import { isOverdue } from "./overdue";
import type { TaskSort, TaskView } from "./params";
import { todayISO } from "@/lib/dates";
import type { Task } from "@/lib/db/tasks";

type ProjectOption = { id: string; name: string };

/** Client-side view filter over the fetched set (instant view switching). */
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

/** Reflect the selected task in the URL without a server refetch. */
function syncTaskParam(id: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("task", id);
  else url.searchParams.delete("task");
  window.history.replaceState(null, "", url);
}

/**
 * Holds the table (and, from v4 step 4, the detail panel). Owns the selected-id
 * state so the list and panel share one source of truth and edits stay optimistic.
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
  const [selectedId, setSelectedId] = useState<string | null>(initialTaskId);

  const visible = useMemo(
    () => filterByView(tasks, view, today),
    [tasks, view, today],
  );

  const select = (id: string) => {
    const next = id === selectedId ? null : id;
    setSelectedId(next);
    syncTaskParam(next);
  };

  return (
    <div className="panes">
      <TaskTable
        tasks={visible}
        projects={projects}
        sort={sort}
        view={view}
        selectedId={selectedId}
        onSelect={select}
      />
    </div>
  );
}
