/**
 * Markdown → plaintext, shared by search and the card gallery.
 *
 * `stripMarkdownToText` produces the notes.body_text shadow — LINE-PRESERVING
 * plaintext with a few canonical structural markers kept:
 *
 *   headings   keep their `#` prefixes        (`## Plan` → `## Plan`)
 *   bullets    normalize to `- `              (`* item` → `- item`)
 *   tasks      normalize to `- [ ] `/`- [x] ` (case-folded)
 *   ordered    keep their number              (`2) go` → `2) go`)
 *
 * Everything else strips: emphasis/code/strike markers, link + image syntax
 * (text/alt kept), blockquote `>`, fence lines (code text kept), table rows
 * become their cell text. The markers are search-neutral — to_tsvector
 * ignores punctuation — but they let `deriveNotePreview` rebuild line
 * structure for note cards without re-parsing markdown. Both consumers rely
 * on this contract; change it in lockstep.
 *
 * Keep this module IMPORT-FREE: the backfill script (scripts/
 * backfill-body-text.mjs) loads it standalone via in-memory transpile, the
 * same way the token generator loads tokens.ts.
 */

const FENCE_RE = /^\s*(```|~~~)/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const LIST_RE = /^(\s*)([-*+])\s+(?:\[([ xX])\]\s*)?(.*)$/;
const ORDERED_RE = /^(\s*)(\d+[.)])\s+(.*)$/;
const HR_RE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const TABLE_ROW_RE = /^\s*\|.*\|?\s*$/;
const TABLE_DELIM_RE = /^\s*\|?[\s\-:|]+\|?\s*$/;

/** Strip inline markdown, keeping the human-readable text. */
function stripInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images → alt text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → text
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/(\*\*|__)(.+?)\1/g, "$2") // bold
    .replace(/([*_])(?=\S)(.+?)(?<=\S)\1/g, "$2") // italic
    .replace(/~~(.+?)~~/g, "$1") // strikethrough
    .replace(/<\/?[a-zA-Z][^>]*>/g, "") // stray inline HTML
    .trimEnd();
}

export function stripMarkdownToText(md: string): string {
  const out: string[] = [];
  let inFence = false;
  let lastWasBlank = true; // swallows leading blanks, collapses runs

  for (const raw of md.split("\n")) {
    if (FENCE_RE.test(raw)) {
      inFence = !inFence;
      continue; // fence lines carry no text
    }
    if (inFence) {
      out.push(raw.trimEnd()); // code text kept verbatim
      lastWasBlank = false;
      continue;
    }

    // Blockquote markers strip; the quoted text stays a normal line.
    let line = raw.replace(/^(\s*>)+\s?/, "");

    if (!line.trim()) {
      if (!lastWasBlank) out.push("");
      lastWasBlank = true;
      continue;
    }
    lastWasBlank = false;

    if (HR_RE.test(line)) {
      lastWasBlank = true; // rules vanish; don't leave a stray blank later
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      out.push(`${heading[1]} ${stripInline(heading[2])}`);
      continue;
    }

    if (TABLE_ROW_RE.test(line)) {
      if (TABLE_DELIM_RE.test(line)) continue; // alignment row
      const cells = line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => stripInline(c.trim()))
        .filter((c) => c.length > 0);
      if (cells.length > 0) out.push(cells.join("  "));
      continue;
    }

    const list = LIST_RE.exec(line);
    if (list) {
      const box =
        list[3] === undefined
          ? ""
          : list[3].toLowerCase() === "x"
            ? "[x] "
            : "[ ] ";
      out.push(`${list[1]}- ${box}${stripInline(list[4])}`);
      continue;
    }

    const ordered = ORDERED_RE.exec(line);
    if (ordered) {
      out.push(`${ordered[1]}${ordered[2]} ${stripInline(ordered[3])}`);
      continue;
    }

    out.push(stripInline(line));
  }

  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

export type PreviewLineKind =
  | "text"
  | "heading"
  | "bullet"
  | "task-open"
  | "task-done";

export type PreviewLine = { text: string; kind: PreviewLineKind };

/**
 * The card preview: real content lines from a note's body_text (pass
 * `note.body_text ?? stripMarkdownToText(note.body)` — the fallback covers
 * rows created before the shadow existed). Blanks drop, list items become
 * their own lines, and the first line is skipped when it just repeats the
 * note's title (with or without a heading marker).
 */
export function deriveNotePreview(
  title: string | null,
  source: string,
  maxLines: number,
): PreviewLine[] {
  const lines: PreviewLine[] = [];
  const titleKey = title?.trim().toLowerCase() || null;
  let first = true;

  for (const raw of source.split("\n")) {
    if (lines.length >= maxLines) break;
    const trimmed = raw.trim();
    if (!trimmed) continue;

    let kind: PreviewLineKind = "text";
    let text = trimmed;

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    const task = /^-\s+\[([ x])\]\s*(.*)$/i.exec(trimmed);
    const bullet = /^-\s+(.*)$/.exec(trimmed);
    if (heading) {
      kind = "heading";
      text = heading[2];
    } else if (task) {
      kind = task[1].toLowerCase() === "x" ? "task-done" : "task-open";
      text = task[2];
    } else if (bullet) {
      kind = "bullet";
      text = bullet[1];
    }

    if (first && titleKey && text.trim().toLowerCase() === titleKey) {
      first = false;
      continue;
    }
    first = false;
    if (text) lines.push({ text, kind });
  }
  return lines;
}
