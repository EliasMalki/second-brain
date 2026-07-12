"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { completeTaskAction } from "./tasks/actions";
import { DonePill, RowUndo } from "./done-pill";
import { useRowCompletion } from "./use-row-completion";
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
 * block, and the agenda timeline of today's items. The row opens the task; the
 * Done pill completes it with an inline grace-period undo (no toast).
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
  const router = useRouter();
  const [offset, setOffset] = useState(RING_C);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();
  const completing = useRowCompletion();

  const run = (id: string, action: (f: FormData) => Promise<void>) =>
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      await action(fd);
    });

  const open = (id: string) => router.push(`/tasks?task=${id}`);
  const complete = (id: string) =>
    completing.complete(id, {
      completeAction: () => run(id, completeTaskAction),
      // the brief keeps done items (struck, settled), it doesn't remove them
      onRemove: () => setCompleted((prev) => new Set(prev).add(id)),
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

  return (
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
            const phase = completing.phaseOf(a.id);
            const grace = phase === "grace";
            const settledDone = a.done || completed.has(a.id);
            const struck = settledDone || !!phase;
            const pillPhase = phase
              ? phase === "confirm"
                ? "confirm"
                : "done"
              : settledDone
                ? "done"
                : "idle";
            return (
              <div
                key={a.id}
                className={struck ? "h-ag dp-row done" : "h-ag dp-row"}
                style={projectColorVars(a.projectColor)}
                role="button"
                tabIndex={0}
                onClick={() => open(a.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    open(a.id);
                  }
                }}
              >
                <div className="tcol">
                  <div className="d">{a.time}</div>
                  <div className="t2">{struck ? "done" : a.sub}</div>
                </div>
                <div className="body">
                  <span className="node" aria-hidden="true" />
                  {!struck ? (
                    <span className={`h2chip ${a.priority}`}>{a.priority}</span>
                  ) : null}
                  <span className="btitle">{a.title}</span>
                  {a.projectName && !grace ? (
                    <span className="bwhen">{a.projectName}</span>
                  ) : null}
                  {grace ? <RowUndo onUndo={() => completing.undo(a.id)} /> : null}
                  <DonePill
                    phase={pillPhase}
                    onComplete={() => complete(a.id)}
                    ariaLabel={`Complete “${a.title}”`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
