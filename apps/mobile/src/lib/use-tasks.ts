import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  createTask,
  listTasks,
  updateTask,
  type Priority,
  type Task,
} from "@second-brain/shared/db/tasks";
import { listProjects } from "@second-brain/shared/db/projects";
import { useAuth } from "./auth-context";
import { supabase } from "./supabase";
import type { ProjectMeta } from "./use-today";

export type NewTaskInput = {
  title: string;
  projectId?: string | null;
  priority?: Priority;
  scheduledFor?: string | null;
};

export type TasksData = {
  loading: boolean;
  refreshing: boolean;
  /** All OPEN tasks (paused/archived projects included — the command-center
   *  list shows everything, unlike the brief/day views). Bucketed in the screen. */
  tasks: Task[];
  projects: Record<string, ProjectMeta>;
  refresh: () => void;
  /** Create a task (direct shared write, no web route) and splice it in. Throws
   *  on failure so the composer can surface it. */
  addTask: (input: NewTaskInput) => Promise<void>;
  /** Move a task to a new scheduled date (or null = backlog), optimistically. */
  reschedule: (id: string, scheduledFor: string | null) => Promise<void>;
};

/**
 * Tasks-screen data — all direct org-scoped shared reads/writes (no web route).
 * Refetches on focus so the list reflects tasks added on Capture / completed
 * elsewhere. Mutations are optimistic and reconcile against the returned row.
 */
export function useTasks(): TasksData {
  const { orgId, session } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Record<string, ProjectMeta>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (!orgId) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        const [open, projs] = await Promise.all([
          listTasks(supabase, orgId, { status: "open" }),
          listProjects(supabase, orgId, { includeArchived: true }),
        ]);
        const projectMap: Record<string, ProjectMeta> = {};
        for (const p of projs) projectMap[p.id] = { name: p.name, color: p.color };
        setTasks(open);
        setProjects(projectMap);
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

  const addTask = useCallback(
    async (input: NewTaskInput) => {
      if (!orgId || !session) throw new Error("Not signed in.");
      const created = await createTask(supabase, orgId, session.user.id, input);
      setTasks((ts) => [created, ...ts]);
    },
    [orgId, session],
  );

  const reschedule = useCallback(
    async (id: string, scheduledFor: string | null) => {
      if (!orgId) return;
      // Optimistic re-bucket: patch scheduled_for locally so the row moves now.
      setTasks((ts) =>
        ts.map((t) => (t.id === id ? { ...t, scheduled_for: scheduledFor } : t)),
      );
      try {
        const updated = await updateTask(supabase, orgId, id, { scheduledFor });
        setTasks((ts) => ts.map((t) => (t.id === id ? updated : t)));
      } catch {
        // Reconcile from the server on failure (reverts the optimistic move).
        refresh();
      }
    },
    [orgId, refresh],
  );

  return { loading, refreshing, tasks, projects, refresh, addTask, reschedule };
}
