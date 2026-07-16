import { EditorSelection, type ChangeSpec } from "@codemirror/state";
import { type Command, EditorView, type KeyBinding } from "@codemirror/view";
import { redo, undo } from "@codemirror/commands";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import type { EditorCommand } from "./types";

/**
 * Formatting commands. Every command is syntax-tree-aware: toggles unwrap the
 * existing node instead of blindly re-wrapping, and list/task edits rewrite
 * exact line prefixes. All are plain `Command`s so the web keymap and the
 * mobile accessory bar dispatch the identical code path (handle.exec()).
 */

/** Wrap the selection in `mark`, or unwrap when already inside `nodeNames`. */
function toggleInline(mark: string, nodeNames: string[]): Command {
  return (view: EditorView) => {
    const { state } = view;
    const spec = state.changeByRange((range) => {
      let node: SyntaxNode | null = syntaxTree(state).resolveInner(
        range.from,
        range.empty ? -1 : 1,
      );
      while (node && !nodeNames.includes(node.name)) node = node.parent;

      const first = node?.firstChild;
      const last = node?.lastChild;
      if (node && first && last && first !== last) {
        // Unwrap: drop the opening and closing marks.
        const shift = first.to - first.from;
        return {
          changes: [
            { from: first.from, to: first.to },
            { from: last.from, to: last.to },
          ] satisfies ChangeSpec[],
          range: EditorSelection.range(
            Math.max(node.from, range.from - shift),
            Math.max(node.from, range.to - shift),
          ),
        };
      }
      return {
        changes: [
          { from: range.from, insert: mark },
          { from: range.to, insert: mark },
        ] satisfies ChangeSpec[],
        range: EditorSelection.range(
          range.from + mark.length,
          range.to + mark.length,
        ),
      };
    });
    view.dispatch(spec, { userEvent: "input" });
    return true;
  };
}

/** Every distinct doc line any selection range touches, in order. */
function selectedLines(view: EditorView) {
  const { doc } = view.state;
  const seen = new Set<number>();
  const lines = [];
  for (const range of view.state.selection.ranges) {
    const from = doc.lineAt(range.from).number;
    const to = doc.lineAt(range.to).number;
    for (let n = from; n <= to; n++) {
      if (!seen.has(n)) {
        seen.add(n);
        lines.push(doc.line(n));
      }
    }
  }
  return lines;
}

const HEADING_RE = /^(#{1,6})\s+/;
const LIST_RE = /^(\s*)([-*+])\s+(\[[ xX]\]\s+)?/;
const ORDERED_RE = /^(\s*)\d+[.)]\s+/;

/** Set the line(s) to ATX heading `level`; same level again toggles it off. */
function setHeading(level: number): Command {
  return (view) => {
    const changes: ChangeSpec[] = [];
    for (const line of selectedLines(view)) {
      const m = HEADING_RE.exec(line.text);
      const prefix = "#".repeat(level) + " ";
      if (m && m[1].length === level) {
        changes.push({ from: line.from, to: line.from + m[0].length });
      } else if (m) {
        changes.push({
          from: line.from,
          to: line.from + m[0].length,
          insert: prefix,
        });
      } else {
        changes.push({ from: line.from, insert: prefix });
      }
    }
    view.dispatch({ changes, userEvent: "input" });
    return true;
  };
}

/** `- ` on/off for the selected lines (a task line loses its whole marker). */
const toggleBulletList: Command = (view) => {
  const changes: ChangeSpec[] = [];
  for (const line of selectedLines(view)) {
    if (line.length === 0) continue;
    const m = LIST_RE.exec(line.text);
    if (m) {
      changes.push({ from: line.from + m[1].length, to: line.from + m[0].length });
    } else {
      const o = ORDERED_RE.exec(line.text);
      if (o)
        changes.push({
          from: line.from + o[1].length,
          to: line.from + o[0].length,
          insert: "- ",
        });
      else {
        const indent = /^\s*/.exec(line.text)![0].length;
        changes.push({ from: line.from + indent, insert: "- " });
      }
    }
  }
  if (changes.length === 0) return false;
  view.dispatch({ changes, userEvent: "input" });
  return true;
};

