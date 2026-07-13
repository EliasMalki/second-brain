import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { listInbox, type InboxItem } from "@second-brain/shared/db/inbox";
import { listProjects } from "@second-brain/shared/db/projects";
import { setNoteArchived, updateNote } from "@second-brain/shared/db/notes";
import { cancelTask, reopenTask, updateTask } from "@second-brain/shared/db/tasks";
import {
  answerQuestionPrompt,
  dismissPrompt,
  reopenPrompt,
} from "@second-brain/shared/db/prompts";
import { useAuth } from "./auth-context";
import { supabase } from "./supabase";
import type { ProjectMeta } from "./use-today";
import type { ProjectOption } from "./use-tasks";

/** Stable per-item key across the three kinds (kind prefix avoids id collisions). */
export function inboxKey(item: InboxItem): string {
  const id =
    item.kind === "note"
      ? item.note.id
      : item.kind === "task"
        ? item.task.id
        : item.prompt.id;
  return `${item.kind}-${id}`;
}

type UndoState = { message: string; nonce: number } | null;

export type InboxData = {
  loading: boolean;
  refreshing: boolean;
  /** Visible feed = server items minus the optimistically-removed ones. */
  items: InboxItem[];
  projects: Record<string, ProjectMeta>;
  projectOptions: ProjectOption[];
  refresh: () => void;
  fileNote: (id: string, projectId: string, projectName: string) => void;
  dismissNote: (id: string) => void;
  fileTask: (id: string, projectId: string, projectName: string) => void;
  dismissTask: (id: string) => void;
  dismissPromptItem: (id: string, label: string) => void;
  /** Non-optimistic (the typed answer must survive a failed request); throws on
   *  failure so the answer sheet can keep the draft + show an error. */
  answerQuestion: (id: string, text: string) => Promise<void>;
  /** The current undo banner (one at a time), or null. */
  undo: UndoState;
  runUndo: () => void;
  clearUndo: () => void;
};

/**
 * Inbox data — the canonical shared feed (listInbox) plus the resolution writes,
 * all direct org-scoped shared calls (no web route: filing/dismiss/answer are
 * plain mutations, not the capture pipeline). Every action removes the card
 * optimistically and offers a single undo; a failed write reconciles from the
 * server (never drops the item — the Inbox is the capture-never-loses backstop).
 */
export function useInbox(): InboxData {
  const { orgId, session } = useAuth();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [projects, setProjects] = useState<Record<string, ProjectMeta>>({});
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [undo, setUndo] = useState<UndoState>(null);
  const undoAction = useRef<null | (() => Promise<void>)>(null);
  const nonceRef = useRef(0);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (!orgId) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        const [feed, projs] = await Promise.all([
          listInbox(supabase, orgId),
          listProjects(supabase, orgId, { includeArchived: true }),
        ]);
        const map: Record<string, ProjectMeta> = {};
        for (const p of projs) map[p.id] = { name: p.name, color: p.color };
        setItems(feed);
        // Prune optimistic-hide tombstones for items the server no longer
        // returns (they committed) — keep only keys still in the fresh feed
        // (mid-flight hides). Stops a re-surfaced item staying hidden forever.
        const freshKeys = new Set(feed.map(inboxKey));
        setRemoved((prev) => new Set([...prev].filter((k) => freshKeys.has(k))));
        setProjects(map);
        setProjectOptions(
          projs
            .filter((p) => p.status !== "archived")
            .map((p) => ({ id: p.id, name: p.name, color: p.color })),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [orgId],
  );

  useFocusEffect(
    useCallback(() => {
      void load("initial");
    }, [load]),
  );

  const refresh = useCallback(() => void load("refresh"), [load]);

  const hideKey = useCallback((key: string) => {
    setRemoved((prev) => new Set(prev).add(key));
  }, []);
  const showKey = useCallback((key: string) => {
    setRemoved((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const clearUndo = useCallback(() => {
    undoAction.current = null;
    setUndo(null);
  }, []);

  const runUndo = useCallback(() => {
    const action = undoAction.current;
    undoAction.current = null;
    setUndo(null);
    if (action) void action();
  }, []);

  /**
   * One optimistic action: hide the card, run the forward write, and arm the
   * undo (which un-hides + runs the reverse write). On forward failure, un-hide
   * and refetch so the item is never lost.
   */
  const act = useCallback(
    (
      key: string,
      message: string,
      forward: () => Promise<unknown>,
      reverse: () => Promise<unknown>,
    ) => {
      if (!orgId) return;
      hideKey(key);
      // This action's own reverse closure — the identity we check on failure so
      // an earlier action's late failure can't tear down a LATER action's undo.
      const mine = async () => {
        showKey(key);
        try {
          await reverse();
        } finally {
          refresh();
        }
      };
      undoAction.current = mine;
      setUndo({ message, nonce: ++nonceRef.current });
      void forward().catch(() => {
        // Never lose the item: always un-hide + reconcile. Only tear down the
        // undo/snackbar if THIS action still owns it (else we'd kill a newer one).
        showKey(key);
        if (undoAction.current === mine) {
          undoAction.current = null;
          setUndo(null);
        }
        refresh();
      });
    },
    [orgId, hideKey, showKey, refresh],
  );

  const fileNote = useCallback(
    (id: string, projectId: string, projectName: string) =>
      act(
        `note-${id}`,
        `Filed to ${projectName}`,
        () => updateNote(supabase, orgId!, id, { projectId }),
        () => updateNote(supabase, orgId!, id, { projectId: null }),
      ),
    [act, orgId],
  );
  const dismissNote = useCallback(
    (id: string) =>
      act(
        `note-${id}`,
        "Note archived",
        () => setNoteArchived(supabase, orgId!, id, true),
        () => setNoteArchived(supabase, orgId!, id, false),
      ),
    [act, orgId],
  );
  const fileTask = useCallback(
    (id: string, projectId: string, projectName: string) =>
      act(
        `task-${id}`,
        `Filed to ${projectName}`,
        () => updateTask(supabase, orgId!, id, { projectId }),
        () => updateTask(supabase, orgId!, id, { projectId: null }),
      ),
    [act, orgId],
  );
  const dismissTask = useCallback(
    (id: string) =>
      act(
        `task-${id}`,
        "Task dismissed",
        () => cancelTask(supabase, orgId!, id),
        () => reopenTask(supabase, orgId!, id),
      ),
    [act, orgId],
  );
  const dismissPromptItem = useCallback(
    (id: string, label: string) =>
      act(
        `prompt-${id}`,
        label,
        () => dismissPrompt(supabase, orgId!, id),
        () => reopenPrompt(supabase, orgId!, id),
      ),
    [act, orgId],
  );

  const answerQuestion = useCallback(
    async (id: string, text: string) => {
      if (!orgId || !session) throw new Error("Not signed in.");
      await answerQuestionPrompt(supabase, orgId, session.user.id, id, text);
      // Answering is not undoable (matches web) — just hide it once it lands.
      hideKey(`prompt-${id}`);
    },
    [orgId, session, hideKey],
  );

  const visible = items.filter((i) => !removed.has(inboxKey(i)));

  return {
    loading,
    refreshing,
    items: visible,
    projects,
    projectOptions,
    refresh,
    fileNote,
    dismissNote,
    fileTask,
    dismissTask,
    dismissPromptItem,
    answerQuestion,
    undo,
    runUndo,
    clearUndo,
  };
}
