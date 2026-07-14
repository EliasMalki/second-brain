#!/usr/bin/env node
/**
 * Token generator — renders packages/shared/src/design/tokens.ts into every
 * themed artifact so web and mobile can never drift:
 *
 *   1. apps/web/app/globals.css          — the marker-fenced token block
 *      (:root + [data-theme="dark"] + the no-JS @media fallback). The template
 *      below reproduces the hand-written block byte-for-byte, comments and all;
 *      only the values are interpolated.
 *   2. apps/mobile/src/global.css        — the marker-fenced token block
 *      (:root + @media(prefers-color-scheme: dark)) NativeWind resolves.
 *   3. apps/mobile/tailwind-preset.generated.js — Tailwind preset mapping
 *      class names -> var(--token), plus the project palette from
 *      src/domain/colors.ts and shared radii.
 *
 * Usage (repo root):  npm run tokens          — rewrite the three outputs
 *                     npm run tokens:check    — exit 1 if any output is stale
 *
 * tokens.ts is TypeScript; this script transpiles it in-memory with the repo's
 * own `typescript` package (no build step, no experimental node flags).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const WEB_CSS = join(ROOT, "apps", "web", "app", "globals.css");
const MOBILE_CSS = join(ROOT, "apps", "mobile", "src", "global.css");
const MOBILE_PRESET = join(
  ROOT,
  "apps",
  "mobile",
  "tailwind-preset.generated.js",
);

const START =
  "/* @generated-tokens:start — edit packages/shared/src/design/tokens.ts, then `npm run tokens` */";
const END = "/* @generated-tokens:end */";

/** Transpile a self-contained .ts module in memory and import it. */
async function loadTsModule(path) {
  const src = readFileSync(path, "utf8");
  const js = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import("data:text/javascript;charset=utf-8," + encodeURIComponent(js));
}

const { COLORS, RADII, SPACE, TEXT, FW } = await loadTsModule(
  join(HERE, "..", "src", "design", "tokens.ts"),
);
const { PROJECT_COLORS } = await loadTsModule(
  join(HERE, "..", "src", "domain", "colors.ts"),
);

const L = Object.fromEntries(
  Object.entries(COLORS).map(([k, t]) => [k, t.light]),
);
const D = Object.fromEntries(
  Object.entries(COLORS).map(([k, t]) => [k, t.dark]),
);

