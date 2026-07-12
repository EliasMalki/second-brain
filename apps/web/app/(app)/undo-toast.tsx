"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The one app-wide undo toast. A state-changing action shows it optimistically
 * with an Undo affordance; it auto-dismisses. Reuses the `.undo-toast` styles
 * (bottom-right, safe-area aware) that Projects already ships, so every surface
 * — Home, Tasks, Calendar, Projects — reads as the same component.
 *
 *   const undo = useUndoToast();
 *   undo.show({ msg: "Task completed", undo: () => reopen() });
 *   ...
 *   <UndoToast toast={undo.toast} onClear={undo.clear} />
 */
export type UndoToastState = { msg: string; undo?: () => void } | null;

export function useUndoToast(timeoutMs = 6000) {
  const [toast, setToast] = useState<UndoToastState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (next: UndoToastState) => {
      if (timer.current) clearTimeout(timer.current);
      setToast(next);
      if (next) timer.current = setTimeout(() => setToast(null), timeoutMs);
    },
    [timeoutMs],
  );

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { toast, show, clear };
}

export function UndoToast({
  toast,
  onClear,
}: {
  toast: UndoToastState;
  onClear: () => void;
}) {
  if (!toast) return null;
  return (
    <div className="undo-toast" role="status" aria-live="polite">
      <span>{toast.msg}</span>
      {toast.undo ? (
        <button
          type="button"
          className="undo-btn"
          onClick={() => {
            toast.undo!();
            onClear();
          }}
        >
          Undo
        </button>
      ) : null}
      <button
        type="button"
        className="undo-x"
        aria-label="Dismiss"
        onClick={onClear}
      >
        <i className="ti ti-x" aria-hidden="true" />
      </button>
    </div>
  );
}
