import type { CSSProperties } from "react";
import { resolveProjectColor } from "@second-brain/shared/domain/colors";

/**
 * Per-project color system (Projects redesign, PART 1).
 *
 * The palette + pure resolver now live in @second-brain/shared/domain/colors so
 * the mobile app shares them (re-exported below, all import sites unchanged).
 * Only `projectColorVars` stays here — it returns CSSProperties, web-specific.
 *
 * ONE base color is stored per project; every tint is DERIVED in the UI via CSS
 * `color-mix` off that base — a single stored value adapts to light and dark.
 * The base only ever paints dots, ~3px edges, and pale tags; priority chips
 * (A/B/C/D) stay the only saturated color.
 */
export {
  type ProjectColorKey,
  PROJECT_COLORS,
  isProjectColorKey,
  normalizeStoredColor,
  resolveProjectColor,
} from "@second-brain/shared/domain/colors";

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
