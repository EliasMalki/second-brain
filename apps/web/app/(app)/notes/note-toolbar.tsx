"use client";

import type { EditorCommand } from "@second-brain/editor/web";

/**
 * A slim formatting bar above the editor — discoverability for the markdown
 * features (bold, headings, lists, checkboxes…) so they aren't a shortcut you
 * have to already know. Each button dispatches the same exec() commands the
 * keyboard shortcuts use, at the current cursor. mousedown is prevented so the
 * click never steals focus from the editor (the caret stays put).
 */

type Item =
  | { kind: "sep" }
  | { kind: "cmd"; cmd: EditorCommand; icon: string; label: string; hint: string };

const ITEMS: Item[] = [
  { kind: "cmd", cmd: "bold", icon: "ti-bold", label: "Bold", hint: "⌘B" },
  { kind: "cmd", cmd: "italic", icon: "ti-italic", label: "Italic", hint: "⌘I" },
  {
    kind: "cmd",
    cmd: "strikethrough",
    icon: "ti-strikethrough",
    label: "Strikethrough",
    hint: "⌘⇧X",
  },
  { kind: "sep" },
  {
    kind: "cmd",
    cmd: "heading-2",
    icon: "ti-heading",
    label: "Heading",
    hint: "⌘⌥2",
  },
  {
    kind: "cmd",
    cmd: "bullet-list",
    icon: "ti-list",
    label: "Bulleted list",
    hint: "⌘⇧8",
  },
  {
    kind: "cmd",
    cmd: "task",
    icon: "ti-list-check",
    label: "Checklist",
    hint: "⌘⇧C",
  },
  { kind: "sep" },
  { kind: "cmd", cmd: "link", icon: "ti-link", label: "Link", hint: "⌘K" },
  { kind: "cmd", cmd: "code", icon: "ti-code", label: "Code", hint: "⌘E" },
];

export function NoteToolbar({
  onCommand,
}: {
  onCommand: (cmd: EditorCommand) => void;
}) {
  return (
    <div className="note-toolbar" role="toolbar" aria-label="Formatting">
      <div className="note-toolbar-inner">
        {ITEMS.map((item, i) =>
          item.kind === "sep" ? (
            <span key={i} className="note-toolbar-sep" aria-hidden="true" />
          ) : (
            <button
              key={i}
              type="button"
              className="note-toolbar-btn"
              // keep the editor focused / selection intact
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onCommand(item.cmd)}
              aria-label={item.label}
              title={`${item.label} · ${item.hint}`}
            >
              <i className={`ti ${item.icon}`} aria-hidden="true" />
            </button>
          ),
        )}
      </div>
    </div>
  );
}
