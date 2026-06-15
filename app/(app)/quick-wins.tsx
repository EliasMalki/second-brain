"use client";

import { Fragment, useState } from "react";

/**
 * "Got time?" — the Home hub's segmented control over the Today focus block.
 * Filtering is client-side and instant; the rows are server-rendered TaskRow
 * nodes passed in via the slot pattern (so their server-action forms stay
 * intact) alongside the metadata the filter needs.
 *
 * Mapping (effort only has quick|deep, so "1 hour" is the moderate middle):
 *   20 min    → effort=quick  AND doable now
 *   1 hour    → effort≠deep   AND doable now   (quick or unspecified)
 *   Deep work → effort=deep
 *   (default) → no filter
 *
 * "doable now" is already guaranteed inside the focus block — off-hours
 * business-hours tasks are split out server-side — but it's carried per-item
 * so the filter stays correct if that ever changes.
 */

type Filter = "20" | "60" | "deep";

export type FocusItem = {
  id: string;
  section: "focus" | "also";
  effort: "quick" | "deep" | null;
  doableNow: boolean;
  node: React.ReactNode;
};

const SEGMENTS: { key: Filter; label: string }[] = [
  { key: "20", label: "20 min" },
  { key: "60", label: "1 hour" },
  { key: "deep", label: "Deep work" },
];

function matches(item: FocusItem, filter: Filter | null): boolean {
  switch (filter) {
    case null:
      return true;
    case "20":
      return item.effort === "quick" && item.doableNow;
    case "60":
      return item.effort !== "deep" && item.doableNow;
    case "deep":
      return item.effort === "deep";
  }
}

export function QuickWins({ items }: { items: FocusItem[] }) {
  const [filter, setFilter] = useState<Filter | null>(null);

  const visible = items.filter((i) => matches(i, filter));
  const focus = visible.filter((i) => i.section === "focus");
  const also = visible.filter((i) => i.section === "also");

  return (
    <div className="qw">
      <div className="qw-bar">
        <span className="qw-label">Got time?</span>
        <div
          className="segmented"
          role="group"
          aria-label="Filter today by time available"
        >
          {SEGMENTS.map((s) => {
            const on = filter === s.key;
            return (
              <button
                key={s.key}
                type="button"
                className={on ? "segment on" : "segment"}
                aria-pressed={on}
                // toggle: tapping the active segment clears back to no filter
                onClick={() => setFilter(on ? null : s.key)}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {focus.length > 0 ? (
        <section>
          <p className="section-label">Start here</p>
          <div className="focus">
            <ul className="tasks">
              {focus.map((i) => (
                <Fragment key={i.id}>{i.node}</Fragment>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {also.length > 0 ? (
        <section>
          <p className="section-label">Also today</p>
          <ul className="tasks">
            {also.map((i) => (
              <Fragment key={i.id}>{i.node}</Fragment>
            ))}
          </ul>
        </section>
      ) : null}

      {filter !== null && visible.length === 0 ? (
        <div className="muted-note">
          <i className="ti ti-coffee" aria-hidden="true" />
          Nothing that size right now — tap again to clear the filter.
        </div>
      ) : null}
    </div>
  );
}
