import type { CSSProperties } from "react";

/**
 * Per-project color system (Projects redesign, PART 1).
 *
 * ONE base color is stored per project (`projects.color` = a curated palette
 * key, or a raw #hex, or null). Every tint is DERIVED in the UI from that base
 * via CSS `color-mix` against `--surface` / `--fg` — so a single stored value
 * adapts to light and dark automatically (see `.ptag`, the sidebar/grid dots,
 * and the task-row edge in globals.css). We never store multiple shades.
 *
 * Restraint is the whole point: the base only ever paints dots, ~3px edges, and
 * pale tags. Never a filled row or card. Priority chips (A/B/C/D) stay the only
 * saturated color in the app. Pick-from-set only — there is no freeform picker.
 */

export type ProjectColorKey =
  | "blue"
  | "teal"
  | "violet"
  | "pink"
  | "orange"
  | "amber"
  | "green"
  | "cyan"
  | "red"
  | "slate";

/** The curated swatch set, in display order. Mid-saturation bases that read on
 *  both a white and a dark surface once mixed. */
export const PROJECT_COLORS: { key: ProjectColorKey; label: string; hex: string }[] = [
  { key: "blue", label: "Blue", hex: "#2563EB" },
  { key: "teal", label: "Teal", hex: "#0D9488" },
  { key: "violet", label: "Violet", hex: "#7C3AED" },
  { key: "pink", label: "Pink", hex: "#DB2777" },
  { key: "orange", label: "Orange", hex: "#EA580C" },
  { key: "amber", label: "Amber", hex: "#B4730B" },
  { key: "green", label: "Green", hex: "#16A34A" },
  { key: "cyan", label: "Cyan", hex: "#0891B2" },
  { key: "red", label: "Red", hex: "#DC2626" },
  { key: "slate", label: "Slate", hex: "#64748B" },
];

const BY_KEY = new Map(PROJECT_COLORS.map((c) => [c.key, c.hex]));
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** True for a value that is one of the curated palette keys. */
export function isProjectColorKey(value: string): value is ProjectColorKey {
  return BY_KEY.has(value as ProjectColorKey);
}

/**
 * Normalize a value for STORAGE on write. We only persist curated palette keys
 * from the picker; anything else (unknown, empty) becomes null = neutral.
 */
export function normalizeStoredColor(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return isProjectColorKey(raw) ? raw : null;
}

/** Resolve a stored color (palette key | #hex | null) to a base hex, or null. */
export function resolveProjectColor(color: string | null | undefined): string | null {
  if (!color) return null;
  const fromKey = BY_KEY.get(color as ProjectColorKey);
  if (fromKey) return fromKey;
  return HEX_RE.test(color) ? color : null;
}

/**
 * Inline style publishing the base as the `--proj` custom property the CSS tint
 * derivations read. Returns undefined when unset, so the element falls back to
 * the neutral `--proj` declared on :root. (Custom properties aren't in the
 * CSSProperties type, hence the cast — still fully typed, no `any`.)
 */
export function projectColorVars(
  color: string | null | undefined,
): CSSProperties | undefined {
  const hex = resolveProjectColor(color);
  return hex ? ({ "--proj": hex } as CSSProperties) : undefined;
}
