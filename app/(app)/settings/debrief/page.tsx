import { getDebriefCadenceDays, type DebriefCadence } from "@/lib/db/settings";
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

export default async function DebriefSettingsPage() {
  const cadence = await getDebriefCadenceDays();

  return (
    <>
      <div className="view-head">
        <span className="view-title">Debrief</span>
        <span className="view-sub">
          {cadence === 0 ? "Off" : `Every ${cadence} days`}
        </span>
      </div>

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
            <button type="submit" className="btn">
              Run debrief now
            </button>
          </form>
          <form action={scanRecentMismatchesAction}>
            <button type="submit" className="btn">
              Scan recent for mismatches
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
