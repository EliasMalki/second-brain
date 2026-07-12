/**
 * Shared types for the three-pane Notes workspace. Plain types only (no
 * "use client") so both the client workspace and its child panes import from
 * here without a module cycle.
 */

/** The selected "folder" in the org pane — Apple-Notes-style left column. */
export type Folder =
  | { kind: "all" }
  | { kind: "inbox" }
  | { kind: "pinned" }
  | { kind: "project"; id: string; name: string };

/** A project shown as a folder under an area header. */
export type FolderProject = { id: string; name: string; paused: boolean };

/** Projects grouped under an area kind: Business / Personal / Projects (other). */
export type FolderGroup = { label: string; projects: FolderProject[] };

export function folderTitle(folder: Folder): string {
  switch (folder.kind) {
    case "all":
      return "All Notes";
    case "inbox":
      return "Inbox";
    case "pinned":
      return "Pinned";
    case "project":
      return folder.name;
  }
}
