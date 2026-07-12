"use client";

import { useEffect } from "react";

export type SnapshotTask = {
  title: string;
  priority: string;
  section: string;
  project: string | null;
};

export type ViewSnapshot = {
  view: string;
  savedAt: string;
  tasks: SnapshotTask[];
};

const KEY = "sb-view-snapshot";

/**
 * Caches the last successfully rendered Today/Week task list in
 * localStorage (BUILD_SPEC §6). When a navigation fails offline, the error
 * boundary serves this snapshot read-only. Deliberately not a service
 * worker — those are out of scope for v0.5.
 */
export function SaveViewSnapshot({
  view,
  tasks,
}: {
  view: string;
  tasks: SnapshotTask[];
}) {
  useEffect(() => {
    try {
      const snapshot: ViewSnapshot = {
        view,
        savedAt: new Date().toISOString(),
        tasks,
      };
      localStorage.setItem(`${KEY}-${view}`, JSON.stringify(snapshot));
    } catch {
      // storage full/unavailable — the snapshot is best-effort
    }
  }, [view, tasks]);

  return null;
}

export function readViewSnapshot(view: string): ViewSnapshot | null {
  try {
    const raw = localStorage.getItem(`${KEY}-${view}`);
    return raw ? (JSON.parse(raw) as ViewSnapshot) : null;
  } catch {
    return null;
  }
}
