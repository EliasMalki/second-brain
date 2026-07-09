"use client";

import { useMemo, useState, useTransition } from "react";
import { completeTaskAction, reopenTaskAction } from "./tasks/actions";
import { UndoToast, useUndoToast } from "./undo-toast";

export type FitItem = {
  id: string;
  title: string;
  priority: "A" | "B" | "C" | "D";
  projectName: string | null;
  projectColor: string | null;
  effort: "quick" | "deep" | null;
  overdue: boolean;
};

type Win = "20" | "60" | "deep";
const PRIO: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

const WINDOWS: { key: Win; label: string; long: string }[] = [
  { key: "20", label: "20 min", long: "20 minutes" },
  { key: "60", label: "1 hour", long: "1 hour" },
  { key: "deep", label: "Deep work", long: "deep work" },
];

/** Does an item fit the chosen window? */
function fits(item: FitItem, win: Win): boolean {
  if (win === "deep") return item.effort === "deep";
  if (win === "20") return item.effort === "quick";
  return item.effort !== "deep"; // 1 hour: quick or unspecified
}
/** Rank: overdue first, then priority, then quick wins. */
function rank(a: FitItem, b: FitItem): number {
  return (
    Number(b.overdue) - Number(a.overdue) ||
    PRIO[a.priority] - PRIO[b.priority] ||
    Number(b.effort === "quick") - Number(a.effort === "quick")
  );
}
function duration(item: FitItem): string {
  return item.effort === "quick" ? "~15 min" : item.effort === "deep" ? "~2 hrs" : "~40 min";
}
function why(item: FitItem): string {
  if (item.overdue) return "Overdue · clear it first";
  if (item.effort === "quick") return "Quick win · momentum";
  if (item.priority === "A") return "Highest priority right now";
  if (item.effort === "deep") return "Needs unbroken focus";
  return "A good fit for the time you have";
}

/**
 * "Got time?" — pick a window and get the single best-fit task plus a short
 * queue of others that fit. Complete straight from the queue. Selection is
 * client-side (instant); completion persists via the server action.
 */
export function GotTime({ items }: { items: FitItem[] }) {
  const [win, setWin] = useState<Win>("20");
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();
  const undo = useUndoToast();

  const setDone = (id: string, on: boolean) =>
    setDoneIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const run = (id: string, action: (f: FormData) => Promise<void>) =>
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      await action(fd);
    });

  const pool = useMemo(
    () => items.filter((i) => !doneIds.has(i.id)),
    [items, doneIds],
  );
  const { ordered, hasFit } = useMemo(() => {
    const eligible = pool.filter((i) => fits(i, win));
    const base = (eligible.length > 0 ? eligible : pool).slice();
    return { ordered: base.sort(rank), hasFit: eligible.length > 0 };
  }, [pool, win]);

  const best = ordered[0] ?? null;
  const queue = ordered.slice(1, 4);
  const winMeta = WINDOWS.find((w) => w.key === win)!;

  const complete = (id: string, title: string) => {
    setDone(id, true);
    run(id, completeTaskAction);
    undo.show({
      msg: `Completed “${title}”`,
      undo: () => {
        setDone(id, false);
        run(id, reopenTaskAction);
      },
    });
  };

  return (
    <>
    <div className="h-card">
      <div className="h-card-h">
        <span className="ttl">
          <i className="ti ti-hourglass-high" aria-hidden="true" /> Got time?
        </span>
      </div>

      <div className="h-seg" role="group" aria-label="How much time do you have?">
        {WINDOWS.map((w) => (
          <button
            key={w.key}
            type="button"
            className={win === w.key ? "on" : undefined}
            aria-pressed={win === w.key}
            onClick={() => setWin(w.key)}
          >
            {w.label}
          </button>
        ))}
      </div>

      {best ? (
        <>
          <p className="h-fit-l">
            {hasFit
              ? `Best fit for ${winMeta.long}`
              : `Nothing fits ${winMeta.long} — top task:`}
          </p>
          <div className="h-focus-task">
            <div className="ftop">
              <span className={`h2chip ${best.priority}`}>{best.priority}</span>
              <span
                className="h2tag"
                style={best.projectColor ? ({ "--proj": best.projectColor } as React.CSSProperties) : undefined}
              >
                <span className="pd" />
                {best.projectName ?? "No project"}
              </span>
              <span className="fmeta">{duration(best)}</span>
            </div>
            <div className="ftitle">{best.title}</div>
            <div className="fwhy">
              <i className="ti ti-sparkles" aria-hidden="true" />
              <span>{why(best)}</span>
            </div>
          </div>

          <div className="h-queue">
            <p className="h-queue-l">Also fits</p>
            {queue.length === 0 ? (
              <p className="h-queue-empty">Nothing else that size right now.</p>
            ) : (
              queue.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  className="h-q2"
                  style={q.projectColor ? ({ "--proj": q.projectColor } as React.CSSProperties) : undefined}
                  onClick={() => complete(q.id, q.title)}
                  aria-label={`Mark "${q.title}" done`}
                >
                  <span className="qchk" aria-hidden="true" />
                  <div className="qbody">
                    <div className="qttl">{q.title}</div>
                    <div className="qsub">
                      <span className={`h2chip ${q.priority}`}>{q.priority}</span>
                      <span className="qproj">
                        <span className="pd" />
                        {q.projectName ?? "No project"}
                      </span>
                    </div>
                  </div>
                  <span className="qdur">{duration(q)}</span>
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        <p className="h-queue-empty">Nothing on deck right now — you&rsquo;re clear.</p>
      )}
    </div>
    <UndoToast toast={undo.toast} onClear={undo.clear} />
    </>
  );
}
