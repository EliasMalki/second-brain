"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveRecordStageAction } from "./actions";
import { AddRecordCard } from "./add-record-card";

export type BoardRecord = {
  id: string;
  name: string;
  stage: string | null;
};

const UNSORTED = "__unsorted__";

/** Quiet, project-tinted stage dot: greyer early, closest to --proj at the end. */
function stageDot(index: number, total: number): string {
  const pct = total <= 1 ? 70 : Math.round(35 + (index / (total - 1)) * 60);
  return `color-mix(in srgb, var(--proj) ${pct}%, var(--color-text-tertiary))`;
}

/** Headline P&L: "+$2,100", no cents. Only shown when positive. */
function formatPnl(amount: number): string {
  return `+${new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

/**
 * Records board / Kanban (§5, v1). One column per record_type stage, records
 * as cards in their current stage. Reads as the §10 list's alternate view.
 *
 * Drag a card to another column to change its stage — optimistic, reverts +
 * toasts on failure. Records whose stage is null or no longer in the pipeline
 * land in a trailing "Unsorted" column so nothing is ever hidden.
 */
export function RecordsBoard({
  projectId,
  labelSingular,
  stages,
  records,
  pnl,
  openTasks,
  receipts,
}: {
  projectId: string;
  labelSingular: string;
  stages: string[];
  records: BoardRecord[];
  pnl: Record<string, number>;
  openTasks: Record<string, number>;
  receipts: Record<string, number>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // optimistic copy of the records; re-synced to server truth after revalidation
  const [items, setItems] = useState<BoardRecord[]>(records);
  useEffect(() => setItems(records), [records]);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // touch devices can't HTML5-drag — degrade to a per-card "move to stage"
  // dropdown and turn drag off so it doesn't fight scrolling
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    setCoarse(mq.matches);
    const onChange = () => setCoarse(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const lastStage = stages.length > 0 ? stages[stages.length - 1] : null;
  const known = new Set(stages);
  const byStage = new Map<string, BoardRecord[]>(stages.map((s) => [s, []]));
  const orphans: BoardRecord[] = [];
  for (const r of items) {
    if (r.stage && known.has(r.stage)) byStage.get(r.stage)!.push(r);
    else orphans.push(r);
  }

  const columns: { key: string; label: string; dot: string | null; items: BoardRecord[] }[] =
    stages.map((s, i) => ({
      key: s,
      label: s,
      dot: stageDot(i, stages.length),
      items: byStage.get(s)!,
    }));
  if (orphans.length > 0) {
    columns.push({ key: UNSORTED, label: "Unsorted", dot: null, items: orphans });
  }

  function open(id: string) {
    router.push(`/records/${id}`);
  }

  /** Optimistically move a record to a stage, persist, revert + toast on fail. */
  function move(id: string, toStage: string) {
    const current = items.find((r) => r.id === id);
    if (!current || current.stage === toStage) return;
    const snapshot = items;
    setItems((prev) =>
      prev.map((r) => (r.id === id ? { ...r, stage: toStage } : r)),
    );
    startTransition(async () => {
      const res = await moveRecordStageAction(id, toStage);
      if (!res.ok) {
        setItems(snapshot);
        setToast(res.error ?? "Couldn't move.");
      }
    });
  }

  return (
    <>
      <div className="board" role="list">
        {columns.map((col) => {
          const droppable = col.key !== UNSORTED;
          return (
            <div
              key={col.key}
              className={`bcol${overStage === col.key && droppable ? " is-over" : ""}`}
              role="listitem"
              onDragOver={
                droppable
                  ? (e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setOverStage(col.key);
                    }
                  : undefined
              }
              onDrop={
                droppable
                  ? (e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/plain");
                      setOverStage(null);
                      if (id) move(id, col.key);
                    }
                  : undefined
              }
            >
              <div className="bcol-head">
                {col.dot ? (
                  <span
                    className="stagedot"
                    style={{ background: col.dot }}
                    aria-hidden="true"
                  />
                ) : (
                  <span className="stagedot stagedot-muted" aria-hidden="true" />
                )}
                <span className="bcol-name">{col.label}</span>
                <span className="n">{col.items.length}</span>
              </div>

              <div className="bcol-cards">
                {col.items.map((r) => {
                  const total = pnl[r.id] ?? 0;
                  const tasks = openTasks[r.id] ?? 0;
                  const rcount = receipts[r.id] ?? 0;
                  const sold = r.stage === lastStage;
                  return (
                    <div
                      key={r.id}
                      className={`rcard${draggingId === r.id ? " dragging" : ""}`}
                      role="link"
                      tabIndex={0}
                      draggable={!coarse}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", r.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDraggingId(r.id);
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setOverStage(null);
                      }}
                      onClick={() => open(r.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          open(r.id);
                        }
                      }}
                    >
                      <span className="rcard-name">{r.name}</span>

                      {total > 0 ? (
                        <span className="rcard-pnl">
                          {formatPnl(total)}
                          {sold ? (
                            <span className="rcard-pnl-tag"> final</span>
                          ) : null}
                        </span>
                      ) : null}

                      {tasks > 0 || rcount > 0 ? (
                        <div className="rcard-meta">
                          {tasks > 0 ? (
                            <span
                              className="ic"
                              title={`${tasks} open task${tasks === 1 ? "" : "s"}`}
                            >
                              <i className="ti ti-checkbox" aria-hidden="true" />
                              {tasks}
                            </span>
                          ) : null}
                          {rcount > 0 ? (
                            <span
                              className="ic"
                              title={`${rcount} receipt${rcount === 1 ? "" : "s"}`}
                            >
                              <i className="ti ti-receipt" aria-hidden="true" />
                              {rcount}
                            </span>
                          ) : null}
                        </div>
                      ) : null}

                      {coarse ? (
                        <select
                          className="rcard-move select select-sm"
                          aria-label="Move to stage"
                          value={
                            r.stage && known.has(r.stage) ? r.stage : ""
                          }
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            if (e.target.value) move(r.id, e.target.value);
                          }}
                        >
                          {r.stage && known.has(r.stage) ? null : (
                            <option value="" disabled>
                              Move to…
                            </option>
                          )}
                          {stages.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {droppable ? (
                <AddRecordCard
                  projectId={projectId}
                  labelSingular={labelSingular}
                  stage={col.key}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {toast ? (
        <div className="capture-toast err" role="status">
          <i className="ti ti-alert-triangle" aria-hidden="true" />
          <span className="capture-toast-text">{toast}</span>
          <button
            type="button"
            className="capture-toast-x"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
          >
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </>
  );
}
