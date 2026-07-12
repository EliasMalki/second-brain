"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Delayed-unmount close for popovers/modals (apple-design pass D): overlays
 * exit along the path they entered (§7 spatial consistency) instead of
 * vanishing. Route every dismiss through `requestClose`; render the overlay
 * with `closing ? "is-closing" : ""` — the CSS runs the enter animation in
 * reverse, then the real close (unmount) fires after `ms`.
 *
 * Safe across open cycles: state resets once the close lands, so a component
 * that keeps its own `open` flag can reopen normally.
 */
export function useDismissable(onClose: () => void, ms = 140) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    timer.current = setTimeout(() => {
      closeRef.current();
      closingRef.current = false;
      setClosing(false);
    }, ms);
  }, [ms]);

  return { closing, requestClose };
}
