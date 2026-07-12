"use client";

/**
 * Tiny gesture-motion helpers (apple-design pass). No dependencies — three
 * functions cover what the app's gestures need: project a flick's landing
 * point, spring to a target carrying the finger's velocity, and fly a
 * committed card off-screen. All animations are cancelable (grab mid-flight).
 */

export type Cancel = () => void;

/**
 * Apple's momentum projection (Designing Fluid Interfaces): where a gesture
 * released at `velocityPxS` px/s would coast to. Pick the snap target from
 * the PROJECTED point, not the release point — that's what makes a small
 * fast flick feel like a throw.
 */
export function project(velocityPxS: number, decelerationRate = 0.998): number {
  return ((velocityPxS / 1000) * decelerationRate) / (1 - decelerationRate);
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Spring `from` → `to`, starting at the gesture's release velocity so there
 * is no seam between dragging and animating. Critically-damped-ish tuning
 * (no visible overshoot on UI surfaces). Returns a cancel function; a new
 * grab should cancel and re-start from the CURRENT value (interruptible).
 */
export function springTo(opts: {
  from: number;
  to: number;
  velocity?: number;
  onUpdate: (x: number) => void;
  onSettle?: () => void;
}): Cancel {
  const K = 190; // stiffness
  const C = 26; // damping
  let x = opts.from;
  let v = opts.velocity ?? 0;
  let last: number | null = null;
  let raf = 0;

  const frame = (t: number) => {
    if (last === null) last = t;
    let dt = (t - last) / 1000;
    last = t;
    if (dt > 0.032) dt = 0.032; // clamp tab-switch jumps
    v += (-K * (x - opts.to) - C * v) * dt;
    x += v * dt;
    opts.onUpdate(x);
    if (Math.abs(x - opts.to) < 0.4 && Math.abs(v) < 10) {
      opts.onUpdate(opts.to);
      opts.onSettle?.();
      return;
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

/**
 * Fly a committed element off in `direction` (±1), continuing at the release
 * velocity (floored so a slow commit still leaves briskly). Calls `onDone`
 * once past `limit` px.
 */
export function flingOut(opts: {
  from: number;
  velocity: number;
  direction: 1 | -1;
  limit: number;
  onUpdate: (x: number) => void;
  onDone: () => void;
}): Cancel {
  const MIN_SPEED = 900; // px/s
  let x = opts.from;
  let v =
    opts.direction > 0
      ? Math.max(opts.velocity, MIN_SPEED)
      : Math.min(opts.velocity, -MIN_SPEED);
  let last: number | null = null;
  let raf = 0;

  const frame = (t: number) => {
    if (last === null) last = t;
    let dt = (t - last) / 1000;
    last = t;
    if (dt > 0.032) dt = 0.032;
    x += v * dt;
    opts.onUpdate(x);
    if (Math.abs(x) > opts.limit) {
      opts.onDone();
      return;
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
