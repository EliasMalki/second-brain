"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * The sidebar footer: a single account card that expands into a popover menu
 * (opens upward — it lives at the bottom of the screen). Houses the relocated
 * Export / Logs / Sign out actions plus the Appearance toggle. The toggle drives
 * the existing `--color-*` dark tokens via `data-theme` on <html>; the anti-flash
 * resolution happens in the inline script in app/layout.tsx — keep them in sync.
 */

type ThemePref = "light" | "dark" | "system";
const STORAGE_KEY = "theme";

/** Resolve a preference to a concrete light/dark and stamp it on <html>. */
function applyTheme(pref: ThemePref) {
  const dark =
    pref === "dark" ||
    (pref === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

const THEME_OPTIONS: { value: ThemePref; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "ti-sun" },
  { value: "dark", label: "Dark", icon: "ti-moon" },
  { value: "system", label: "System", icon: "ti-device-desktop" },
];

export function AccountMenu({ userEmail }: { userEmail: string }) {
  const [open, setOpen] = useState(false);
  // Default "system" until we read the stored choice on mount (matches the head
  // script). Set during render-effect to avoid an SSR/client mismatch.
  const [pref, setPref] = useState<ThemePref>("system");
  const rootRef = useRef<HTMLDivElement>(null);

  const initial = (userEmail.trim()[0] || "?").toUpperCase();

  // Sync React state to whatever the head script already resolved.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemePref | null;
    if (stored === "light" || stored === "dark" || stored === "system") {
      setPref(stored);
    }
  }, []);

  // While on "system", keep following the OS as it changes.
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (value: ThemePref) => {
    setPref(value);
    localStorage.setItem(STORAGE_KEY, value);
    applyTheme(value);
  };

  return (
    <div className="account" ref={rootRef}>
      {open ? (
        <div className="account-popover" role="menu">
          <div className="account-popover-head">
            <span className="account-avatar" aria-hidden="true">
              {initial}
            </span>
            <span className="account-popover-email">{userEmail}</span>
          </div>

          <div className="account-divider" />

          <div className="account-section">
            <p className="account-section-label">Appearance</p>
            <div className="theme-seg" role="group" aria-label="Appearance">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={pref === opt.value ? "on" : undefined}
                  aria-pressed={pref === opt.value}
                  onClick={() => choose(opt.value)}
                >
                  <i className={`ti ${opt.icon}`} aria-hidden="true" />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="account-divider" />

          <a href="/export" className="account-item" role="menuitem">
            <i className="ti ti-download" aria-hidden="true" />
            Export
          </a>
          <Link href="/admin/logs" className="account-item" role="menuitem">
            <i className="ti ti-activity" aria-hidden="true" />
            Logs
          </Link>

          <div className="account-divider" />

          <form action="/auth/signout" method="post">
            <button type="submit" className="account-item signout" role="menuitem">
              <i className="ti ti-logout" aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      ) : null}

      <button
        type="button"
        className="account-card"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={userEmail}
      >
        <span className="account-avatar" aria-hidden="true">
          {initial}
        </span>
        <span className="account-card-email">{userEmail}</span>
        <i className="ti ti-chevron-up account-card-chevron" aria-hidden="true" />
      </button>
    </div>
  );
}
