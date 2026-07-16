import type { Extension, Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";

/**
 * First-class task checkboxes: `- [ ]` renders as a real checkbox that stays
 * interactive even on the active line — the raw `[ ]` only reveals when a
 * selection endpoint sits inside the marker itself. Toggling edits the exact
 * document positions of the marker via the syntax tree (never string
 * replacement), so the right instance flips no matter how many identical
 * lines the note has.
 */

class TaskWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  override eq(other: TaskWidget): boolean {
    return other.checked === this.checked;
  }
  toDOM(): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "cm-md-task" + (this.checked ? " cm-md-task-done" : "");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "cm-md-task-box";
    box.checked = this.checked;
    // Perceivable + operable for assistive tech: a native checkbox carries
    // role=checkbox + checked state; the label names it. (Not aria-hidden any
    // more — a screen reader must announce "task, checked/unchecked".)
    box.setAttribute("aria-label", this.checked ? "Task, done" : "Task, to do");
    box.tabIndex = -1;
    wrap.appendChild(box);
    return wrap;
  }
  override ignoreEvent(): boolean {
    // Let events reach the editor; the mousedown handler below owns toggling.
    return false;
  }
}

const doneLine = Decoration.line({ class: "cm-md-done" });

function build(view: EditorView): {
  widgets: DecorationSet;
  all: DecorationSet;
} {
  const { state } = view;
  const widgetRanges: Range<Decoration>[] = [];
  const lineRanges: Range<Decoration>[] = [];
  const selectionInside = (from: number, to: number) =>
    state.selection.ranges.some((r) => r.to > from && r.from < to);

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== "TaskMarker") return;
        const checked =
          state.sliceDoc(node.from + 1, node.to - 1).toLowerCase() === "x";
        if (checked)
          lineRanges.push(doneLine.range(state.doc.lineAt(node.from).from));
        if (!selectionInside(node.from, node.to))
          widgetRanges.push(
            Decoration.replace({ widget: new TaskWidget(checked) }).range(
              node.from,
              node.to,
            ),
          );
      },
    });
  }

  const widgets = Decoration.set(widgetRanges, true);
  return {
    widgets,
    all: Decoration.set([...widgetRanges, ...lineRanges], true),
  };
}

class TaskCheckboxes {
  /** Widget replaces only — these double as the atomic ranges. */
  widgets: DecorationSet = Decoration.none;
  decorations: DecorationSet = Decoration.none;

  constructor(view: EditorView) {
    this.rebuild(view);
  }
  rebuild(view: EditorView) {
    const { widgets, all } = build(view);
    this.widgets = widgets;
    this.decorations = all;
  }
  update(update: ViewUpdate) {
    if (update.docChanged && update.view.composing) {
      this.widgets = this.widgets.map(update.changes);
      this.decorations = this.decorations.map(update.changes);
      return;
    }
    if (
      update.docChanged ||
      update.selectionSet ||
      update.viewportChanged ||
      syntaxTree(update.state) !== syntaxTree(update.startState)
    )
      this.rebuild(update.view);
  }
}

const taskPlugin = ViewPlugin.fromClass(TaskCheckboxes, {
  decorations: (v) => v.decorations,
  provide: (plugin) =>
    EditorView.atomicRanges.of(
      (view) => view.plugin(plugin)?.widgets ?? Decoration.none,
    ),
});

export type CheckboxToggleInfo = { lineNumber: number; checked: boolean };

/** Flip the task marker containing/starting at `pos`. Position-based edit. */
function toggleTaskAt(
  view: EditorView,
  pos: number,
  onToggle?: (info: CheckboxToggleInfo) => void,
): boolean {
  let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(pos, 1);
  let marker: SyntaxNode | null = node.name === "TaskMarker" ? node : null;
  if (!marker) {
    while (node && node.name !== "Task") node = node.parent;
    marker = node?.getChild("TaskMarker") ?? null;
  }
  if (!marker || marker.to - marker.from < 3) return false;

  const wasChecked =
    view.state.sliceDoc(marker.from + 1, marker.to - 1).toLowerCase() === "x";
  view.dispatch({
    changes: {
      from: marker.from + 1,
      to: marker.to - 1,
      insert: wasChecked ? " " : "x",
    },
    userEvent: "input",
  });
  onToggle?.({
    lineNumber: view.state.doc.lineAt(marker.from).number,
    checked: !wasChecked,
  });
  return true;
}

export function checkboxes(opts: {
  onToggle?: (info: CheckboxToggleInfo) => void;
}): Extension {
  const isBox = (t: EventTarget | null): t is HTMLInputElement =>
    t instanceof HTMLInputElement && t.classList.contains("cm-md-task-box");
  return [
    taskPlugin,
    EditorView.domEventHandlers({
      // mousedown drives pointer toggles (and keeps the caret out of the
      // widget). `click` covers assistive-tech / keyboard activation, which
      // fires a SYNTHETIC click (event.detail === 0) but no mousedown — the
      // detail guard skips a real mouse's follow-up click so it can't double-
      // toggle the freshly-rebuilt widget.
      mousedown(event, view) {
        if (!isBox(event.target)) return false;
        event.preventDefault();
        return toggleTaskAt(view, view.posAtDOM(event.target), opts.onToggle);
      },
      click(event, view) {
        if (event.detail !== 0 || !isBox(event.target)) return false;
        event.preventDefault();
        return toggleTaskAt(view, view.posAtDOM(event.target), opts.onToggle);
      },
    }),
  ];
}
