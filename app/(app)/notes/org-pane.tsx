"use client";

import type { Folder, FolderGroup } from "./workspace-types";

/**
 * Pane 1 — Organization. A secondary panel (separate from the main app
 * sidebar): All Notes · Inbox/Unfiled · Pinned, then Areas (Business / Personal
 * / other) as section headers with their projects nested as folders. Clicking a
 * project filters the note list. Its header bar matches the note list's so the
 * two left panes read as one symmetric unit; a chevron collapses the pane.
 */
export function OrgPane({
  groups,
  folder,
  allCount,
  inboxCount,
  pinnedCount,
  onSelect,
  onCollapse,
}: {
  groups: FolderGroup[];
  folder: Folder;
  allCount: number;
  inboxCount: number;
  pinnedCount: number;
  onSelect: (folder: Folder) => void;
  onCollapse: () => void;
}) {
  return (
    <aside className="notes-org">
      <div className="note-list-head">
        <span className="note-list-title">Folders</span>
        <button
          type="button"
          className="note-icon-btn note-collapse"
          onClick={onCollapse}
          aria-label="Hide folders"
          title="Hide folders"
        >
          <i className="ti ti-layout-sidebar-left-collapse" aria-hidden="true" />
        </button>
      </div>

      <div className="notes-org-body">
        <button
          type="button"
          className={"nav-item" + (folder.kind === "all" ? " on" : "")}
          onClick={() => onSelect({ kind: "all" })}
        >
          <i className="ti ti-notes" aria-hidden="true" />
          All Notes
          <span className="nav-count">{allCount}</span>
        </button>

        <button
          type="button"
          className={"nav-item" + (folder.kind === "inbox" ? " on" : "")}
          onClick={() => onSelect({ kind: "inbox" })}
        >
          <i className="ti ti-inbox" aria-hidden="true" />
          Inbox / Unfiled
          {inboxCount > 0 ? (
            <span className="nav-count">{inboxCount}</span>
          ) : null}
        </button>

        <button
          type="button"
          className={"nav-item" + (folder.kind === "pinned" ? " on" : "")}
          onClick={() => onSelect({ kind: "pinned" })}
        >
          <i className="ti ti-pin" aria-hidden="true" />
          Pinned
          {pinnedCount > 0 ? (
            <span className="nav-count">{pinnedCount}</span>
          ) : null}
        </button>

        {groups.map((group) => (
          <div key={group.label}>
            <p className="nav-group">{group.label}</p>
            {group.projects.map((p) => (
              <button
                type="button"
                key={p.id}
                className={
                  "proj-item" +
                  (folder.kind === "project" && folder.id === p.id
                    ? " on"
                    : "") +
                  (p.paused ? " paused" : "")
                }
                onClick={() =>
                  onSelect({ kind: "project", id: p.id, name: p.name })
                }
              >
                {p.paused ? (
                  <i className="ti ti-player-pause" aria-hidden="true" />
                ) : (
                  <span className="dot" aria-hidden="true" />
                )}
                {p.name}
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
