"use client";

import { useMemo, useState } from "react";
import { groupForSort, type TaskSort, type TaskView } from "./params";
import { isOverdue, overdueDate } from "./overdue";
import { fmtDayLabel, fmtLate, fmtShort, todayISO } from "@/lib/dates";
import type { Priority, Task } from "@/lib/db/tasks";

type ProjectOption = { id: string; name: string };

const PRIO_ORDER: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

function dateCmp(a: string | null, b: string | null) {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : 1;
}
function byPriority(a: Task, b: Task) {
  return (
    PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority] ||
    dateCmp(a.scheduled_for, b.scheduled_for) ||
    a.created_at.localeCompare(b.created_at)
  );
}

/** The "When" cell: lateness (danger) for overdue, else a relative date. */
export function whenCell(task: Task, today: string): { text: string; over: boolean } {
  if (isOverdue(task, today)) {
    const d = overdueDate(task);
    return { text: d ? fmtLate(d, today) : "late", over: true };
  }
  if (task.scheduled_for) {
    return { text: fmtDayLabel(task.scheduled_for).replace(/ ·.*$/, ""), over: false };
  }
  if (task.due_date) return { text: `due ${fmtShort(task.due_date)}`, over: false };
  return { text: "—", over: false };
}

/**
 * The task table (mockup v4): a column grid — priority chip · title · project ·
 * when — with group sub-headers driven by the active sort. v4 step 1: display +
 * row selection. (Overdue/Unfiled pinned groups, filing, and bulk arrive next;
 * the detail panel opens on row click.)
 */
export function TaskTable({
  tasks,
  projects,
  sort,
  view,
  selectedId,
  onSelect,
}: {
  tasks: Task[];
  projects: ProjectOption[];
  sort: TaskSort;
  view: TaskView;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const today = todayISO();
  const projectName = useMemo(() => {
    const m = new Map(projects.map((p) => [p.id, p.name]));
    return (id: string | null) => (id ? m.get(id) ?? null : null);
  }, [projects]);

  const group = groupForSort(sort);

  const sorted = useMemo(() => {
    const arr = [...tasks];
    arr.sort((a, b) => {
      switch (sort) {
        case "due":
          return dateCmp(a.due_date, b.due_date) || byPriority(a, b);
        case "project": {
          const an = projectName(a.project_id);
          const bn = projectName(b.project_id);
          if (an === bn) return byPriority(a, b);
          if (an === null) return 1;
          if (bn === null) return -1;
          return an.localeCompare(bn) || byPriority(a, b);
        }
        case "created":
          return a.created_at.localeCompare(b.created_at);
        default:
          return byPriority(a, b);
      }
    });
    return arr;
  }, [tasks, sort, projectName]);

  const groups = useMemo(() => {
    if (group === "flat") return [{ key: "", label: "Tasks", tasks: sorted }];

    const map = new Map<string, Task[]>();
    for (const t of sorted) {
      const key =
        group === "day"
          ? t.scheduled_for ?? ""
          : group === "priority"
            ? t.priority
            : t.project_id ?? "";
      (map.get(key) ?? map.set(key, []).get(key)!).push(t);
    }
    const keys = [...map.keys()].sort((a, b) => {
      if (group === "priority") return PRIO_ORDER[a] - PRIO_ORDER[b];
      if (a === "") return 1;
      if (b === "") return -1;
      if (group === "project") {
        return (projectName(a) ?? "").localeCompare(projectName(b) ?? "");
      }
      return a < b ? -1 : 1;
    });
    const labelFor = (key: string) => {
      if (group === "day") return key === "" ? "Anytime" : fmtDayLabel(key);
      if (group === "priority") return `Priority ${key}`;
      return key === "" ? "No project" : projectName(key) ?? "No project";
    };
    return keys.map((key) => ({ key, label: labelFor(key), tasks: map.get(key)! }));
  }, [sorted, group, projectName]);

  if (tasks.length === 0) {
    return (
      <div className="list">
        <TableHeader />
        <div className="table-empty">
          <i className="ti ti-checkbox" aria-hidden="true" />
          {view === "completed"
            ? "Nothing completed yet."
            : view === "backlog"
              ? "Backlog is clear."
              : "Nothing here — add a task above."}
        </div>
      </div>
    );
  }

  return (
    <div className="list">
      <TableHeader />
      {groups.map((g) => (
        <div key={g.key || "flat"}>
          <div className="grp">
            {g.label}
            {group !== "flat" ? <> &middot; {g.tasks.length}</> : null}
          </div>
          {g.tasks.map((t) => (
            <TaskRowCells
              key={t.id}
              task={t}
              projectName={projectName(t.project_id)}
              today={today}
              selected={t.id === selectedId}
              onSelect={() => onSelect(t.id)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function TableHeader() {
  return (
    <div className="hdr">
      <span />
      <span>TITLE</span>
      <span>PROJECT</span>
      <span>WHEN</span>
    </div>
  );
}

export function TaskRowCells({
  task,
  projectName,
  today,
  selected,
  onSelect,
}: {
  task: Task;
  projectName: string | null;
  today: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const when = whenCell(task, today);
  const done = task.status === "done" || task.status === "cancelled";
  const prio = task.priority as Priority;

  return (
    <div
      className={selected ? "row sel" : "row"}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <span className={`chip chip-${prio}${done ? " chip-dim" : ""}`}>{prio}</span>
      <span className={`rt${done ? " rt-done" : ""}`}>{task.title}</span>
      <span className="rcell">
        {projectName ? <span className="tag">{projectName}</span> : null}
      </span>
      <span className={`when${when.over ? " over" : ""}`}>{when.text}</span>
    </div>
  );
}
