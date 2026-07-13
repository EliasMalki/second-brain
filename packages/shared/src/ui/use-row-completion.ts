import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The grace-period completion lifecycle behind the Done pill + inline-row undo
 * (replaces the completion toast). Surface- AND platform-agnostic: pure React
 * state + timers, no DOM — web and mobile import the SAME hook so the grace
 * semantics can never drift between them (this is the first React hook in
 * shared; permitted because it touches no platform APIs — see CLAUDE.md).
 *
 * The owner keeps the row in its list while it's "completing" and renders it
 * per `phaseOf(id)`.
 *
 * Lifecycle: click → `confirm` (~500ms solid green) → `grace` (~5s, struck row +
 * inline Undo). The real server complete is fired at grace EXPIRY, then
 * `onRemove()` drops the row. So during confirm+grace the task is still open
 * server-side — every surface just renders it in place, and Undo is a pure local
 * cancel (instant, no server round-trip). On unmount any pending completion is
 * flushed (fired) so nothing is lost if the user navigates away mid-grace.
 */
export type CompletionPhase = "confirm" | "grace";

const CONFIRM_MS = 500;
const GRACE_MS = 5000;

type Pending = {
  phase: CompletionPhase;
  completeAction: () => void | Promise<void>;
  onRemove: () => void;
  confirmTimer?: ReturnType<typeof setTimeout>;
  graceTimer?: ReturnType<typeof setTimeout>;
  fired: boolean;
};

export function useRowCompletion() {
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((n) => n + 1), []);
  const pending = useRef(new Map<string, Pending>());

  const fireOnce = (p: Pending) => {
    if (p.fired) return;
    p.fired = true;
    void p.completeAction();
  };
  const clearTimers = (p: Pending) => {
    if (p.confirmTimer) clearTimeout(p.confirmTimer);
    if (p.graceTimer) clearTimeout(p.graceTimer);
  };

  const complete = useCallback(
    (
      id: string,
      opts: {
        completeAction: () => void | Promise<void>;
        onRemove: () => void;
      },
    ) => {
      if (pending.current.has(id)) return; // already completing
      const p: Pending = {
        phase: "confirm",
        completeAction: opts.completeAction,
        onRemove: opts.onRemove,
        fired: false,
      };
      pending.current.set(id, p);
      rerender();

      p.confirmTimer = setTimeout(() => {
        p.phase = "grace";
        rerender();
        p.graceTimer = setTimeout(() => {
          fireOnce(p); // commit the real completion
          pending.current.delete(id);
          rerender();
          opts.onRemove(); // drop the row from the surface's list
        }, GRACE_MS);
      }, CONFIRM_MS);
    },
    [rerender],
  );

  const undo = useCallback(
    (id: string) => {
      const p = pending.current.get(id);
      if (!p) return;
      clearTimers(p);
      pending.current.delete(id);
      rerender();
      // nothing was completed server-side yet (fire-at-expiry), so no reopen call
    },
    [rerender],
  );

  const phaseOf = useCallback((id: string): CompletionPhase | undefined => {
    return pending.current.get(id)?.phase;
  }, []);

  // Flush pending completions on unmount so a click isn't lost if the user
  // navigates away before the grace window elapses.
  useEffect(() => {
    const map = pending.current;
    return () => {
      map.forEach((p) => {
        clearTimers(p);
        fireOnce(p);
      });
    };
  }, []);

  return { complete, undo, phaseOf };
}