/** Make the line(s) a task (`- [ ] `), or flip an existing task's state. */
const toggleTask: Command = (view) => {
  const changes: ChangeSpec[] = [];
  for (const line of selectedLines(view)) {
    if (line.length === 0) continue;
    const m = LIST_RE.exec(line.text);
    if (m && m[3]) {
      // Already a task → flip. The state char sits right after `[`.
      const boxStart = line.from + m[1].length + m[2].length + 1 + 1;
      const cur = line.text.charAt(boxStart - line.from);
      changes.push({
        from: boxStart,
        to: boxStart + 1,
        insert: cur === " " ? "x" : " ",
      });
    } else if (m) {
      // Bullet → task: add the box after the marker.
      changes.push({ from: line.from + m[0].length, insert: "[ ] " });
    } else {
      const indent = /^\s*/.exec(line.text)![0].length;
      changes.push({ from: line.from + indent, insert: "- [ ] " });
    }
  }
  if (changes.length === 0) return false;
  view.dispatch({ changes, userEvent: "input" });
  return true;
};

/** Is this line part of a list item? (drives Tab/Shift-Tab hijacking) */
function inList(view: EditorView, linePos: number): boolean {
  let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(linePos, 1);
  while (node) {
    if (node.name === "ListItem") return true;
    node = node.parent;
  }
  return false;
}

const INDENT = "  ";

/** Indent/outdent list lines by two spaces. Returns false outside lists so
 *  Tab keeps its default meaning (a deliberate a11y escape valve). */
function listIndent(add: boolean): Command {
  return (view) => {
    const lines = selectedLines(view);
    if (!lines.some((l) => inList(view, l.from))) return false;
    const changes: ChangeSpec[] = [];
    for (const line of lines) {
      if (add) changes.push({ from: line.from, insert: INDENT });
      else if (line.text.startsWith(INDENT))
        changes.push({ from: line.from, to: line.from + INDENT.length });
      else if (line.text.startsWith(" ") || line.text.startsWith("\t"))
        changes.push({ from: line.from, to: line.from + 1 });
    }
    if (changes.length === 0) return false;
    view.dispatch({ changes, userEvent: "input" });
    return true;
  };
}

/** `[selection](url)` with the placeholder url selected for pasting over. */
const insertLink: Command = (view) => {
  const spec = view.state.changeByRange((range) => {
    const text = view.state.sliceDoc(range.from, range.to);
    const insert = `[${text}](url)`;
    const urlStart = range.from + 1 + text.length + 2;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.range(urlStart, urlStart + 3),
    };
  });
  view.dispatch(spec, { userEvent: "input" });
  return true;
};

export const COMMANDS: Record<EditorCommand, Command> = {
  bold: toggleInline("**", ["StrongEmphasis"]),
  italic: toggleInline("*", ["Emphasis"]),
  strikethrough: toggleInline("~~", ["Strikethrough"]),
  code: toggleInline("`", ["InlineCode"]),
  link: insertLink,
  "heading-1": setHeading(1),
  "heading-2": setHeading(2),
  "heading-3": setHeading(3),
  "bullet-list": toggleBulletList,
  task: toggleTask,
  indent: listIndent(true),
  outdent: listIndent(false),
  undo,
  redo,
};

/** The formatting keymap (both platforms — hardware keyboards exist on iPad;
 *  mobile's accessory bar goes through exec() → the same COMMANDS). */
export function formattingKeymap(): KeyBinding[] {
  return [
    { key: "Mod-b", run: COMMANDS.bold },
    { key: "Mod-i", run: COMMANDS.italic },
    { key: "Mod-Shift-x", run: COMMANDS.strikethrough },
    { key: "Mod-e", run: COMMANDS.code },
    { key: "Mod-k", run: COMMANDS.link },
    { key: "Mod-Shift-c", run: COMMANDS.task },
    { key: "Mod-Shift-8", run: COMMANDS["bullet-list"] },
    { key: "Mod-Alt-1", run: COMMANDS["heading-1"] },
    { key: "Mod-Alt-2", run: COMMANDS["heading-2"] },
    { key: "Mod-Alt-3", run: COMMANDS["heading-3"] },
    { key: "Tab", run: COMMANDS.indent },
    { key: "Shift-Tab", run: COMMANDS.outdent },
  ];
}
