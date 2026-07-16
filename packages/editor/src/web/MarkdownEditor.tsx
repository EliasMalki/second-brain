"use client";

import { useEffect, useRef } from "react";
import { createMarkdownEditor } from "../core/create";
import type { MarkdownEditorHandle, MarkdownEditorOptions } from "../core/types";

type Props = {
  /** Initial markdown. The editor is uncontrolled after mount — remount with a
   *  React `key` to load a different note (matches the workspace's key={id}). */
  doc: string;
  placeholder?: string;
  readOnly?: boolean;
  autofocus?: boolean;
  className?: string;
  onDocChanged?: MarkdownEditorOptions["onDocChanged"];
  onCheckboxToggle?: MarkdownEditorOptions["onCheckboxToggle"];
  onFocusChange?: MarkdownEditorOptions["onFocusChange"];
  onRequestSave?: MarkdownEditorOptions["onRequestSave"];
  /** Hands the imperative handle (exec/focus/getDoc) to the host. */
  onReady?: (handle: MarkdownEditorHandle) => void;
};

/** The web mount: a thin React lifecycle wrapper around the core editor. */
export function MarkdownEditor({
  doc,
  placeholder,
  readOnly,
  autofocus,
  className,
  onDocChanged,
  onCheckboxToggle,
  onFocusChange,
  onRequestSave,
  onReady,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Latest-callback refs so the editor (created once) never sees stale closures.
  const cbs = useRef({
    onDocChanged,
    onCheckboxToggle,
    onFocusChange,
    onRequestSave,
    onReady,
  });
  cbs.current = {
    onDocChanged,
    onCheckboxToggle,
    onFocusChange,
    onRequestSave,
    onReady,
  };

  useEffect(() => {
    const handle = createMarkdownEditor({
      parent: hostRef.current!,
      doc,
      placeholder,
      readOnly,
      autofocus,
      keymapPlatform: "web",
      onDocChanged: (getDoc) => cbs.current.onDocChanged?.(getDoc),
      onCheckboxToggle: (info) => cbs.current.onCheckboxToggle?.(info),
      onFocusChange: (focused) => cbs.current.onFocusChange?.(focused),
      onRequestSave: () => cbs.current.onRequestSave?.(),
    });
    cbs.current.onReady?.(handle);
    return () => handle.destroy();
    // Mount-once by design: doc/placeholder changes require a key remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={hostRef}
      className={"md-editor" + (className ? " " + className : "")}
    />
  );
}
