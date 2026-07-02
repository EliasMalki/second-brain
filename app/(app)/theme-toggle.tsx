"use client";

import { useEffect, useState } from "react";

/**
 * Header theme toggle (command-center design) — a single moon/sun button that
 * flips light↔dark. Writes `data-theme` on <html> (the anti-flash seed script in
 * app/layout.tsx already stamps one on load, so token overrides always engage)
 * and persists the resolved choice to localStorage['theme'] — the SAME key the
 * account-menu segmented control uses, so the two stay in sync.
 *
 * `className` lets each page render it in its own shell (`h-iconbtn` on Home,
 * `t-icon` on Tasks). Icon is resolved after mount to avoid hydration drift.
 */
export function ThemeToggle({ className }: { className: string }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);

  const toggle = () => {
    const next = document.documentElement.getAttribute("data-theme") !== "dark";
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* private mode / storage disabled — the DOM attribute still applies */
    }
    setDark(next);
  };

  return (
    <button
      type="button"
      className={className}
      onClick={toggle}
      title={dark ? "Switch to light" : "Switch to dark"}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      <i className={`ti ${dark ? "ti-sun" : "ti-moon"}`} aria-hidden="true" />
    </button>
  );
}
