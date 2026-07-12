"use client";

import { useEffect, useRef, useState } from "react";
import { hapticSuccess, hapticTick } from "@/lib/haptics";

/**
 * The one task-completion control (mockup Variant B): at rest a quiet circle;
 * on row hover it morphs into the pale-green "Done ✓" pill (check on the RIGHT);
 * while completing it's the solid-green pill. The circle→pill morph is pure CSS
 * driven by the row's `.dp-row:hover`. See `.donepill` in globals.css.
 *
 * `phase`: "idle" (not completing) | "confirm" (~500ms solid green) | "done"
 * (grace window — solid green; the row shows the inline Undo). Clicking only
 * fires `onComplete` from idle; during confirm/done the row's Undo takes over.
 *
 * TOUCH IS A TWO-STEP (apple-design pass): on devices without hover, the
 * first tap ARMS the pill — it morphs to the same pale-green "Done ✓" the
 * desktop hover shows — and the second tap completes. An ignored armed pill
 * quietly disarms after 2.5s. On hover devices nothing changes: hover was
 * the arm step, one click completes. The control keeps its identity in every
 * state; only the fill deepens.
 */
export type DonePhase = "idle" | "confirm" | "done";

const DISARM_MS = 2500;

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
  const [armed, setArmed] = useState(false);
  const disarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDisarm = () => {
    if (disarmTimer.current) {
      clearTimeout(disarmTimer.current);
      disarmTimer.current = null;
    }
  };
  useEffect(() => clearDisarm, []);

  const click = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (phase !== "idle") return;

    // Hover devices: the hover morph already previewed the action — one
    // click completes, exactly as before.
    if (window.matchMedia("(hover: hover)").matches) {
      onComplete();
      return;
    }

    // Keyboard / assistive-tech activation (synthesized clicks carry
    // detail === 0): one activation completes. The two-step exists to guard
    // stray FINGER taps; making Enter or a screen-reader double-tap arm
    // silently would strand those users — and the 5s undo already covers
    // accidental activations.
    if (e.detail === 0) {
      clearDisarm();
      setArmed(false);
      onComplete();
      return;
    }

    // Touch: first tap arms, second tap commits.
    if (!armed) {
      setArmed(true);
      hapticTick();
      clearDisarm();
      disarmTimer.current = setTimeout(() => setArmed(false), DISARM_MS);
      return;
    }
    clearDisarm();
    setArmed(false);
    hapticSuccess();
    onComplete();
  };

  const armedNow = armed && phase === "idle";
  return (
    <button
      type="button"
      className={`donepill is-${phase}${armedNow ? " is-armed" : ""}`}
      onClick={click}
      aria-label={
        armedNow ? "Tap again to complete" : (ariaLabel ?? "Complete task")
      }
      aria-pressed={phase !== "idle"}
      title={armedNow ? "Tap again to complete" : "Complete"}
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
