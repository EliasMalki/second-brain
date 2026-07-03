"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateDisplayNameAction } from "./account-actions";

/**
 * The sidebar footer: a single account card that expands into a popover menu
 * (opens upward — it lives at the bottom of the screen). Houses the relocated
 * Export / Logs / Sign out actions plus the personalization controls: Display
 * name (saved to users.name — drives the Home greeting), Appearance, Density,
 * and Text weight. Theme/weight/density are stamped on <html> and persisted to
 * localStorage; the anti-flash seeding happens in the inline script in
 * app/layout.tsx — keep them in sync.
 *
 * Layout note: the popover spans the sidebar's inner column (206px on desktop),
 * so every control here must fit that width — segments are text-only.
 */

type ThemePref = "light" | "dark" | "system";
type Density = "comfortable" | "compact";
const STORAGE_KEY = "theme";
const WEIGHT_KEY = "fontWeight";
const DENSITY_KEY = "density";

/** Resolve a preference to a concrete light/dark and stamp it on <html>. */
function applyTheme(pref: ThemePref) {
  const dark =
    pref === "dark" ||
    (pref === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: "comfortable", label: "Default" },
  { value: "compact", label: "Compact" },
];

export function AccountMenu({
  userEmail,
  userName,
}: {
  userEmail: string;
  userName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Default "system" until we read the stored choice on mount (matches the head
  // script). Set during render-effect to avoid an SSR/client mismatch.
  const [pref, setPref] = useState<ThemePref>("system");
  // Text-weight offset shared with the CSS --fw-offset (0 = the sharp default).
  const [weight, setWeight] = useState(0);
  const [density, setDensity] = useState<Density>("comfortable");
  // Display name draft + last-saved baseline (Save shows only when they differ).
  const [nameDraft, setNameDraft] = useState(userName);
  const [savedName, setSavedName] = useState(userName);
  const [saving, startSaving] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  const initial = ((userName || userEmail).trim()[0] || "?").toUpperCase();

  // Sync React state to whatever the head script already resolved.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemePref | null;
    if (stored === "light" || stored === "dark" || stored === "system") {
      setPref(stored);
    }
    const w = localStorage.getItem(WEIGHT_KEY);
    if (w !== null && w !== "" && !Number.isNaN(Number(w))) setWeight(Number(w));
    if (localStorage.getItem(DENSITY_KEY) === "compact") setDensity("compact");
  }, []);

  // A refreshed server name (e.g. saved in another tab) resets the local draft.
  useEffect(() => {
    setNameDraft(userName);
    setSavedName(userName);
  }, [userName]);

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

  // Live-apply the weight offset to <html> (cascades to every --fw-* token) and
  // persist it; the head script re-seeds it on the next load.
  const chooseWeight = (n: number) => {
    setWeight(n);
    document.documentElement.style.setProperty("--fw-offset", String(n));
    try {
      localStorage.setItem(WEIGHT_KEY, String(n));
    } catch {
      /* storage disabled — the inline var still applies this session */
    }
  };
  const resetWeight = () => {
    setWeight(0);
    document.documentElement.style.removeProperty("--fw-offset");
    try {
      localStorage.removeItem(WEIGHT_KEY);
    } catch {
      /* ignore */
    }
  };

  const chooseDensity = (value: Density) => {
    setDensity(value);
    if (value === "compact") {
      document.documentElement.setAttribute("data-density", "compact");
    } else {
      document.documentElement.removeAttribute("data-density");
    }
    try {
      if (value === "compact") localStorage.setItem(DENSITY_KEY, "compact");
      else localStorage.removeItem(DENSITY_KEY);
    } catch {
      /* ignore */
    }
  };

  const nameDirty = nameDraft.trim() !== savedName && nameDraft.trim() !== "";
  const saveName = () => {
    const name = nameDraft.trim();
    if (!name || name === savedName) return;
    startSaving(async () => {
      const fd = new FormData();
      fd.set("name", name);
      await updateDisplayNameAction(fd);
      setSavedName(name);
      router.refresh(); // greeting reads users.name
    });
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
            <p className="account-section-label">Display name</p>
            <form
              className="name-row"
              onSubmit={(e) => {
                e.preventDefault();
                saveName();
              }}
            >
              <input
                type="text"
                value={nameDraft}
                maxLength={80}
                placeholder="Your name"
                aria-label="Display name"
                onChange={(e) => setNameDraft(e.target.value)}
              />
              {nameDirty ? (
                <button type="submit" className="name-save" disabled={saving}>
                  {saving ? "…" : "Save"}
                </button>
              ) : null}
            </form>
          </div>

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
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="account-section">
            <p className="account-section-label">Density</p>
            <div className="theme-seg" role="group" aria-label="Density">
              {DENSITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={density === opt.value ? "on" : undefined}
                  aria-pressed={density === opt.value}
                  onClick={() => chooseDensity(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="account-section">
            <p className="account-section-label">Text weight</p>
            <div className="weight-row">
              <span className="weight-cap lo" aria-hidden="true">
                A
              </span>
              <input
                type="range"
                className="weight-slider"
                min={-100}
                max={100}
                step={10}
                value={weight}
                aria-label="Text weight"
                onChange={(e) => chooseWeight(Number(e.target.value))}
              />
              <span className="weight-cap hi" aria-hidden="true">
                A
              </span>
              {weight !== 0 ? (
                <button
                  type="button"
                  className="weight-reset"
                  onClick={resetWeight}
                  title="Reset to default"
                >
                  Reset
                </button>
              ) : null}
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
          <Link href="/settings/calendar" className="account-item" role="menuitem">
            <i className="ti ti-calendar" aria-hidden="true" />
            Calendar
          </Link>
          <Link href="/settings/debrief" className="account-item" role="menuitem">
            <i className="ti ti-message-2" aria-hidden="true" />
            Debrief
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
