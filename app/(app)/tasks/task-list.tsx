"use client";

import { useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  bulkCompleteAction,
  bulkMoveProjectAction,
  bulkPriorityAction,
  bulkRescheduleAction,
  completeTaskAction,
  quickUpdateTaskAction,
  reopenTaskAction,
} from "./actions";
import type { TaskGroup, TaskListStatus, TaskSort } from "./params";
import { addDaysISO, endOfWeekISO, fmtDayLabel, fmtShort, todayISO } from "@/lib/dates";
import type { Priority, Task } from "@/lib/db/tasks";

type ProjectOption = { id: string; name: string };

const PRIO_ORDER: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
const PRIORITIES: Priority[] = ["A", "B", "C", "D"];

/** Date compare with NULLs last (undated sinks below scheduled work). */
function dateCmp(a: string | null, b: string | null) {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : 1;
}

/** Default ordering: priority, then schedule, then creation. */
function byPriority(a: Task, b: Task) {
  return (
    PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority] ||
    dateCmp(a.scheduled_for, b.scheduled_for) ||
    a.created_at.localeCompare(b.created_at)
  );
}

/** Quick-reschedule choices shared by the row menu and the bulk bar. */
function rescheduleChoices(): { label: string; value: string }[] {
  return [
    { label: "Today", value: todayISO() },
    { label: "Tomorrow", value: addDaysISO(todayISO(), 1) },
    { label: "End of week", value: endOfWeekISO() },
    { label: "No date", value: "" },
  ];
}

/** Optimistic mutations applied locally before the server confirms. */
type Mut =
  | { type: "remove"; id: string }
  | { type: "priority"; id: string; priority: Priority }
  | { type: "reschedule"; id: string; date: string | null }
  | { type: "title"; id: string; title: string };

function closeMenu(el: HTMLElement) {
  el.closest("details")?.removeAttribute("open");
}

