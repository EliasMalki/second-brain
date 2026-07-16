import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { editorTheme } from "./theme";
import { livePreview } from "./live-preview";
import { checkboxes } from "./checkbox";
import { blocks } from "./blocks";
import { COMMANDS, formattingKeymap } from "./commands";
import type {
  EditorCommand,
  MarkdownEditorHandle,
  MarkdownEditorOptions,
} from "./types";

/**
 * Assemble the editor. markdownLanguage (not the commonmark default) brings
 * the GFM extensions the app depends on: task lists, tables, strikethrough,
 * autolinks. markdown()'s own keymap (Enter continues lists/quotes, Backspace
 * deletes markup) is registered before defaultKeymap so it wins.
 */
function buildExtensions(opts: MarkdownEditorOptions): Extension[] {
  return [
    history(),
    markdown({ base: markdownLanguage }),
    EditorView.lineWrapping,
    editorTheme,
    livePreview(),
    checkboxes({ onToggle: opts.onCheckboxToggle }),
    blocks(),
    opts.placeholder ? cmPlaceholder(opts.placeholder) : [],
    EditorState.readOnly.of(!!opts.readOnly),
    EditorView.editable.of(!opts.readOnly),
    EditorView.updateListener.of((update) => {
      if (update.docChanged)
        opts.onDocChanged?.(() => update.state.doc.toString());
      if (update.focusChanged) opts.onFocusChange?.(update.view.hasFocus);
    }),
    keymap.of([
      {
        key: "Mod-s",
        run: () => {
          opts.onRequestSave?.();
          return true; // always eat the browser save dialog
        },
      },
      ...formattingKeymap(),
      ...defaultKeymap,
      ...historyKeymap,
    ]),
  ];
}

export function createMarkdownEditor(
  opts: MarkdownEditorOptions,
): MarkdownEditorHandle {
  const makeState = (doc: string) =>
    EditorState.create({ doc, extensions: buildExtensions(opts) });

  const view = new EditorView({
    state: makeState(opts.doc),
    parent: opts.parent,
  });

  if (opts.autofocus) view.focus();

  return {
    view,
    getDoc: () => view.state.doc.toString(),
    setDoc: (doc) => view.setState(makeState(doc)),
    exec: (cmd) => COMMANDS[cmd](view),
    focus: () => view.focus(),
    hasFocus: () => view.hasFocus,
    destroy: () => view.destroy(),
  };
}
