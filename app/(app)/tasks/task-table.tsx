"use client";

import { useMemo } from "react";
import { groupForSort, type TaskSort, type TaskView } from "./params";
import { isOverdue, overdueDate } from "./overdue";
import { addDaysISO, fmtDayLabel, fmtLate, fmtShort, todayISO } from "@/lib/dates";
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
/** The "When" cell: lateness (danger) for overdue, else a compact relative date. */
export function whenCell(task: Task, today: string): { text: string; over: boolean } {
  if (isOverdue(task, today)) {
    const d = overdueDate(task);
    return { text: d ? fmtLate(d, today) : "late", over: true };
  }
  const s = task.scheduled_for;
  if (s) {
    if (s === today) return { text: "Today", over: false };
    if (s === addDaysISO(today, 1)) return { text: "Tomorrow", over: false };
    return { text: fmtShort(s), over: false };
  }
  if (task.due_date) return { text: `due ${fmtShort(task.due_date)}`, over: false };
  return { text: "—", over: false };
}

type Section = {
  key: string;
  label: string;
  kind: "over" | "unfiled" | "filed";
  tasks: Task[];
};

/**
 * The task table (mockup v4). Column grid — priority chip · title · project ·
 * when. Overdue is pinned at the very top (lateness in danger); Unfiled next
 * (one-tap File); then filed tasks grouped by the active sort. Completed view
 * skips the pins. Row click selects + opens the panel; in select mode the row
 * toggles its bulk checkbox.
 */
export function TaskTable({
  tasks,
  projects,
  sort,
  view,
  selectedId,
  selectMode,
  selectedSet,
  onSelect,
  onToggleBulk,
  onFile,
}: {
  tasks: Task[];
  projects: ProjectOption[];
  sort: TaskSort;
  view: TaskView;
  selectedId: string | null;
  selectMode: boolean;
  selectedSet: Set<string>;
  onSelect: (id: string) => void;
  onToggleBulk: (id: string) => void;
  onFile: (id: string, projectId: string) => void;
}) {
  const today = todayISO();
  const projectName = useMemo(() => {
    const m = new Map(projects.map((p) => [p.id, p.name]));
    return (id: string | null) => (id ? m.get(id) ?? null : null);
  }, [projects]);

  const group = groupForSort(sort);

  const sections = useMemo<Section[]>(() => {
    const cmp = (a: Task, b: Task) => {
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
    };

    const pinless = view === "completed";
    const over = pinless ? [] : tasks.filter((t) => isOverdue(t, today));
    const overIds = new Set(over.map((t) => t.id));
    const rest = tasks.filter((t) => !overIds.has(t.id));
    const unfiled = pinless ? [] : rest.filter((t) => t.project_id === null);
    const unfiledIds = new Set(unfiled.map((t) => t.id));
    const filed = rest.filter((t) => !unfiledIds.has(t.id));

    const out: Section[] = [];
    if (over.length > 0) {
      out.push({
        key: "__over",
        label: `Overdue · ${over.length}`,
        kind: "over",
        tasks: [...over].sort(
          (a, b) => dateCmp(overdueDate(a), overdueDate(b)) || byPriority(a, b),
        ),
      });
    }
    if (unfiled.length > 0) {
      out.push({
        key: "__unfiled",
        label: `Unfiled · ${unfiled.length} — needs a project`,
        kind: "unfiled",
        tasks: [...unfiled].sort(cmp),
      });
    }

    const sortedFiled = [...filed].sort(cmp);
    if (group === "flat") {
      if (sortedFiled.length > 0) {
        out.push({ key: "flat", label: "Tasks", kind: "filed", tasks: sortedFiled });
      }
      return out;
    }

    const map = new Map<string, Task[]>();
    for (const t of sortedFiled) {
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
    for (const key of keys) {
      out.push({
        key,
        label: `${labelFor(key)} · ${map.get(key)!.length}`,
        kind: "filed",
        tasks: map.get(key)!,
      });
    }
    return out;
  }, [tasks, sort, group, view, today, projectName]);

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
              : view === "overdue"
                ? "Nothing overdue — nice."
                : "Nothing here — add a task above."}
        </div>
      </div>
    );
  }

  return (
    <div className="list">
      <TableHeader />
      {sections.map((s) => (
        <div key={s.key}>
          <div
            className={`grp${s.kind === "over" ? " over" : s.kind === "unfiled" ? " unfiled" : ""}`}
          >
            {s.label}
          </div>
          {s.tasks.map((t) => (
            <TaskRowCells
              key={t.id}
              task={t}
              projects={projects}
              projectName={projectName(t.project_id)}
              today={today}
              unfiled={s.kind === "unfiled"}
              selected={t.id === selectedId}
              selectMode={selectMode}
              checked={selectedSet.has(t.id)}
              onSelect={() => onSelect(t.id)}
              onToggleBulk={() => onToggleBulk(t.id)}
              onFile={onFile}
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

function TaskRowCells({
  task,
  projects,
  projectName,
  today,
  unfiled,
  selected,
  selectMode,
  checked,
  onSelect,
  onToggleBulk,
  onFile,
}: {
  task: Task;
  projects: ProjectOption[];
  projectName: string | null;
  today: string;
  unfiled: boolean;
  selected: boolean;
  selectMode: boolean;
  checked: boolean;
  onSelect: () => void;
  onToggleBulk: () => void;
  onFile: (id: string, projectId: string) => void;
}) {
  const when = whenCell(task, today);
  const done = task.status === "done" || task.status === "cancelled";
  const prio = task.priority as Priority;
  const rowClick = selectMode ? onToggleBulk : onSelect;

  return (
    <div
      className={selected ? "row sel" : "row"}
      role="button"
      tabIndex={0}
      onClick={rowClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          rowClick();
        }
      }}
    >
      {selectMode ? (
        <input
          type="checkbox"
          className="row-check"
          checked={checked}
          onChange={onToggleBulk}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${task.title}`}
        />
      ) : (
        <span className={`chip chip-${prio}${done ? " chip-dim" : ""}`}>{prio}</span>
      )}

      <span className={`rt${done ? " rt-done" : ""}`}>{task.title}</span>

      <span className="rcell">
        {unfiled ? (
          // Native <select> overlay: its option list renders in the browser's
          // top layer, so it can't be clipped by the list's overflow:hidden
          // (which silently swallowed the old popover's clicks). One-tap filing.
          <label className="file" onClick={(e) => e.stopPropagation()}>
            <i className="ti ti-folder-plus" aria-hidden="true" />
            File
            <select
              className="file-select"
              defaultValue=""
              aria-label={`File "${task.title}" into a project`}
              disabled={projects.length === 0}
              onChange={(e) => {
                if (e.target.value) onFile(task.id, e.target.value);
              }}
            >
              <option value="" disabled>
                File to…
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : projectName ? (
          <span className="tag">{projectName}</span>
        ) : null}
      </span>

      <span className={`when${when.over ? " over" : ""}`}>{when.text}</span>
    </div>
  );
}
