"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { moveRecordStageAction } from "./actions";
import { AddRecordCard } from "./add-record-card";
import { UndoToast, useUndoToast } from "../undo-toast";

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
 * Move a card by dragging it (mouse) or via its per-card stage dropdown — the
 * dropdown is the touch fallback and the keyboard-accessible path (visually
 * out of the way on a fine pointer until focused). Moves are optimistic and
 * revert + toast on failure. Records whose stage is null or no longer in the
 * pipeline land in a trailing "Unsorted" column so nothing is ever hidden.
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
  const [, startTransition] = useTransition();

  // optimistic copy of the records; re-synced to server truth after revalidation
  const [items, setItems] = useState<BoardRecord[]>(records);
  useEffect(() => setItems(records), [records]);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const undo = useUndoToast();

  // touch devices can't HTML5-drag — turn drag off so it doesn't fight
  // scrolling; the per-card dropdown becomes the move mechanism instead
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    setCoarse(mq.matches);
    const onChange = () => setCoarse(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

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

  /**
   * Optimistically move a record to a stage, persist, revert + toast on fail.
   * On success, offer an undo back to the previous stage (only when that stage
   * is a real pipeline stage — a record can't be dropped back into Unsorted).
   */
  function move(id: string, toStage: string) {
    const current = items.find((r) => r.id === id);
    if (!current || current.stage === toStage) return;
    const fromStage = current.stage;
    setItems((prev) =>
      prev.map((r) => (r.id === id ? { ...r, stage: toStage } : r)),
    );
    startTransition(async () => {
      const res = await moveRecordStageAction(id, toStage);
      if (!res.ok) {
        // revert only this record, so a sibling's pending move isn't clobbered
        setItems((prev) =>
          prev.map((r) => (r.id === id ? { ...r, stage: fromStage } : r)),
        );
        undo.show({ msg: res.error ?? "Couldn't move." });
        return;
      }
      undo.show({
        msg: `Moved to ${toStage}`,
        undo:
          fromStage && known.has(fromStage)
            ? () => move(id, fromStage)
            : undefined,
      });
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
                  : // entering the non-droppable column clears a stale highlight
                    () => setOverStage(null)
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
                  const inStage = !!(r.stage && known.has(r.stage));
                  return (
                    <div
                      key={r.id}
                      className={`rcard${draggingId === r.id ? " dragging" : ""}`}
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
                    >
                      {/* stretched link: the whole card opens the record */}
                      <Link
                        href={`/records/${r.id}`}
                        className="rcard-name"
                        draggable={false}
                      >
                        {r.name}
                      </Link>

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

                      {/* move control: touch fallback + keyboard path (CSS keeps
                          it out of the way on a fine pointer until focused) */}
                      <select
                        className="rcard-move select select-sm"
                        aria-label={`Move ${r.name} to stage`}
                        value={inStage ? (r.stage as string) : ""}
                        onChange={(e) => {
                          if (e.target.value) move(r.id, e.target.value);
                        }}
                      >
                        {inStage ? null : (
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

      <UndoToast toast={undo.toast} onClear={undo.clear} />
    </>
  );
}
