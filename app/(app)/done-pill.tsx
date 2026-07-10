"use client";

/**
 * The one task-completion control (mockup Variant B): at rest a quiet circle;
 * on row hover it morphs into the pale-green "Done ✓" pill (check on the RIGHT);
 * while completing it's the solid-green pill. The circle→pill morph is pure CSS
 * driven by the row's `.dp-row:hover` (disabled on touch, where the resting
 * circle stays and a tap completes). See `.donepill` in globals.css.
 *
 * `phase`: "idle" (not completing) | "confirm" (~500ms solid green) | "done"
 * (grace window — solid green; the row shows the inline Undo). Clicking only
 * fires `onComplete` from idle; during confirm/done the row's Undo takes over.
 */
export type DonePhase = "idle" | "confirm" | "done";

export function DonePill({
  phase,
  onComplete,
  label = "Done",
  ariaLabel,
}: {
  phase: DonePhase;
  onComplete: () => void;
  label?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      className={`donepill is-${phase}`}
      onClick={(e) => {
        e.stopPropagation();
        if (phase === "idle") onComplete();
      }}
      aria-label={ariaLabel ?? "Complete task"}
      aria-pressed={phase !== "idle"}
      title="Complete"
    >
      <span className="dp-label">{label}</span>
      <i className="ti ti-check dp-check" aria-hidden="true" />
    </button>
  );
}

/**
 * The inline "Undo" affordance shown on a row during its grace window — replaces
 * the completion toast. Right-aligned, green, per the mockup's undo row.
 */
export function RowUndo({ onUndo }: { onUndo: () => void }) {
  return (
    <button
      type="button"
      className="row-undo"
      onClick={(e) => {
        e.stopPropagation();
        onUndo();
      }}
    >
      <i className="ti ti-arrow-back-up" aria-hidden="true" />
      Undo
    </button>
  );
}
