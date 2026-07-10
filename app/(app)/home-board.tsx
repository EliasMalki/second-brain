"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { completeTaskAction } from "./tasks/actions";
import { DonePill, RowUndo } from "./done-pill";
import { useRowCompletion } from "./use-row-completion";
import { projectColorVars } from "@/lib/colors";

export type BoardWhen = { text: string; over: boolean; icon: string | null };
export type BoardCardData = {
  id: string;
  title: string;
  priority: "A" | "B" | "C" | "D";
  projectName: string | null;
  projectColor: string | null;
  when: BoardWhen | null;
};
export type BoardColumn = {
  key: string;
  name: string;
  dot: string; // CSS color for the header dot
  count: number;
  cards: BoardCardData[];
  footer: { label: string; href: string; icon: string } | null;
};

/**
 * "Your board" — Now / This week / Backlog as accent-band cards. The card (or
 * its expand button) opens the task in the Tasks panel; the Done pill completes
 * it with an inline grace-period undo (no toast) — see useRowCompletion.
 */
export function HomeBoard({ columns }: { columns: BoardColumn[] }) {
  const router = useRouter();
  const [removed, setRemoved] = useState<Set<string>>(new Set());
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
      onRemove: () => setRemoved((prev) => new Set(prev).add(id)),
    });

  return (
    <div className="h-board">
      <div className="h-board-h">
        <span className="ttl">
          <i className="ti ti-layout-board" aria-hidden="true" /> Your board
        </span>
      </div>
      <div className="h-cols">
        {columns.map((col) => (
          <div className="h-col" key={col.key}>
            <div className="h-col-h">
              <span className="cdot" style={{ background: col.dot }} aria-hidden="true" />
              <span className="cname">{col.name}</span>
              <span className="ccount">{col.count}</span>
            </div>

            {col.cards
              .filter((c) => !removed.has(c.id))
              .map((c) => {
                const phase = completing.phaseOf(c.id);
                const grace = phase === "grace";
                return (
                  <div
                    key={c.id}
                    className={`hb-card dp-row${phase ? " done" : ""}`}
                    style={projectColorVars(c.projectColor)}
                    role="button"
                    tabIndex={0}
                    onClick={() => open(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        open(c.id);
                      }
                    }}
                  >
                    <div className="hb-band">
                      <span className="hb-bl">
                        <span className="pd" aria-hidden="true" />
                        <span className="pn">{c.projectName ?? "No project"}</span>
                      </span>
                      {c.when && c.when.text && c.when.text !== "—" ? (
                        <span className={c.when.over ? "when today" : "when"}>
                          {c.when.icon ? (
                            <i className={`ti ${c.when.icon}`} aria-hidden="true" />
                          ) : null}
                          {c.when.text}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className="hb-expand"
                        title="Open task"
                        aria-label="Open task"
                        onClick={(e) => {
                          e.stopPropagation();
                          open(c.id);
                        }}
                      >
                        <i className="ti ti-arrows-diagonal" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="hb-body">
                      <span className={`h2chip ${c.priority}`}>{c.priority}</span>
                      <span className="hb-title">{c.title}</span>
                      {grace ? (
                        <RowUndo onUndo={() => completing.undo(c.id)} />
                      ) : null}
                      <DonePill
                        phase={phase ? (phase === "confirm" ? "confirm" : "done") : "idle"}
                        onComplete={() => complete(c.id)}
                        ariaLabel={`Complete “${c.title}”`}
                      />
                    </div>
                  </div>
                );
              })}

            {col.cards.filter((c) => !removed.has(c.id)).length === 0 ? (
              <p className="h-queue-empty">Nothing here.</p>
            ) : null}

            {col.footer ? (
              <Link className="h-add" href={col.footer.href}>
                <i className={`ti ${col.footer.icon}`} aria-hidden="true" />{" "}
                {col.footer.label}
              </Link>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