/* ---------------------------------------------------------------------------
   1. Web block — byte-identical to the long-standing hand-written block in
   apps/web/app/globals.css (values interpolated, prose preserved).
--------------------------------------------------------------------------- */
const webBlock = `:root {
  /* light is the default; native form controls / scrollbars follow it */
  color-scheme: light;

  /* color */
  --bg: ${L.bg};
  --surface: ${L.surface};
  --fg: ${L.fg};
  --fg-muted: ${L["fg-muted"]};
  --border: ${L.border};
  --accent: ${L.accent};
  --accent-fg: ${L["accent-fg"]};
  --danger: ${L.danger};
  --danger-bg: ${L["danger-bg"]};
  /* solid destructive fill (delete-modal header + confirm button); always paired
     with a light foreground. Has a dark override so it adapts to the theme. */
  --danger-solid: ${L["danger-solid"]};
  --ok: ${L.ok};
  --ok-bg: ${L["ok-bg"]};
  /* Done-pill: --ok-solid is the saturated confirm fill (paired with white fg,
     the deliberate green exception mirroring --danger-solid); --ok-bd is the
     soft green border on the pale hover pill. Declared in all three theme blocks. */
  --ok-solid: ${L["ok-solid"]};
  --ok-bd: ${L["ok-bd"]};
  /* frosted-glass specular highlight (composer). Dimmed in dark so it isn't an
     over-bright white top edge. Declared in all three theme blocks. */
  --sheen: ${L.sheen};
  --warn: ${L.warn};
  --warn-bg: ${L["warn-bg"]};
  --info: ${L.info};
  --info-bg: ${L["info-bg"]};

  /* per-project color: components set --proj inline (from projects.color) and
     derive every tint from it via color-mix; unset projects fall back to this
     neutral gray. Light + dark both adapt because the mixes reference --surface
     / --fg. The base only ever paints dots, ~3px edges, and pale tags — never a
     filled surface; priority chips stay the only saturated color. */
  --proj: var(--color-text-tertiary);

  /* mockup token set (aliases) — verbose names the new components reference */
  --color-background-primary: var(--surface);
  --color-background-secondary: ${L["surface-2"]};
  --color-background-tertiary: ${L["surface-3"]};
  --color-text-primary: var(--fg);
  --color-text-secondary: ${L["fg-secondary"]};
  --color-text-tertiary: var(--fg-muted);
  --color-border-secondary: ${L["border-2"]};
  --color-border-tertiary: var(--border);
  --color-background-danger: var(--danger-bg);
  --color-text-danger: var(--danger);
  --color-background-warning: var(--warn-bg);
  --color-text-warning: var(--warn);
  --color-background-info: var(--info-bg);
  --color-text-info: var(--info);
  --color-background-success: var(--ok-bg);
  --color-text-success: var(--ok);
  --border-radius-md: ${RADII.md};
  --border-radius-lg: ${RADII.lg};

  /* command-center accent (monochrome) — the ONE near-black/white accent the
     Home + Tasks redesign uses for filled buttons, active segments, rings, and
     board dots. Priority chips stay the only saturated color; this is neutral.
     The .home2/.tasks2 scopes redefine identical values locally, so these are
     for shared chrome (the header theme toggle, future command-center bits). */
  --tech: ${L.tech};
  --tech-press: ${L["tech-press"]};
  --tech-fg: ${L["tech-fg"]};
  --tech-soft: var(--color-background-secondary);
  --lift: ${L.lift};

  /* shape & space */
  --radius: ${RADII.DEFAULT};
  --radius-sm: ${RADII.sm};
  --space-1: ${SPACE["1"]};
  --space-2: ${SPACE["2"]};
  --space-3: ${SPACE["3"]};
  --space-4: ${SPACE["4"]};
  --space-6: ${SPACE["6"]};
  --space-8: ${SPACE["8"]};

  /* layout — content fills the pane up to this cap, then centers (so pages are
     responsive on normal screens and don't get absurdly wide on big monitors).
     The composer column shares it so its edges line up with the content. */
  --content-max: 88rem;

  /* type — ONE family app-wide: Geist (loaded via next/font in the root layout,
     exposed as --font-geist). No second font, no mono face; figures that read as
     "mono" in the command-center design are Geist tabular numerals. */
  --font-sans:
    var(--font-geist-sans), -apple-system, BlinkMacSystemFont, "Segoe UI",
    Roboto, Helvetica, Arial, sans-serif;
  --text-sm: ${TEXT.sm};
  --text-base: ${TEXT.base};
  --text-lg: ${TEXT.lg};
  --text-xl: ${TEXT.xl};

  /* type-weight scale — every text weight derives from these tokens, so the one
     --fw-offset shifts the WHOLE site lighter/bolder. The Settings "Text weight"
     slider sets --fw-offset on <html>; the head script in layout.tsx seeds it
     before first paint (same anti-flash pattern as the theme). offset 0 = the
     sharp default. */
  --fw-offset: 0;
  --fw-heading: calc(${FW.heading} + var(--fw-offset));
  --fw-label: calc(${FW.label} + var(--fw-offset));
  --fw-title: calc(${FW.title} + var(--fw-offset));
  --fw-chip: calc(${FW.chip} + var(--fw-offset));
  --fw-numeral: calc(${FW.numeral} + var(--fw-offset));
  --fw-body: calc(${FW.body} + var(--fw-offset));
}

/* Dark palette. Two entry points share one declaration set (kept in sync by
   hand — the standard, bulletproof pattern):
     1. :root[data-theme="dark"]  — set by the inline head script when the user
        picks Dark, or picks System and the OS is dark. This is authoritative.
     2. the media query below      — a no-JS fallback that follows the OS *only*
        when no explicit preference has been written to <html>.
   The Appearance toggle is driven entirely by (1). */
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: ${D.bg};
  --surface: ${D.surface};
  --fg: ${D.fg};
  --fg-muted: ${D["fg-muted"]};
  --border: ${D.border};
  --accent: ${D.accent};
  --accent-fg: ${D["accent-fg"]};
  --danger: ${D.danger};
  --danger-bg: ${D["danger-bg"]};
  --danger-solid: ${D["danger-solid"]};
  --ok: ${D.ok};
  --ok-bg: ${D["ok-bg"]};
  --ok-solid: ${D["ok-solid"]};
  --ok-bd: ${D["ok-bd"]};
  --sheen: ${D.sheen};
  --warn: ${D.warn};
  --warn-bg: ${D["warn-bg"]};
  --info: ${D.info};
  --info-bg: ${D["info-bg"]};

  /* dark overrides for the hardcoded mockup aliases (the var()-based ones
     inherit automatically from --surface / --fg / --border above) */
  --color-background-secondary: ${D["surface-2"]};
  --color-background-tertiary: ${D["surface-3"]};
  --color-text-secondary: ${D["fg-secondary"]};
  --color-border-secondary: ${D["border-2"]};

  /* command-center accent inverts in dark: near-white fill on near-black text */
  --tech: ${D.tech};
  --tech-press: ${D["tech-press"]};
  --tech-fg: ${D["tech-fg"]};
  --tech-soft: var(--color-background-tertiary);
  --lift: ${D.lift};
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    color-scheme: dark;
    --bg: ${D.bg};
    --surface: ${D.surface};
    --fg: ${D.fg};
    --fg-muted: ${D["fg-muted"]};
    --border: ${D.border};
    --accent: ${D.accent};
    --accent-fg: ${D["accent-fg"]};
    --danger: ${D.danger};
    --danger-bg: ${D["danger-bg"]};
    --ok: ${D.ok};
    --ok-bg: ${D["ok-bg"]};
    --ok-solid: ${D["ok-solid"]};
    --ok-bd: ${D["ok-bd"]};
    --sheen: ${D.sheen};
    --warn: ${D.warn};
    --warn-bg: ${D["warn-bg"]};
    --info: ${D.info};
    --info-bg: ${D["info-bg"]};

    --color-background-secondary: ${D["surface-2"]};
    --color-background-tertiary: ${D["surface-3"]};
    --color-text-secondary: ${D["fg-secondary"]};
    --color-border-secondary: ${D["border-2"]};

    --tech: ${D.tech};
    --tech-press: ${D["tech-press"]};
    --tech-fg: ${D["tech-fg"]};
    --tech-soft: var(--color-background-tertiary);
    --lift: ${D.lift};
  }
}`;
// NOTE the @media fallback block above deliberately has NO --danger-solid line —
// the long-standing web quirk encoded as omitFromWebMediaFallback in tokens.ts.

