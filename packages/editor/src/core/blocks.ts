import {
  type EditorState,
  type Extension,
  type Range,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNodeRef } from "@lezer/common";

/**
 * Block-level rendering. This is a StateField, not a ViewPlugin, because
 * CodeMirror requires decorations that affect vertical layout (block widgets,
 * replaces spanning line breaks) to come from state — a view plugin providing
 * them would throw.
 *
 * - Fenced code blocks: every line gets a recessed mono background; the fence
 *   markers (``` + language info) hide while the selection is outside the
 *   block, leaving quiet padding rows.
 * - Tables: rendered as a real hairline <table> widget while the selection is
 *   outside; clicking a cell places the cursor at that cell's source position
 *   and the table reverts to styled mono source for editing.
 */

type Align = "left" | "center" | "right" | null;
type TableCellSpec = { text: string; pos: number };
type TableSpec = {
  header: TableCellSpec[];
  aligns: Align[];
  rows: TableCellSpec[][];
};

class TableWidget extends WidgetType {
  private readonly key: string;
  constructor(readonly spec: TableSpec) {
    super();
    this.key = JSON.stringify(spec);
  }
  override eq(other: TableWidget): boolean {
    return other.key === this.key;
  }
  toDOM(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-md-table";
    const table = document.createElement("table");
    const makeRow = (cells: TableCellSpec[], tag: "th" | "td") => {
      const tr = document.createElement("tr");
      cells.forEach((cell, i) => {
        const el = document.createElement(tag);
        el.textContent = cell.text;
        el.dataset.pos = String(cell.pos);
        const align = this.spec.aligns[i];
        if (align) el.style.textAlign = align;
        tr.appendChild(el);
      });
      return tr;
    };
    const thead = document.createElement("thead");
    thead.appendChild(makeRow(this.spec.header, "th"));
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    for (const row of this.spec.rows) tbody.appendChild(makeRow(row, "td"));
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }
  override ignoreEvent(): boolean {
    // Let mousedown reach the editor handler that maps cell → source pos.
    return false;
  }
}

const codeLine = Decoration.line({ class: "cm-md-codeblock" });
const codeLineFirst = Decoration.line({
  class: "cm-md-codeblock cm-md-codeblock-first",
});
const codeLineLast = Decoration.line({
  class: "cm-md-codeblock cm-md-codeblock-last",
});
const tableSrcLine = Decoration.line({ class: "cm-md-tablesrc" });
const hide = Decoration.replace({});

function parseAligns(delimiterText: string): Align[] {
  return delimiterText
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
    .map((c) => {
      const left = c.startsWith(":");
      const right = c.endsWith(":");
      if (left && right) return "center";
      if (right) return "right";
      if (left) return "left";
      return null;
    });
}

function tableSpec(state: EditorState, table: SyntaxNodeRef): TableSpec | null {
  const node = table.node;
  const header = node.getChild("TableHeader");
  if (!header) return null;
  const cellsOf = (row: typeof node): TableCellSpec[] =>
    row
      .getChildren("TableCell")
      .map((c) => ({ text: state.sliceDoc(c.from, c.to), pos: c.from }));

  const headerCells = cellsOf(header);
  if (headerCells.length === 0) return null;

  // The alignment row is the Table's only direct TableDelimiter child (the
  // in-row pipes belong to TableHeader/TableRow, not to Table itself).
  const delimiterRow = node.getChild("TableDelimiter");
  const aligns: Align[] = delimiterRow
    ? parseAligns(state.sliceDoc(delimiterRow.from, delimiterRow.to))
    : [];
  const rows = node.getChildren("TableRow").map(cellsOf);
  return { header: headerCells, aligns, rows };
}

function selectionTouches(state: EditorState, from: number, to: number) {
  return state.selection.ranges.some((r) => r.to >= from && r.from <= to);
}

function build(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const doc = state.doc;

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === "FencedCode") {
        const active = selectionTouches(state, node.from, node.to);
        const first = doc.lineAt(node.from);
        const last = doc.lineAt(node.to);
        for (let n = first.number; n <= last.number; n++) {
          const line = doc.line(n);
          const deco =
            n === first.number
              ? codeLineFirst
              : n === last.number
                ? codeLineLast
                : codeLine;
          ranges.push(deco.range(line.from));
        }
        if (!active) {
          for (
            let child = node.node.firstChild;
            child;
            child = child.nextSibling
          ) {
            if (child.name === "CodeMark" || child.name === "CodeInfo")
              ranges.push(hide.range(child.from, child.to));
          }
        }
        return false; // children handled here
      }

      if (node.name === "Table") {
        const active = selectionTouches(state, node.from, node.to);
        if (active) {
          const first = doc.lineAt(node.from);
          const last = doc.lineAt(node.to);
          for (let n = first.number; n <= last.number; n++)
            ranges.push(tableSrcLine.range(doc.line(n).from));
        } else {
          const spec = tableSpec(state, node);
          if (spec)
            ranges.push(
              Decoration.replace({
                widget: new TableWidget(spec),
                block: true,
              }).range(node.from, node.to),
            );
        }
        return false;
      }
      return undefined;
    },
  });

  return Decoration.set(ranges, true);
}

const blocksField = StateField.define<DecorationSet>({
  create: build,
  update(deco, tr) {
    if (
      tr.docChanged ||
      tr.selection ||
      syntaxTree(tr.state) !== syntaxTree(tr.startState)
    )
      return build(tr.state);
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Clicking a rendered table places the cursor at the clicked cell's source. */
const tableClicks = EditorView.domEventHandlers({
  mousedown(event, view) {
    const target = event.target as HTMLElement;
    const container = target.closest?.(".cm-md-table");
    if (!container) return false;
    const cell = target.closest?.("[data-pos]") as HTMLElement | null;
    const pos = cell
      ? Number(cell.dataset.pos)
      : view.posAtDOM(container as HTMLElement);
    view.dispatch({ selection: { anchor: pos } });
    view.focus();
    event.preventDefault();
    return true;
  },
});

export function blocks(): Extension {
  return [blocksField, tableClicks];
}
