/**
 * Per-project color system — the platform-agnostic core (Projects redesign
 * PART 1). ONE base color is stored per project (`projects.color` = a curated
 * palette key, a raw #hex, or null). The base only ever paints dots, ~3px
 * edges, and pale tags — priority chips (A/B/C/D) stay the only saturated color.
 *
 * Web derives every tint via CSS `color-mix` off the base (its `projectColorVars`
 * helper stays in apps/web/lib/colors.ts, since it returns CSSProperties). This
 * module holds only the pure palette + resolver so mobile can render a quiet dot
 * from the base hex (React Native has no `color-mix`; a dot only needs the base).
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
