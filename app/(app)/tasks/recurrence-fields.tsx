"use client";

import { useState } from "react";
import type { RecurFreq } from "@/lib/db/recurrences";

/** Mon-first display order; values are the SU..SA codes the nightly job reads. */
const DAYS: { code: string; label: string }[] = [
  { code: "MO", label: "M" },
  { code: "TU", label: "T" },
  { code: "WE", label: "W" },
  { code: "TH", label: "T" },
  { code: "FR", label: "F" },
  { code: "SA", label: "S" },
  { code: "SU", label: "S" },
];

/**
 * Recurrence reads as a sentence: "every [n] [freq] on [days]". The day picker
 * shows only for weekly rules. Emits hidden inputs `freq`, `interval`, `byday`
 * (comma-separated codes) so any enclosing <form> submits them. Stateless about
 * submission — the parent form's action decides what to do with the values.
 */
export function RecurrenceFields({
  defaultFreq = "weekly",
  defaultInterval = 1,
  defaultByday = [],
}: {
  defaultFreq?: RecurFreq;
  defaultInterval?: number;
  defaultByday?: string[];
}) {
  const [freq, setFreq] = useState<RecurFreq>(defaultFreq);
  const [byday, setByday] = useState<Set<string>>(new Set(defaultByday));

  const toggleDay = (code: string) =>
    setByday((prev) => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });

  return (
    <div className="recur-sentence">
      <span className="qa-word">every</span>
      <input
        type="number"
        name="interval"
        min={1}
        max={365}
        defaultValue={defaultInterval}
        aria-label="Repeat interval"
        className="recur-interval"
      />
      <select
        name="freq"
        value={freq}
        onChange={(e) => setFreq(e.target.value as RecurFreq)}
        aria-label="Repeat frequency"
      >
        <option value="daily">day(s)</option>
        <option value="weekly">week(s)</option>
        <option value="monthly">month(s)</option>
        <option value="yearly">year(s)</option>
      </select>

      {freq === "weekly" ? (
        <>
          <span className="qa-word">on</span>
          <div className="dow" role="group" aria-label="Days of week">
            {DAYS.map((d) => (
              <button
                key={d.code}
                type="button"
                className={byday.has(d.code) ? "dow-day on" : "dow-day"}
                aria-pressed={byday.has(d.code)}
                aria-label={d.code}
                onClick={() => toggleDay(d.code)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </>
      ) : null}

      <input type="hidden" name="byday" value={[...byday].join(",")} />
    </div>
  );
}
