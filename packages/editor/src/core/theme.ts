import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/**
 * Token-driven theme. Every color/weight references the SHORT design-token
 * CSS variables that exist identically on web (globals.css) and in the future
 * WebView mount (injected :root vars) — never verbose web-only aliases. Each
 * var carries a literal light-theme fallback so the editor degrades sanely
 * outside the app shell; dark mode arrives through the vars, not media queries.
 */

const MONO_STACK =
  "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace";

const baseTheme = EditorView.theme({
  "&": {
    color: "var(--fg, #18181b)",
    backgroundColor: "transparent",
    fontSize: "1rem",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-sans, 'Geist', -apple-system, system-ui, sans-serif)",
    lineHeight: "1.65",
  },
  ".cm-content": {
    padding: "0",
    caretColor: "var(--fg, #18181b)",
  },
  ".cm-line": {
    padding: "1px 0",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--fg, #18181b)",
  },
  ".cm-placeholder": {
    color: "var(--fg-muted, #71717a)",
  },

  // --- live-preview structure (classes emitted by live-preview.ts) ---------
  ".cm-line.cm-md-h1": { paddingTop: "0.55em", paddingBottom: "0.15em" },
  ".cm-line.cm-md-h2": { paddingTop: "0.45em", paddingBottom: "0.1em" },
  ".cm-line.cm-md-h3": { paddingTop: "0.35em" },
  ".cm-line.cm-md-h4, .cm-line.cm-md-h5, .cm-line.cm-md-h6": {
    paddingTop: "0.25em",
  },
  ".cm-line.cm-md-quote": {
    borderLeft: "2px solid var(--border-2, #d4d4d8)",
    paddingLeft: "0.75rem",
  },
  ".cm-md-bullet": {
    color: "var(--fg-muted, #71717a)",
  },
  ".cm-md-hr": {
    display: "inline-block",
    width: "100%",
    verticalAlign: "middle",
    borderTop: "0.5px solid var(--border-2, #d4d4d8)",
  },
  ".cm-md-code": {
    backgroundColor: "var(--surface-2, #f4f4f5)",
    borderRadius: "4px",
    padding: "1px 4px",
  },
  // Task checkboxes: padding + negative margin grow the hit target without
  // disturbing text layout ("generous hit areas" is part of the editor spec).
  ".cm-md-task": {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 6px 4px 3px",
    margin: "-4px -5px -4px -3px",
    cursor: "pointer",
    verticalAlign: "baseline",
  },
  ".cm-md-task-box": {
    width: "0.9em",
    height: "0.9em",
    margin: "0",
    cursor: "pointer",
    accentColor: "var(--accent, #18181b)",
  },
  ".cm-line.cm-md-done": {
    color: "var(--fg-muted, #71717a)",
  },
  // Fenced code blocks: recessed mono band; the fence rows become quiet
  // padding when the markers are hidden (selection outside the block).
  ".cm-line.cm-md-codeblock": {
    backgroundColor: "var(--surface-2, #f4f4f5)",
    fontFamily: MONO_STACK,
    fontSize: "0.875em",
    padding: "1px 10px",
  },
  ".cm-line.cm-md-codeblock-first": {
    borderRadius: "6px 6px 0 0",
    paddingTop: "4px",
  },
  ".cm-line.cm-md-codeblock-last": {
    borderRadius: "0 0 6px 6px",
    paddingBottom: "4px",
  },
  // Tables: rendered widget (hairlines, quiet header) when not editing…
  ".cm-md-table": {
    padding: "2px 0",
    cursor: "pointer",
    overflowX: "auto",
  },
  ".cm-md-table table": {
    borderCollapse: "collapse",
    fontSize: "0.9375rem",
  },
  ".cm-md-table th, .cm-md-table td": {
    border: "0.5px solid var(--border-2, #d4d4d8)",
    padding: "4px 10px",
    textAlign: "left",
  },
  ".cm-md-table th": {
    fontWeight: "var(--fw-label, 550)",
    backgroundColor: "var(--surface-2, #f4f4f5)",
  },
  // …and aligned mono source while the selection is inside.
  ".cm-line.cm-md-tablesrc": {
    fontFamily: MONO_STACK,
    fontSize: "0.875em",
  },
});

/** Inline markdown styling by syntax-tree highlight tags. Sizing headings here
 *  (on the text spans) is what makes them "render at size" even before the
 *  live-preview decorations add per-line classes. */
const mdHighlight = HighlightStyle.define([
  {
    tag: t.heading1,
    fontSize: "1.5rem",
    fontWeight: "var(--fw-heading, 600)",
    lineHeight: "1.3",
  },
  {
    tag: t.heading2,
    fontSize: "1.25rem",
    fontWeight: "var(--fw-heading, 600)",
    lineHeight: "1.35",
  },
  {
    tag: t.heading3,
    fontSize: "1.125rem",
    fontWeight: "var(--fw-heading, 600)",
    lineHeight: "1.4",
  },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: "var(--fw-heading, 600)" },
  { tag: t.strong, fontWeight: "650" },
  { tag: t.emphasis, fontStyle: "italic" },
  {
    tag: t.strikethrough,
    textDecoration: "line-through",
    color: "var(--fg-muted, #71717a)",
  },
  {
    tag: t.monospace,
    fontFamily: MONO_STACK,
    fontSize: "0.875em",
  },
  {
    tag: t.link,
    color: "var(--info, #2563eb)",
    textDecoration: "underline",
    textUnderlineOffset: "2px",
  },
  { tag: t.url, color: "var(--fg-muted, #71717a)" },
  { tag: t.quote, color: "var(--fg-secondary, #52525b)" },
  // Syntax marks (#, *, `, >, [](), list bullets…) — quiet until the
  // live-preview layer hides them off the active line entirely.
  { tag: [t.processingInstruction, t.meta], color: "var(--fg-muted, #71717a)" },
  { tag: t.contentSeparator, color: "var(--fg-muted, #71717a)" },
]);

export const editorTheme: Extension = [baseTheme, syntaxHighlighting(mdHighlight)];
