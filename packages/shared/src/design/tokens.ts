/**
 * Design tokens — THE single source of truth for both apps' theme values.
 *
 * `npm run tokens` (repo root) regenerates every consumer:
 *   - apps/web/app/globals.css        (the marker-fenced token block)
 *   - apps/mobile/src/global.css      (the marker-fenced token block)
 *   - apps/mobile/tailwind-preset.generated.js (NativeWind preset)
 * `npm run tokens:check` (part of root typecheck) fails if any output is stale.
 *
 * Change values HERE, never in the generated blocks. Keep this module free of
 * imports — the generator loads it standalone (and the project palette already
 * lives in ../domain/colors.ts, which the generator reads separately).
 *
 * Root invariant: priority chips A/B are the ONLY saturated color; `accent`
 * stays monochrome; project colors stay quiet (dots/edges/tints).
 */

export type ThemedToken = {
  light: string;
  dark: string;
  /** Where web declares it when the name differs (mockup alias set). */
  webVar?: string;
  /** Emitted only into mobile's block — web styles this via component rules
   *  (prio chips) or doesn't need it (scrim/ok-fg are RN concerns). */
  mobileOnly?: boolean;
  /** Emitted only into web's block (shadows are RN style props on mobile). */
  webOnly?: boolean;
  /** Web quirk, preserved on purpose: this token is missing from the no-JS
   *  @media dark fallback in globals.css (only `[data-theme="dark"]` sets it). */
  omitFromWebMediaFallback?: boolean;
};

/** Key = the canonical (mobile / Tailwind) token name; `--<key>` on mobile. */
export const COLORS: Record<string, ThemedToken> = {
  // neutral surfaces
  bg: { light: "#fafafa", dark: "#111113" },
  surface: { light: "#ffffff", dark: "#1b1b1f" },
  "surface-2": {
    light: "#f4f4f5",
    dark: "#232329",
    webVar: "--color-background-secondary",
  },
  "surface-3": {
    light: "#e9e9eb",
    dark: "#2e2e33",
    webVar: "--color-background-tertiary",
  },
  // text tiers
  fg: { light: "#18181b", dark: "#f4f4f5" },
  "fg-secondary": {
    light: "#52525b",
    dark: "#a1a1aa",
    webVar: "--color-text-secondary",
  },
  "fg-muted": { light: "#71717a", dark: "#a1a1aa" },
  // hairlines
  border: { light: "#e4e4e7", dark: "#2e2e33" },
  "border-2": {
    light: "#d4d4d8",
    dark: "#3f3f46",
    webVar: "--color-border-secondary",
  },
  // monochrome accent (inverts by theme)
  accent: { light: "#18181b", dark: "#f4f4f5" },
  "accent-fg": { light: "#ffffff", dark: "#18181b" },
  // semantic
  ok: { light: "#15803d", dark: "#4ade80" },
  "ok-bg": { light: "#f0fdf4", dark: "#122417" },
  "ok-solid": { light: "#1b8a4b", dark: "#22a35a" },
  "ok-bd": { light: "#bce8cc", dark: "#2f5a41" },
  /** fg on an ok-solid fill — white in BOTH themes (the deliberate green
   *  exception; accent-fg would invert wrongly in dark). */
  "ok-fg": { light: "#ffffff", dark: "#ffffff", mobileOnly: true },
  danger: { light: "#b91c1c", dark: "#f87171" },
  "danger-bg": { light: "#fef2f2", dark: "#2a1414" },
  "danger-solid": {
    light: "#c0362c",
    dark: "#e5484d",
    omitFromWebMediaFallback: true,
  },
  warn: { light: "#a16207", dark: "#facc15" },
  "warn-bg": { light: "#fefce8", dark: "#271f0c" },
  info: { light: "#2563eb", dark: "#60a5fa" },
  "info-bg": { light: "#eff6ff", dark: "#16233f" },
  // frosted-glass specular highlight (web composer)
  sheen: {
    light: "rgba(255, 255, 255, 0.45)",
    dark: "rgba(255, 255, 255, 0.08)",
  },
  // sheet/drawer backdrop (web hardcodes rgba(0,0,0,0.4) in component rules)
  scrim: {
    light: "rgba(0, 0, 0, 0.4)",
    dark: "rgba(0, 0, 0, 0.4)",
    mobileOnly: true,
  },
  // command-center accent (monochrome, near-black <-> near-white)
  tech: { light: "#18181b", dark: "#f4f4f5" },
  "tech-press": { light: "#33333a", dark: "#d4d4d8" },
  "tech-fg": { light: "#ffffff", dark: "#18181b" },
  // lift shadow (web-only: RN shadows are style props, not CSS values)
  lift: {
    light:
      "0 1px 2px rgba(20, 20, 30, 0.05), 0 16px 34px -22px rgba(20, 20, 30, 0.3)",
    dark: "0 1px 2px rgba(0, 0, 0, 0.4), 0 18px 40px -22px rgba(0, 0, 0, 0.7)",
    webOnly: true,
  },
  // priority chips — the only saturated color (C/D stay neutral: surface-3 +
  // fg-secondary). Web styles these in its .h2chip component rules.
  "prio-a-bg": { light: "#fbe4e2", dark: "#3a1d1a", mobileOnly: true },
  "prio-a-fg": { light: "#b5362b", dark: "#ef9c93", mobileOnly: true },
  "prio-b-bg": { light: "#f8eccf", dark: "#352711", mobileOnly: true },
  "prio-b-fg": { light: "#8a5e0c", dark: "#e3bd66", mobileOnly: true },
};

/** Radii — web: --radius-sm 6 / --border-radius-md 6 / --radius 8 / --border-radius-lg 10. */
export const RADII = {
  sm: "6px",
  md: "6px",
  DEFAULT: "8px",
  lg: "10px",
} as const;

/** Web --space-* scale (Tailwind's default scale already matches: space-N = N/4 rem). */
export const SPACE = {
  "1": "0.25rem",
  "2": "0.5rem",
  "3": "0.75rem",
  "4": "1rem",
  "6": "1.5rem",
  "8": "2rem",
} as const;

/** Web --text-* sizes. */
export const TEXT = {
  sm: "0.875rem",
  base: "1rem",
  lg: "1.125rem",
  xl: "1.5rem",
} as const;

/** Web --fw-* base weights (each web value = calc(base + --fw-offset); mobile
 *  has no weight slider and uses plain font-normal/medium/semibold). */
export const FW = {
  heading: 500,
  label: 450,
  title: 400,
  chip: 500,
  numeral: 450,
  body: 400,
} as const;

export type Scheme = "light" | "dark";

/** Convenience for RN style props that can't use CSS vars (drawer panel,
 *  scrims): pick a token's value for the current scheme. */
export function tokenColor(name: keyof typeof COLORS, scheme: Scheme): string {
  const t = COLORS[name];
  return scheme === "dark" ? t.dark : t.light;
}
