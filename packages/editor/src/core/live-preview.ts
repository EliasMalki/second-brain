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
 * The live-preview layer (Obsidian-style): markdown syntax characters are
 * hidden and structure is styled — EXCEPT on any line the selection touches,
 * where the raw markdown reveals for editing. One modeless surface.
 *
 * All decorations here are inline (marks, line classes, single-line replace
 * widgets) so a ViewPlugin is allowed to provide them; anything block-level
 * (tables, code-block structure) lives in blocks.ts as a StateField.
 *
 * IME safety: composition always happens at the cursor, and cursor lines are
 * always revealed, so hide-decorations never churn under a composition. As a
 * belt-and-suspenders guard, while `view.composing` we only remap existing
 * decorations instead of rebuilding.
 */

class BulletWidget extends WidgetType {
  eq(): boolean {
    return true;
  }
  toDOM(): HTMLElement {
    const s = document.createElement("span");
    s.className = "cm-md-bullet";
    s.textContent = "•";
    return s;
  }
  ignoreEvent(): boolean {
    return false;
  }
}

class HrWidget extends WidgetType {
  eq(): boolean {
    return true;
  }
  toDOM(): HTMLElement {
    const s = document.createElement("span");
    s.className = "cm-md-hr";
    return s;
  }
}

const hide = Decoration.replace({});
const bullet = Decoration.replace({ widget: new BulletWidget() });
const hr = Decoration.replace({ widget: new HrWidget() });
const inlineCode = Decoration.mark({ class: "cm-md-code" });
const HEADING_LINE = [1, 2, 3, 4, 5, 6].map((n) =>
  Decoration.line({ class: `cm-md-h${n}` }),
);
const quoteLine = Decoration.line({ class: "cm-md-quote" });

/** 1-based numbers of every line the selection touches. */
function activeLines(view: EditorView): Set<number> {
  const lines = new Set<number>();
  for (const r of view.state.selection.ranges) {
    const from = view.state.doc.lineAt(r.from).number;
    const to = view.state.doc.lineAt(r.to).number;
    for (let n = from; n <= to; n++) lines.add(n);
  }
  return lines;
}

/** Is a task-list item's marker next to this list mark? (`- [ ] …`) */
function isTaskListMark(mark: SyntaxNode): boolean {
  return mark.nextSibling?.name === "Task";
}

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  const doc = state.doc;
  const active = activeLines(view);
  const ranges: Range<Decoration>[] = [];
  const quoteLineStarts = new Set<number>();

  const onActiveLine = (from: number, to: number): boolean => {
    const a = doc.lineAt(from).number;
    const b = doc.lineAt(to).number;
    for (let n = a; n <= b; n++) if (active.has(n)) return true;
    return false;
  };
  /** Hide [from, to), swallowing one trailing space when asked. */
  const hideRange = (from: number, to: number, trailingSpace = false) => {
    if (trailingSpace && doc.sliceString(to, to + 1) === " ") to += 1;
    if (to > from) ranges.push(hide.range(from, to));
  };

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;

        // Headings render at size via line classes (+ the highlight style).
        if (name.startsWith("ATXHeading") || name.startsWith("SetextHeading")) {
          const level = Number(name.slice(-1)) || 1;
          const line = doc.lineAt(node.from);
          ranges.push(HEADING_LINE[level - 1].range(line.from));
          return;
        }

        switch (name) {
          case "HeaderMark": {
            // Hide the ATX `#`s (+ their space) off the active line. Setext
            // underlines stay visible-but-muted: hiding them would leave a
            // confusing empty line.
            const parent = node.node.parent;
            if (
              parent?.name.startsWith("ATXHeading") &&
              !onActiveLine(node.from, node.to)
            )
              hideRange(node.from, node.to, true);
            break;
          }
          case "EmphasisMark":
          case "StrikethroughMark":
            if (!onActiveLine(node.from, node.to))
              hideRange(node.from, node.to);
            break;
          case "InlineCode":
            ranges.push(inlineCode.range(node.from, node.to));
            break;
          case "CodeMark": {
            // Inline-code backticks only — fenced-code fences are blocks.ts's.
            const p = node.node.parent?.name;
            if (p === "InlineCode" && !onActiveLine(node.from, node.to))
              hideRange(node.from, node.to);
            break;
          }
          case "Link":
          case "Image": {
            // Off the active line, collapse `[text](url)` to just the text
            // (images show their alt text — inline image rendering is fenced
            // out of scope on purpose).
            if (onActiveLine(node.from, node.to)) break;
            for (
              let child = node.node.firstChild;
              child;
              child = child.nextSibling
            ) {
              if (
                child.name === "LinkMark" ||
                child.name === "URL" ||
                child.name === "LinkTitle"
              )
                hideRange(child.from, child.to);
            }
            break;
          }
          case "Blockquote": {
            for (
              let pos = node.from;
              pos <= Math.min(node.to, to);
              pos = doc.lineAt(pos).to + 1
            ) {
              quoteLineStarts.add(doc.lineAt(pos).from);
              if (doc.lineAt(pos).to >= node.to) break;
            }
            break;
          }
          case "QuoteMark":
            if (!onActiveLine(node.from, node.to))
              hideRange(node.from, node.to, true);
            break;
          case "ListMark": {
            if (onActiveLine(node.from, node.to)) break;
            const text = doc.sliceString(node.from, node.to);
            if (isTaskListMark(node.node)) {
              // Task items: the checkbox widget is the whole affordance —
              // the leading `-` disappears with its trailing space.
              hideRange(node.from, node.to, true);
            } else if (!/\d/.test(text)) {
              // Bullet (-,*,+) → a real bullet. Ordered markers stay as text.
              ranges.push(bullet.range(node.from, node.to));
            }
            break;
          }
          case "HorizontalRule":
            if (!onActiveLine(node.from, node.to))
              ranges.push(hr.range(node.from, node.to));
            break;
        }
      },
    });
  }

  for (const lineStart of quoteLineStarts)
    ranges.push(quoteLine.range(lineStart));

  return Decoration.set(ranges, true);
}

/** Mod-click (Cmd/Ctrl) opens the link under the pointer; plain click just
 *  places the cursor there like everywhere else. */
const linkClicks = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (!(event.metaKey || event.ctrlKey) || event.button !== 0) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) return false;
    let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(pos, 0);
    while (node && node.name !== "Link" && node.name !== "URL")
      node = node.parent;
    if (!node) return false;
    const urlNode = node.name === "URL" ? node : node.getChild("URL");
    if (!urlNode) return false;
    const url = view.state.sliceDoc(urlNode.from, urlNode.to);
    if (!/^https?:\/\//i.test(url)) return false;
    window.open(url, "_blank", "noopener,noreferrer");
    event.preventDefault();
    return true;
  },
});

export function livePreview(): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged && update.view.composing) {
          this.decorations = this.decorations.map(update.changes);
          return;
        }
        if (
          update.docChanged ||
          update.selectionSet ||
          update.viewportChanged ||
          // the async parser finished more of the doc
          syntaxTree(update.state) !== syntaxTree(update.startState)
        )
          this.decorations = buildDecorations(update.view);
      }
    },
    { decorations: (v) => v.decorations },
  );
  return [plugin, linkClicks];
}
