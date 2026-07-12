import Link from "next/link";
import { getDebriefCadenceDays, type DebriefCadence } from "@/lib/db/settings";
import { SubmitButton } from "../../submit-button";
import {
  runDebriefNowAction,
  saveDebriefCadenceAction,
  scanRecentMismatchesAction,
} from "./actions";

/**
 * Debrief settings (v1 feature 4, Part B). A neutral segmented control for the
 * cadence (Off by default) plus two on-demand tuning actions. Server component —
 * each cadence option is a tiny form so the choice saves with no client JS.
 */

const OPTIONS: { value: DebriefCadence; label: string }[] = [
  { value: 0, label: "Off" },
  { value: 7, label: "Weekly" },
  { value: 10, label: "Every 10 days" },
  { value: 30, label: "Monthly" },
];

type ResultBanner = { text: string; toInbox: boolean };

/** Turn the redirect params from a tuning run into a human result line, so a
 * quiet outcome reads as "checked, nothing to flag" rather than "did nothing". */
function resultBanner(sp: {
  debriefed?: string;
  scanned?: string;
  flagged?: string;
  nodesc?: string;
}): ResultBanner | null {
  if (sp.debriefed != null) {
    const n = Number(sp.debriefed);
    return n > 0
      ? { text: `Debrief ran — ${n} new question${n === 1 ? "" : "s"} in your Inbox.`, toInbox: true }
      : { text: "Debrief ran — nothing needs asking right now.", toInbox: false };
  }
  if (sp.scanned != null) {
    const total = Number(sp.scanned);
    const flagged = Number(sp.flagged ?? 0);
    const noDesc = Number(sp.nodesc ?? 0);
    const items = `${total} recent item${total === 1 ? "" : "s"}`;
    if (flagged > 0) {
      return {
        text: `Scanned ${items} — ${flagged} possible misfiling${flagged === 1 ? "" : "s"} in your Inbox.`,
        toInbox: true,
      };
    }
    const tail =
      noDesc > 0
        ? ` (${noDesc} skipped — those projects have no description to check against.)`
        : "";
    return { text: `Scanned ${items} — all look correctly filed.${tail}`, toInbox: false };
  }
  return null;
}

export default async function DebriefSettingsPage({
  searchParams,
}: {
  searchParams: {
    debriefed?: string;
    scanned?: string;
    flagged?: string;
    nodesc?: string;
  };
}) {
  const cadence = await getDebriefCadenceDays();
  const banner = resultBanner(searchParams);

  return (
    <>
      <div className="view-head">
        <span className="view-title">Debrief</span>
        <span className="view-sub">
          {cadence === 0 ? "Off" : `Every ${cadence} days`}
        </span>
      </div>

      {banner ? (
        <div className="cal-banner ok" role="status">
          <i className="ti ti-check" aria-hidden="true" /> {banner.text}
          {banner.toInbox ? (
            <>
              {" "}
              <Link href="/inbox">Open Inbox →</Link>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="card">
        <p className="card-label">
          <i className="ti ti-message-2" aria-hidden="true" /> Cadence
        </p>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
          Every so often, a few short questions about loose ends — unfiled notes,
          finished work you never wrote up — appear in your Inbox around midday.
          Always optional, always dismissible. Off by default.
        </p>
        <div
          className="theme-seg"
          role="group"
          aria-label="Debrief cadence"
          style={{ marginTop: "var(--space-3)" }}
        >
          {OPTIONS.map((opt) => (
            <form
              action={saveDebriefCadenceAction}
              key={opt.value}
              style={{ flex: 1, display: "flex" }}
            >
              <input type="hidden" name="cadence" value={opt.value} />
              <button
                type="submit"
                className={cadence === opt.value ? "on" : undefined}
                aria-pressed={cadence === opt.value}
              >
                {opt.label}
              </button>
            </form>
          ))}
        </div>
      </div>

      <div className="card">
        <p className="card-label">
          <i className="ti ti-flask" aria-hidden="true" /> Try it now
        </p>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
          Run the debrief immediately (ignores the cadence), or scan your recent
          filed items for anything that looks misfiled. Results land in your
          Inbox.
        </p>
        <div className="form-actions" style={{ marginTop: "var(--space-3)" }}>
          <form action={runDebriefNowAction}>
            <SubmitButton pendingLabel="Running…">Run debrief now</SubmitButton>
          </form>
          <form action={scanRecentMismatchesAction}>
            <SubmitButton pendingLabel="Scanning…">
              Scan recent for mismatches
            </SubmitButton>
          </form>
        </div>
      </div>
    </>
  );
}
