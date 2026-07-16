import type { EditorView } from "@codemirror/view";

/**
 * Public surface of @second-brain/editor — the shared live-preview markdown
 * editor. One modeless surface: always styled, always editable. Markdown in,
 * markdown out; the host owns persistence (see ../save/autosave.ts).
 *
 * Two mounts share this core: the web React wrapper (src/web) and, in a later
 * phase, a React-Native WebView mount that speaks the same options/handle
 * shape over a bridge. Keep everything here transport-agnostic.
 */

/** Commands the host can dispatch (keyboard shortcuts on web, the keyboard
 *  accessory bar on mobile). */
export type EditorCommand =
  | "bold"
  | "italic"
  | "strikethrough"
  | "code"
  | "link"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "bullet-list"
  | "task"
  | "indent"
  | "outdent"
  | "undo"
  | "redo";

export interface MarkdownEditorOptions {
  parent: HTMLElement;
  /** Initial markdown document. */
  doc: string;
  placeholder?: string;
  readOnly?: boolean;
  autofocus?: boolean;
  /** Which keymap set to install (mobile relies on the accessory bar instead
   *  of most shortcuts). Default "web". */
  keymapPlatform?: "web" | "mobile";
  /** Fired on every user edit. Receives a getter (not the string) so hosts
   *  that debounce don't pay for serializing the doc on each keystroke. */
  onDocChanged?: (getDoc: () => string) => void;
  /** Fired when a task checkbox is toggled, in addition to onDocChanged
   *  (mobile uses it for haptics). 1-based line number. */
  onCheckboxToggle?: (info: { lineNumber: number; checked: boolean }) => void;
  onFocusChange?: (focused: boolean) => void;
  /** Mod-S. Hosts flush their autosave controller here (and the binding eats
   *  the browser's save dialog either way). */
  onRequestSave?: () => void;
}

export interface MarkdownEditorHandle {
  getDoc(): string;
  /** Replace the document from outside (external load). Rebuilds editor state,
   *  which deliberately resets undo history. */
  setDoc(doc: string): void;
  exec(cmd: EditorCommand): boolean;
  focus(): void;
  hasFocus(): boolean;
  destroy(): void;
  /** Escape hatch for the web mount; the WebView mount must not rely on it. */
  view: EditorView;
}
