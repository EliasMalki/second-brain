"use client";

import { useEffect } from "react";

/**
 * iOS PWA keyboard fix. iOS does not shrink the layout viewport (100vh/100dvh)
 * when the soft keyboard opens, so a bottom-docked composer ends up hidden
 * behind it. We track window.visualViewport and expose its live height as
 * --app-height; .app-shell uses that, so the composer always rides just above
 * the keyboard. No-op where visualViewport is unsupported (falls back to dvh).
 */
export function ViewportFix() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const apply = () => {
      document.documentElement.style.setProperty("--app-height", `${vv.height}px`);
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
    };
  }, []);

  return null;
}
