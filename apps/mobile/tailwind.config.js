/** @type {import('tailwindcss').Config} */
// Theme values come from the GENERATED preset — single source of truth:
// packages/shared/src/design/tokens.ts, rendered by `npm run tokens` at the
// repo root. Do NOT add colors/radii here; add tokens in shared and regenerate.
//
// Root invariant (matches web): priority chips A–D are the ONLY saturated
// color; `accent` is monochrome; project colors stay quiet (dots/edges/tints).
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [
    require("nativewind/preset"),
    require("./tailwind-preset.generated"),
  ],
  plugins: [],
};
