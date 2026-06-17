"use client";

import { useState } from "react";
import { PROJECT_COLORS, projectColorVars } from "@/lib/colors";

/**
 * Pick-from-set project color picker. A row of curated swatches plus a "neutral"
 * option, radio-style; the selection is mirrored into a hidden input so it rides
 * along in the surrounding form (create / edit). No freeform color input.
 *
 * `onPick` lets a caller react live (the "Change color" shortcut submits on pick
 * instead of waiting for a form save).
 */
export function ColorSwatches({
  name = "color",
  defaultValue = null,
  onPick,
}: {
  name?: string;
  defaultValue?: string | null;
  onPick?: (value: string | null) => void;
}) {
  const [sel, setSel] = useState<string | null>(defaultValue);

  const pick = (value: string | null) => {
    setSel(value);
    onPick?.(value);
  };

  return (
    <div className="swatches" role="radiogroup" aria-label="Project color">
      <input type="hidden" name={name} value={sel ?? ""} />
      <button
        type="button"
        className={"swatch swatch-none" + (sel === null ? " on" : "")}
        onClick={() => pick(null)}
        role="radio"
        aria-checked={sel === null}
        aria-label="Neutral (no color)"
        title="Neutral"
      >
        <i className="ti ti-ban" aria-hidden="true" />
      </button>
      {PROJECT_COLORS.map((c) => (
        <button
          key={c.key}
          type="button"
          className={"swatch" + (sel === c.key ? " on" : "")}
          style={projectColorVars(c.key)}
          onClick={() => pick(c.key)}
          role="radio"
          aria-checked={sel === c.key}
          aria-label={c.label}
          title={c.label}
        />
      ))}
    </div>
  );
}
