"use dom";

import { useEffect, useRef } from "react";
import { createMarkdownEditor } from "@second-brain/editor/core";
import type {
  EditorCommand,
  MarkdownEditorHandle,
} from "@second-brain/editor/core";
import { COLORS, tokenColor } from "@second-brain/shared/design/tokens";
import type { DOMProps } from "expo/dom";

/**
 * The shared markdown editor, hosted inside an Expo DOM component ("use dom")
 * so mobile and web run the SAME CodeMirror core — never a per-platform fork.
 * This renders in a WebView; the RN side talks to it only through the
 * serializable prop surface + async callbacks below (no imperative handle
 * crosses the bridge — the handle stays local here).
 *
 * The editor is created ONCE at mount reading `doc` (each note is its own
 * screen push, so switching notes remounts this with the right doc — no setDoc
 * across notes). Tokens are stamped onto this document from the shared token
 * source, re-stamped when `scheme` changes; the editor's theme reads the same
 * short CSS vars web uses.
 */

export type NoteEditorDomProps = {
  /** Initial markdown — read once at mount. */
  doc: string;
  placeholder?: string;
  scheme: "light" | "dark";
  /** Command channel: a changed `seq` re-fires `cmd` (repeated taps re-fire). */
  command?: { cmd: EditorCommand; seq: number };
  /** Bump to force an immediate onDocChanged emit (before back/unmount). */
  requestFlushSeq?: number;
  // OUT — async (the bridge marshals callbacks as async). onDocChanged is
  // debounced ~300ms on this side before crossing.
  onDocChanged: (doc: string) => Promise<void>;
  onCheckboxToggle: (info: {
    lineNumber: number;
    checked: boolean;
  }) => Promise<void>;
  onFocusChange: (focused: boolean) => Promise<void>;
  /** WebView config set by the RN parent (flex, scrollEnabled, hide native bar). */
  dom?: DOMProps;
};

const HOST_CSS = `
  html, body { height: 100%; margin: 0; }
  body { padding: 10px 16px; -webkit-text-size-adjust: 100%; }
  .note-editor-dom-host, .cm-editor { height: 100%; }
  .cm-scroller { overflow-y: auto; overflow-x: hidden; }
`;

export default function NoteEditorDom(props: NoteEditorDomProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handle = useRef<MarkdownEditorHandle | null>(null);
  // Latest-callback refs — the editor is created once, so it must never close
  // over a stale callback prop.
  const cbs = useRef(props);
  cbs.current = props;

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const emitNow = () => {
    clearTimeout(timer.current);
    void cbs.current.onDocChanged(handle.current?.getDoc() ?? props.doc);
  };
  const emitDebounced = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(emitNow, 300);
  };

  // Token vars → this document, re-stamped on scheme change.
  useEffect(() => {
    const root = document.documentElement;
    for (const name of Object.keys(COLORS))
      root.style.setProperty(
        `--${name}`,
        tokenColor(name as keyof typeof COLORS, props.scheme),
      );
    root.style.colorScheme = props.scheme; // native checkbox <input> follows
  }, [props.scheme]);

  // Create the editor once (reads `doc` at mount).
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = HOST_CSS;
    document.head.appendChild(style);

    handle.current = createMarkdownEditor({
      parent: hostRef.current!,
      doc: props.doc,
      placeholder: props.placeholder,
      keymapPlatform: "mobile",
      autofocus: props.doc.length === 0,
      onDocChanged: () => emitDebounced(),
      onCheckboxToggle: (info) => {
        void cbs.current.onCheckboxToggle(info);
        emitNow();
      },
      onFocusChange: (focused) => {
        if (!focused) emitNow(); // flush the buffer on blur
        void cbs.current.onFocusChange(focused);
      },
    });
    return () => {
      clearTimeout(timer.current);
      handle.current?.destroy();
      style.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // RN → editor command channel.
  useEffect(() => {
    if (!props.command) return;
    handle.current?.exec(props.command.cmd);
    handle.current?.focus();
    emitDebounced();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.command?.seq]);

  // Forced flush before the RN screen pops.
  useEffect(() => {
    if (props.requestFlushSeq === undefined) return;
    emitNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.requestFlushSeq]);

  return <div ref={hostRef} className="note-editor-dom-host" />;
}