/* ---------------------------------------------------------------------------
   2. Mobile block — :root + @media(prefers-color-scheme: dark).
--------------------------------------------------------------------------- */
const mobileKeys = Object.keys(COLORS).filter((k) => !COLORS[k].webOnly);
const mobileBlock = `:root {
${mobileKeys.map((k) => `  --${k}: ${L[k]};`).join("\n")}
}

@media (prefers-color-scheme: dark) {
  :root {
${mobileKeys.map((k) => `    --${k}: ${D[k]};`).join("\n")}
  }
}`;

/* ---------------------------------------------------------------------------
   3. Mobile Tailwind preset.
--------------------------------------------------------------------------- */
const colorEntries = [
  ...mobileKeys.map((k) => `        "${k}": "var(--${k})",`),
  ...PROJECT_COLORS.map((c) => `        "proj-${c.key}": "${c.hex}",`),
].join("\n");

const preset = `/**
 * GENERATED by packages/shared/scripts/generate-tokens.mjs — do not edit.
 * Source of truth: packages/shared/src/design/tokens.ts (+ domain/colors.ts
 * for the project palette). Regenerate with \`npm run tokens\` at the repo root.
 */
module.exports = {
  theme: {
    extend: {
      colors: {
${colorEntries}
      },
      borderRadius: {
${Object.entries(RADII)
  .map(([k, v]) => `        ${k === "DEFAULT" ? "DEFAULT" : `"${k}"`}: "${v}",`)
  .join("\n")}
      },
    },
  },
};
`;

/* ---------------------------------------------------------------------------
   Write / check
--------------------------------------------------------------------------- */
function spliced(file, block) {
  const cur = readFileSync(file, "utf8");
  const s = cur.indexOf(START);
  const e = cur.indexOf(END);
  if (s === -1 || e === -1 || e < s) {
    throw new Error(
      `${relative(ROOT, file)}: missing @generated-tokens markers`,
    );
  }
  return {
    cur,
    next: cur.slice(0, s + START.length) + "\n" + block + "\n" + cur.slice(e),
  };
}

const check = process.argv.includes("--check");
const outputs = [
  { file: WEB_CSS, ...spliced(WEB_CSS, webBlock) },
  { file: MOBILE_CSS, ...spliced(MOBILE_CSS, mobileBlock) },
  { file: MOBILE_PRESET, cur: readCurrent(MOBILE_PRESET), next: preset },
];

function readCurrent(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

const stale = outputs.filter((o) => o.cur !== o.next);
if (check) {
  if (stale.length > 0) {
    console.error(
      `tokens:check FAILED — stale generated tokens in:\n${stale
        .map((o) => `  ${relative(ROOT, o.file)}`)
        .join("\n")}\nRun \`npm run tokens\` and commit the result.`,
    );
    process.exit(1);
  }
  console.log("tokens:check ok");
} else {
  for (const o of stale) {
    writeFileSync(o.file, o.next);
    console.log(`wrote ${relative(ROOT, o.file)}`);
  }
  if (stale.length === 0) console.log("tokens: all outputs already current");
}
