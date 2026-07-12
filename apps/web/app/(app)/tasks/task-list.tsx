"use client";

import { Fragment, useMemo } from "react";
import { whenCell, type Section } from "./bucket";
import { DonePill, RowUndo } from "../done-pill";
import type { CompletionPhase } from "../use-row-completion";
import { projectColorVars } from "@/lib/colors";
import { todayISO } from "@/lib/dates";
import type { Priority, Task } from "@/lib/db/tasks";

type ProjectOption = { id: string; name: string; color?: string | null };

/**
 * List view (command-center): the shared time-buckets rendered as hairline row
 * cards. The Done pill completes (with an inline grace-period undo), the rest of
 * the row opens the detail panel. Project color shows as a 3px left edge.
 */
export function TaskList({
  sections,
  projects,
  selectedId,
  onSelect,
  onCheck,
  phaseOf,
  onUndo,
}: {
  sections: Section[];
  projects: ProjectOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCheck: (task: Task) => void;
  phaseOf: (id: string) => CompletionPhase | undefined;
  onUndo: (id: string) => void;
}) {
  const today = todayISO();
  const project = useMemo(() => {
    const m = new Map(projects.map((p) => [p.id, p]));
    return (id: string | null) => (id ? m.get(id) ?? null : null);
  }, [projects]);

  return (
    <div className="t-list">
      {sections.map((s) => (
        <section key={s.key} data-bucket={s.key}>
          <div className={`t-group-h${s.over ? " over" : ""}`}>
            <span className="lbl">{s.label}</span>
            <span className="ct">{s.tasks.length}</span>
            <span className="line" />
          </div>
          <div className="t-rows">
            {s.tasks.map((t) => (
              <Fragment key={t.id}>
                <Row
                  task={t}
                  proj={project(t.project_id)}
                  today={today}
                  selected={t.id === selectedId}
                  phase={phaseOf(t.id)}
                  onSelect={() => onSelect(t.id)}
                  onCheck={() => onCheck(t)}
                  onUndo={() => onUndo(t.id)}
                />
              </Fragment>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Row({
  task,
  proj,
  today,
  selected,
  phase,
  onSelect,
  onCheck,
  onUndo,
}: {
  task: Task;
  proj: ProjectOption | null;
  today: string;
  selected: boolean;
  phase: CompletionPhase | undefined;
  onSelect: () => void;
  onCheck: () => void;
  onUndo: () => void;
}) {
  const doneStatus = task.status === "done" || task.status === "cancelled";
  const grace = phase === "grace";
  const struck = doneStatus || !!phase;
  const when = whenCell(task, today);
  const prio = task.priority as Priority;
  const edge = proj ? projectColorVars(proj.color) : undefined;
  const cls = ["t-row", "dp-row", edge ? "edged" : "", selected ? "sel" : ""]
    .filter(Boolean)
    .join(" ");

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
      {doneStatus ? (
        <button
          type="button"
          className="t-check done"
          onClick={(e) => {
            e.stopPropagation();
            onCheck();
          }}
          title="Reopen"
          aria-label="Reopen"
        >
          <i className="ti ti-check" aria-hidden="true" />
        </button>
      ) : (
        <DonePill
          phase={phase ? (phase === "confirm" ? "confirm" : "done") : "idle"}
          onComplete={onCheck}
          ariaLabel={`Complete “${task.title}”`}
        />
      )}

      {!struck ? <span className={`h2chip ${prio}`}>{prio}</span> : null}

      <span className={struck ? "t-ttl done" : "t-ttl"}>{task.title}</span>

      {grace ? (
        <RowUndo onUndo={onUndo} />
      ) : (
        <span className="t-rmeta">
          <span className="h2tag" style={edge}>
            <span className="pd" />
            {proj ? proj.name : "No project"}
          </span>
          <span className={when.over ? "t-when over" : "t-when"}>{when.text}</span>
        </span>
      )}
    </div>
  );
}
