"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { completeTaskAction } from "./tasks/actions";
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
 * its expand button) opens the task in the Tasks panel; the circle completes it
 * (optimistic dim + strike, persisted via the server action).
 */
export function HomeBoard({ columns }: { columns: BoardColumn[] }) {
  const router = useRouter();
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const open = (id: string) => router.push(`/tasks?task=${id}`);
  const complete = (id: string) => {
    setDoneIds((prev) => new Set(prev).add(id));
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      await completeTaskAction(fd);
    });
  };

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

            {col.cards.map((c) => {
              const done = doneIds.has(c.id);
              return (
                <div
                  key={c.id}
                  className={done ? "hb-card done" : "hb-card"}
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
                    <button
                      type="button"
                      className={done ? "hb-check on" : "hb-check"}
                      title="Complete"
                      aria-label="Complete"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!done) complete(c.id);
                      }}
                    />
                  </div>
                </div>
              );
            })}

            {col.cards.length === 0 ? (
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
