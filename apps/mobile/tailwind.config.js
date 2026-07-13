/** @type {import('tailwindcss').Config} */
// Design tokens mirror apps/web/app/globals.css. Colors are CSS variables
// defined in src/global.css with a light :root block and a
// @media(prefers-color-scheme: dark) override, so a single class name
// (e.g. `bg-bg`) follows the system theme with no `dark:` duplication.
//
// Root invariant (matches web): priority chips A–D are the ONLY saturated
// color; `accent` is monochrome (near-black in light, near-white in dark);
// project colors stay quiet (dots/edges/tints, never filled surfaces).
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // neutral surfaces + text
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        fg: "var(--fg)",
        "fg-secondary": "var(--fg-secondary)",
        "fg-muted": "var(--fg-muted)",
        border: "var(--border)",
        "border-2": "var(--border-2)",
        // monochrome accent (inverts by theme)
        accent: "var(--accent)",
        "accent-fg": "var(--accent-fg)",
        // semantic
        ok: "var(--ok)",
        "ok-solid": "var(--ok-solid)",
        danger: "var(--danger)",
        "danger-solid": "var(--danger-solid)",
        warn: "var(--warn)",
        info: "var(--info)",
        // priority chips — the only saturated color (C/D stay neutral)
        "prio-a-bg": "var(--prio-a-bg)",
        "prio-a-fg": "var(--prio-a-fg)",
        "prio-b-bg": "var(--prio-b-bg)",
        "prio-b-fg": "var(--prio-b-fg)",
        // quiet project palette (static hexes from apps/web/lib/colors.ts;
        // web's color-mix tinting stays web-only until a screen needs it)
        "proj-blue": "#2563EB",
        "proj-teal": "#0D9488",
        "proj-violet": "#7C3AED",
        "proj-pink": "#DB2777",
        "proj-orange": "#EA580C",
        "proj-amber": "#B4730B",
        "proj-green": "#16A34A",
        "proj-cyan": "#0891B2",
        "proj-red": "#DC2626",
        "proj-slate": "#64748B",
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "8px",
        lg: "10px",
      },
    },
  },
  plugins: [],
};
