"use client";

import { projectColorVars } from "@/lib/colors";
import type { Folder, FolderGroup } from "./workspace-types";

/**
 * Pane 1 — Organization. A secondary panel (separate from the main app
 * sidebar): All Notes · Inbox/Unfiled · Pinned, then Areas (Business / Personal
 * / other) as section headers with their projects nested as folders — each
 * with its quiet color dot and note count. Below the folders: Recents (the
 * last few opened notes, titles only) and the Archived filter. Clicking a
 * project filters the note list. A chevron collapses the pane.
 */
export function OrgPane({
  groups,
  folder,
  allCount,
  inboxCount,
  pinnedCount,
  projectCounts,
  recents,
  onSelect,
  onOpenRecent,
  onCollapse,
}: {
  groups: FolderGroup[];
  folder: Folder;
  allCount: number;
  inboxCount: number;
  pinnedCount: number;
  projectCounts: ReadonlyMap<string, number>;
  recents: { id: string; title: string }[];
  onSelect: (folder: Folder) => void;
  onOpenRecent: (id: string) => void;
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
            {group.projects.map((p) => {
              const count = projectCounts.get(p.id) ?? 0;
              return (
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
                    <span
                      className="dot"
                      style={projectColorVars(p.color)}
                      aria-hidden="true"
                    />
                  )}
                  {p.name}
                  {count > 0 ? (
                    <span className="nav-count">{count}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}

        {recents.length > 0 ? (
          <div className="notes-recents">
            <p className="nav-group">Recents</p>
            {recents.map((r) => (
              <button
                type="button"
                key={r.id}
                className="notes-recent"
                onClick={() => onOpenRecent(r.id)}
              >
                <i className="ti ti-clock" aria-hidden="true" />
                <span className="notes-recent-title">{r.title}</span>
              </button>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          className={
            "nav-item notes-archived" +
            (folder.kind === "archived" ? " on" : "")
          }
          onClick={() => onSelect({ kind: "archived" })}
        >
          <i className="ti ti-archive" aria-hidden="true" />
          Archived
        </button>
      </div>
    </aside>
  );
}
