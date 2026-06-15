"use client";

import { useRef } from "react";

/**
 * A thin draggable divider that resizes the pane to its left. Sits on the seam
 * between two panes (negative margins, so it adds no layout width) and uses
 * pointer capture so the drag keeps tracking outside the 6px hit area. Desktop
 * only — hidden on mobile where panes are full-screen drill-down levels.
 */
export function PaneResizer({
  width,
  min,
  max,
  onResize,
  ariaLabel,
}: {
  width: number;
  min: number;
  max: number;
  onResize: (next: number) => void;
  ariaLabel: string;
}) {
  const start = useRef({ x: 0, w: 0 });

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    start.current = { x: e.clientX, w: width };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const next = Math.min(max, Math.max(min, start.current.w + (e.clientX - start.current.x)));
    onResize(next);
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }

  return (
    <div
      className="pane-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  );
}