export function TaskList({
  tasks,
  projects,
  sort,
  group,
  status,
}: {
  tasks: Task[];
  projects: ProjectOption[];
  sort: TaskSort;
  group: TaskGroup;
  status: TaskListStatus;
}) {
  const projectName = useMemo(() => {
    const m = new Map(projects.map((p) => [p.id, p.name]));
    return (id: string | null) => (id ? m.get(id) ?? null : null);
  }, [projects]);

  const [optimistic, applyMut] = useOptimistic(tasks, (state: Task[], m: Mut) => {
    switch (m.type) {
      case "remove":
        return state.filter((t) => t.id !== m.id);
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
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);

  const run = (mut: Mut | null, action: () => Promise<void>) =>
    startTransition(async () => {
      if (mut) applyMut(mut);
      await action();
    });

  const fd = (entries: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(entries)) f.set(k, v);
    return f;
  };

  // ---- single-row actions -------------------------------------------------
  const toggleComplete = (t: Task) => {
    const reopen = t.status !== "open";
    run({ type: "remove", id: t.id }, () =>
      (reopen ? reopenTaskAction : completeTaskAction)(fd({ id: t.id })),
    );
  };

  const setPriority = (id: string, priority: Priority) =>
    run({ type: "priority", id, priority }, () =>
      quickUpdateTaskAction(fd({ id, field: "priority", value: priority })),
    );

  const reschedule = (id: string, value: string) =>
    run({ type: "reschedule", id, date: value || null }, () =>
      quickUpdateTaskAction(fd({ id, field: "scheduled_for", value })),
    );

  const commitTitle = (id: string, title: string) => {
    setEditingId(null);
    const trimmed = title.trim();
    if (!trimmed) return;
    run({ type: "title", id, title: trimmed }, () =>
      quickUpdateTaskAction(fd({ id, field: "title", value: trimmed })),
    );
  };

  // ---- selection / bulk ---------------------------------------------------
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const clearSelection = () => setSelected(new Set());
  const exitSelect = () => {
    setSelectMode(false);
    clearSelection();
  };

  const idsCsv = useMemo(() => [...selected].join(","), [selected]);

  const bulk = (action: () => Promise<void>, removeAll = false) => {
    const ids = [...selected];
    startTransition(async () => {
      if (removeAll) for (const id of ids) applyMut({ type: "remove", id });
      await action();
      clearSelection();
    });
  };

  // ---- sort + group (client-side, instant) --------------------------------
  const sorted = useMemo(() => {
    const arr = [...optimistic];
    arr.sort((a, b) => {
      switch (sort) {
        case "due":
          return dateCmp(a.due_date, b.due_date) || byPriority(a, b);
        case "project":
          return (
            (projectName(a.project_id) ?? "~").localeCompare(
              projectName(b.project_id) ?? "~",
            ) || byPriority(a, b)
          );
        case "created":
          return a.created_at.localeCompare(b.created_at);
        default:
          return byPriority(a, b);
      }
    });
    return arr;
  }, [optimistic, sort, projectName]);

  const groups = useMemo(() => {
    if (group === "flat") return [{ key: "", label: "", tasks: sorted }];

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
      // day + project: empty bucket ("Anytime"/"No project") sorts last
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

  if (optimistic.length === 0) {
    return (
      <div className="card empty">
        <i className="ti ti-checkbox" aria-hidden="true" />
        {status === "open"
          ? "Nothing here — add a task above."
          : `No ${status} tasks.`}
      </div>
    );
  }

  return (
    <div className="tasklist">
      <div className="tasklist-bar">
        <button
          type="button"
          className={selectMode ? "btn-pill go" : "btn-pill"}
          onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
        >
          <i className="ti ti-checklist" aria-hidden="true" />
          {selectMode ? "Done selecting" : "Select"}
        </button>
        <span className="tasklist-count">{optimistic.length} shown</span>
      </div>

      {groups.map((g) => (
        <section key={g.key || "flat"}>
          {g.label ? <p className="day-head">{g.label}</p> : null}
          <ul className="tasks">
            {g.tasks.map((t) => (
              <Row
                key={t.id}
                task={t}
                projectName={projectName(t.project_id)}
                projects={projects}
                selectMode={selectMode}
                selected={selected.has(t.id)}
                editing={editingId === t.id}
                showScheduled={group !== "day"}
                onToggleSelect={() => toggleSelect(t.id)}
                onToggleComplete={() => toggleComplete(t)}
                onSetPriority={(p) => setPriority(t.id, p)}
                onReschedule={(v) => reschedule(t.id, v)}
                onStartEdit={() => setEditingId(t.id)}
                onCommitTitle={(title) => commitTitle(t.id, title)}
                onCancelEdit={() => setEditingId(null)}
              />
            ))}
          </ul>
        </section>
      ))}

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

          <button type="button" className="btn-pill" onClick={clearSelection}>
            Clear
          </button>
        </div>
      ) : null}
    </div>
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

/**
 * Inline title editor. A `handled` guard makes commit/cancel fire exactly once:
 * Enter commits then unmounts (blur won't re-commit), and Escape cancels without
 * the trailing blur saving the value.
 */
function TitleEditor({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (title: string) => void;
  onCancel: () => void;
}) {
  const handled = useRef(false);
  const commit = (value: string) => {
    if (handled.current) return;
    handled.current = true;
    onCommit(value);
  };
  const cancel = () => {
    if (handled.current) return;
    handled.current = true;
    onCancel();
  };

  return (
    <input
      className="tl-edit"
      defaultValue={initial}
      autoFocus
      aria-label="Edit title"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit(e.currentTarget.value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
      onBlur={(e) => commit(e.currentTarget.value)}
    />
  );
}

/** A meta entry rendered as an optional Tabler icon + label. */
function buildMeta(task: Task, showScheduled: boolean) {
  const meta: { icon?: string; label: string }[] = [];
  if (task.recurrence_id) meta.push({ icon: "ti-refresh", label: "recurring" });
  if (showScheduled && task.scheduled_for) {
    meta.push({ icon: "ti-calendar", label: fmtShort(task.scheduled_for) });
  }
  if (task.due_date) {
    meta.push({ icon: "ti-calendar-event", label: `due ${fmtShort(task.due_date)}` });
  }
  if (task.effort) meta.push({ icon: "ti-bolt", label: task.effort });
  if (task.availability === "business_hours") {
    meta.push({ icon: "ti-briefcase", label: "9–5" });
  }
  if (task.status === "waiting" && task.waiting_on) {
    meta.push({ icon: "ti-user", label: `waiting on ${task.waiting_on}` });
  }
  return meta;
}

function Row({
  task,
  projectName,
  projects,
  selectMode,
  selected,
  editing,
  showScheduled,
  onToggleSelect,
  onToggleComplete,
  onSetPriority,
  onReschedule,
  onStartEdit,
  onCommitTitle,
  onCancelEdit,
}: {
  task: Task;
  projectName: string | null;
  projects: ProjectOption[];
  selectMode: boolean;
  selected: boolean;
  editing: boolean;
  showScheduled: boolean;
  onToggleSelect: () => void;
  onToggleComplete: () => void;
  onSetPriority: (p: Priority) => void;
  onReschedule: (value: string) => void;
  onStartEdit: () => void;
  onCommitTitle: (title: string) => void;
  onCancelEdit: () => void;
}) {
  const done = task.status === "done";
  const cancelled = task.status === "cancelled";
  const meta = buildMeta(task, showScheduled);

  return (
    <li className={selected ? "task-item tl-row selected" : "task-item tl-row"}>
      {selectMode ? (
        <input
          type="checkbox"
          className="tl-select"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select ${task.title}`}
        />
      ) : (
        <button
          type="button"
          className={done ? "check checked" : "check"}
          onClick={onToggleComplete}
          title={done ? "Reopen" : "Mark done"}
          aria-label={done ? "Reopen" : "Mark done"}
          disabled={cancelled}
        >
          {done ? "✓" : ""}
        </button>
      )}

      {/* priority chip doubles as a priority menu */}
      <details className="fdrop tl-prio">
        <summary
          className={`chip chip-${task.priority}${done || cancelled ? " chip-dim" : ""}`}
          title="Change priority"
        >
          {task.priority}
        </summary>
        <div className="fmenu">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              className={p === task.priority ? "fmenu-item on" : "fmenu-item"}
              onClick={(e) => {
                closeMenu(e.currentTarget);
                onSetPriority(p);
              }}
            >
              Priority {p}
            </button>
          ))}
        </div>
      </details>

      <div className="task-body">
        {editing ? (
          <TitleEditor
            initial={task.title}
            onCommit={onCommitTitle}
            onCancel={onCancelEdit}
          />
        ) : (
          <>
            <button
              type="button"
              className={`task-title tl-title${done || cancelled ? " done" : ""}`}
              onClick={onStartEdit}
              title="Click to edit"
            >
              {task.title}
            </button>
            {projectName || meta.length > 0 ? (
              <div className="task-meta">
                {projectName ? <span className="tag">{projectName}</span> : null}
                {meta.map((m, i) => (
                  <span key={i}>
                    {m.icon ? <i className={`ti ${m.icon}`} aria-hidden="true" /> : null}
                    {m.label}
                  </span>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* trailing quick-actions (appear on hover/focus) */}
      <div className="tl-actions">
        <details className="fdrop fdrop-right">
          <summary className="tl-act" title="Reschedule" aria-label="Reschedule">
            <i className="ti ti-calendar" aria-hidden="true" />
          </summary>
          <div className="fmenu">
            {rescheduleChoices().map((c) => (
              <button
                key={c.label}
                type="button"
                className="fmenu-item"
                onClick={(e) => {
                  closeMenu(e.currentTarget);
                  onReschedule(c.value);
                }}
              >
                {c.label}
              </button>
            ))}
            <label className="fmenu-item fmenu-pick">
              <i className="ti ti-calendar-plus" aria-hidden="true" />
              Pick…
              <input
                type="date"
                onChange={(e) => {
                  closeMenu(e.currentTarget);
                  onReschedule(e.target.value);
                }}
              />
            </label>
          </div>
        </details>
        <Link href={`/tasks/${task.id}`} className="tl-act" title="Open" aria-label="Open task">
          <i className="ti ti-arrow-up-right" aria-hidden="true" />
        </Link>
      </div>
    </li>
  );
}
