"use client";

import { useMemo } from "react";
import { whenCell, type Section } from "./bucket";
import { projectColorVars } from "@/lib/colors";
import { todayISO } from "@/lib/dates";
import type { Priority, Task } from "@/lib/db/tasks";

type ProjectOption = { id: string; name: string; color?: string | null };

/** Focus the quick-add input (the "+ Add to Today" ghost card). */
function focusQuickAdd() {
  document
    .querySelector<HTMLInputElement>(".add-bar--cmd .add-input")
    ?.focus();
}

/**
 * Grid view (command-center): the same time-buckets as the List, but each is a
 * full-width band of cards (NOT kanban columns). Card click opens the detail
 * panel; the "Done" pill completes (optimistic, hover-green).
 */
export function TaskGrid({
  sections,
  projects,
  selectedId,
  onSelect,
  onCheck,
}: {
  sections: Section[];
  projects: ProjectOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCheck: (task: Task) => void;
}) {
  const today = todayISO();
  const project = useMemo(() => {
    const m = new Map(projects.map((p) => [p.id, p]));
    return (id: string | null) => (id ? m.get(id) ?? null : null);
  }, [projects]);

  return (
    <div className="t-board">
      {sections.map((s) => (
        <section key={s.key} className="t-rowgroup" data-bucket={s.key}>
          <div className={`t-group-h${s.over ? " over" : ""}`}>
            <span className="lbl">{s.label}</span>
            <span className="ct">{s.tasks.length}</span>
            <span className="line" />
          </div>
          <div className="t-rowcards">
            {s.tasks.map((t) => (
              <Card
                key={t.id}
                task={t}
                proj={project(t.project_id)}
                today={today}
                selected={t.id === selectedId}
                onSelect={() => onSelect(t.id)}
                onCheck={() => onCheck(t)}
              />
            ))}
            {s.key === "today" ? (
              <button type="button" className="t-addcard" onClick={focusQuickAdd}>
                <i className="ti ti-plus" aria-hidden="true" /> Add to Today
              </button>
            ) : null}
          </div>
        </section>
      ))}
    </div>
  );
}

function Card({
  task,
  proj,
  today,
  selected,
  onSelect,
  onCheck,
}: {
  task: Task;
  proj: ProjectOption | null;
  today: string;
  selected: boolean;
  onSelect: () => void;
  onCheck: () => void;
}) {
  const done = task.status === "done" || task.status === "cancelled";
  const when = whenCell(task, today);
  const prio = task.priority as Priority;
  const edge = proj ? projectColorVars(proj.color) : undefined;
  const cls = ["t-card", edge ? "edged" : "", done ? "done" : "", selected ? "sel" : ""]
    .filter(Boolean)
    .join(" ");
  const showWhen = when.text !== "—" && when.text !== "";

  return (
    <div
      className={cls}
      style={edge}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="t-card-top">
        <span className="h2tag" style={edge}>
          <span className="pd" />
          {proj ? proj.name : "No project"}
        </span>
        <i className="ti ti-grip-vertical handle" aria-hidden="true" />
      </div>
      <div className="t-card-mid">
        <span className={`h2chip ${prio}`}>{prio}</span>
        <div className={done ? "t-card-ttl done" : "t-card-ttl"}>{task.title}</div>
      </div>
      <div className="t-card-foot">
        {showWhen ? (
          <span className={when.over ? "over" : undefined}>
            {when.icon ? <i className={`ti ${when.icon}`} aria-hidden="true" /> : null}
            {when.text}
          </span>
        ) : null}
        <button
          type="button"
          className={done ? "t-ckpill on" : "t-ckpill"}
          onClick={(e) => {
            e.stopPropagation();
            onCheck();
          }}
          title={done ? "Reopen" : "Mark done"}
          aria-label={done ? "Reopen" : "Mark done"}
        >
          <i className="ti ti-check" aria-hidden="true" />
          Done
        </button>
      </div>
    </div>
  );
}
