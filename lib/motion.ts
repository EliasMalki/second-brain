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
 * Release-velocity tracker shared by every drag surface. Only samples from
 * the last `windowMs` count: drag fast, HOLD STILL, then lift → velocity is
 * 0 (a stationary pointer emits no moves, so without the window the stale
 * flick speed would survive the pause and momentum-project a commit the
 * user deliberately cancelled).
 */
export type VelocityTracker = {
  reset: (value: number) => void;
  push: (value: number) => void;
  /** px/s over the recent window; 0 when the pointer was at rest. */
  read: () => number;
};

export function createVelocityTracker(windowMs = 100): VelocityTracker {
  let samples: { t: number; v: number }[] = [];
  return {
    reset(value: number) {
      samples = [{ t: performance.now(), v: value }];
    },
    push(value: number) {
      samples.push({ t: performance.now(), v: value });
      if (samples.length > 8) samples.shift();
    },
    read() {
      const now = performance.now();
      const recent = samples.filter((s) => now - s.t <= windowMs);
      if (recent.length < 2) return 0;
      const a = recent[0];
      const b = recent[recent.length - 1];
      const dt = (b.t - a.t) / 1000;
      return dt > 0 ? (b.v - a.v) / dt : 0;
    },
  };
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
