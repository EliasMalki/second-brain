"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { completeTaskAction, reopenTaskAction } from "./tasks/actions";
import { UndoToast, useUndoToast } from "./undo-toast";
import { projectColorVars } from "@/lib/colors";

export type AgendaItem = {
  id: string;
  title: string;
  priority: "A" | "B" | "C" | "D";
  projectName: string | null;
  projectColor: string | null;
  time: string;
  sub: string;
  done: boolean;
};

const RING_C = 232.5; // 2π·37, matches the SVG stroke-dasharray

/**
 * Daily brief card: a progress ring (share of today's work done), a short copy
 * block, and the agenda timeline of today's items. Clicking an open row marks it
 * done (optimistic strike + ring/parent refresh via the server action).
 */
export function HomeBrief({
  pct,
  headline,
  summary,
  momentum,
  agenda,
}: {
  pct: number;
  headline: string;
  summary: string;
  momentum: string | null;
  agenda: AgendaItem[];
}) {
  const [offset, setOffset] = useState(RING_C);
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

  // Animate the ring from empty to its target once mounted (CSS transitions the
  // stroke-dashoffset).
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      setOffset(RING_C * (1 - Math.max(0, Math.min(1, pct)))),
    );
    return () => cancelAnimationFrame(id);
  }, [pct]);

  const pctLabel = `${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%`;

  const complete = (id: string, title: string) => {
    if (doneIds.has(id)) return;
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
          <i className="ti ti-sun-high" aria-hidden="true" /> Daily brief
        </span>
        <Link href="/tasks?view=today" className="more">
          Full brief <i className="ti ti-chevron-right" aria-hidden="true" />
        </Link>
      </div>

      <div className="h-brief-top">
        <div className="h-ring">
          <svg width="86" height="86" viewBox="0 0 86 86" aria-hidden="true">
            <circle className="rtrack" cx="43" cy="43" r="37" fill="none" strokeWidth="7" />
            <circle
              className="rfill"
              cx="43"
              cy="43"
              r="37"
              fill="none"
              strokeWidth="7"
              strokeDasharray={RING_C}
              strokeDashoffset={offset}
            />
          </svg>
          <div className="rlabel">
            <b>{pctLabel}</b>
            <span>done</span>
          </div>
        </div>
        <div className="h-brief-copy">
          <h3>{headline}</h3>
          <p>{summary}</p>
          {momentum ? (
            <span className="momentum">
              <i className="ti ti-trending-up" aria-hidden="true" /> {momentum}
            </span>
          ) : null}
        </div>
      </div>

      {agenda.length === 0 ? (
        <div className="h-agenda-empty">Nothing scheduled for today — enjoy the space.</div>
      ) : (
        <div className="h-agenda">
          {agenda.map((a) => {
            const done = a.done || doneIds.has(a.id);
            return (
              <button
                key={a.id}
                type="button"
                className={done ? "h-ag done" : "h-ag"}
                style={projectColorVars(a.projectColor)}
                onClick={() => complete(a.id, a.title)}
                disabled={done}
                aria-label={done ? `${a.title} (done)` : `Mark "${a.title}" done`}
              >
                <div className="tcol">
                  <div className="d">{a.time}</div>
                  <div className="t2">{done ? "done" : a.sub}</div>
                </div>
                <div className="body">
                  <span className="node" aria-hidden="true" />
                  {!done ? <span className={`h2chip ${a.priority}`}>{a.priority}</span> : null}
                  <span className="btitle">{a.title}</span>
                  {a.projectName ? <span className="bwhen">{a.projectName}</span> : null}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
    <UndoToast toast={undo.toast} onClear={undo.clear} />
    </>
  );
}
