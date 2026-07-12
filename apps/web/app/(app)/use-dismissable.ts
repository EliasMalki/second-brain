"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Delayed-unmount close for popovers/modals (apple-design pass D): overlays
 * exit along the path they entered (§7 spatial consistency) instead of
 * vanishing. Route every dismiss through `requestClose`; render the overlay
 * with `closing ? "is-closing" : ""` — the CSS runs the enter animation in
 * reverse (and disables pointer events), then the real close (unmount)
 * fires after `ms`.
 *
 * `cancelClose` aborts an in-flight close — a trigger that toggles should
 * treat a click during the closing beat as "keep it open" rather than
 * eating the click. The in-flight guard is the timer itself; state resets
 * once the close lands or is cancelled, so reopen always works. The return
 * object is memoized, so it is safe in effect dependency arrays.
 */
export function useDismissable(onClose: () => void, ms = 140) {
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const requestClose = useCallback(() => {
    if (timer.current) return; // close already in flight
    setClosing(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setClosing(false);
      closeRef.current();
    }, ms);
  }, [ms]);

  const cancelClose = useCallback(() => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    setClosing(false);
  }, []);

  return useMemo(
    () => ({ closing, requestClose, cancelClose }),
    [closing, requestClose, cancelClose],
  );
}
