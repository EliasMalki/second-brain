import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  listTasksForCalendar,
  updateTask,
  type Task,
} from "@second-brain/shared/db/tasks";
import { listProjects } from "@second-brain/shared/db/projects";
import { addDaysISO, todayISO } from "@second-brain/shared/domain/dates";
import { useAuth } from "./auth-context";
import { supabase } from "./supabase";
import type { ProjectMeta } from "./use-today";

/** How far forward the agenda looks (today + this many days, inclusive). */
export const AGENDA_DAYS = 30;

/** Move a timestamp to a new device-local day, keeping its wall-clock time. */
function shiftClockToDay(iso: string, dayISO: string): string {
  const [y, m, d] = dayISO.split("-").map(Number);
  const dt = new Date(iso);
  dt.setFullYear(y, m - 1, d);
  return dt.toISOString();
}

type ReschedulePatch = {
  scheduledFor: string | null;
  startAt?: string | null;
  endAt?: string | null;
};

export type CalendarData = {
  loading: boolean;
  refreshing: boolean;
  /** Open tasks landing anywhere in [today, today+AGENDA_DAYS]. Bucketed by day
   *  in the screen; paused/archived projects already excluded by the query. */
  tasks: Task[];
  projects: Record<string, ProjectMeta>;
  refresh: () => void;
  /** Move a task's scheduled day (or null), optimistically then reconcile. */
  reschedule: (id: string, scheduledFor: string | null) => Promise<void>;
};

/**
 * Calendar-agenda data — the app-task layer only (Google events are server-only:
 * per-user OAuth tokens are DB-encrypted and decrypted with a server env key, so
 * they can't be read on-device without a bridge route — deferred). All direct
 * org-scoped shared reads/writes, refetch-on-focus like use-tasks/use-today.
 */
export function useCalendar(): CalendarData {
  const { orgId } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Record<string, ProjectMeta>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (!orgId) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        const start = todayISO();
        const end = addDaysISO(start, AGENDA_DAYS);
        const [rows, projs] = await Promise.all([
          listTasksForCalendar(supabase, orgId, start, end),
          listProjects(supabase, orgId, { includeArchived: true }),
        ]);
        const map: Record<string, ProjectMeta> = {};
        for (const p of projs) map[p.id] = { name: p.name, color: p.color };
        setTasks(rows);
        setProjects(map);
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

  const reschedule = useCallback(
    async (id: string, scheduledFor: string | null) => {
      if (!orgId) return;
      const t = tasks.find((x) => x.id === id);
      // A timed appointment must move as a whole: shift start_at (and end_at,
      // preserving duration) to the new day, else scheduled_for would disagree
      // with the day calendarDayKey shows it on (start_at wins) — a silent no-op
      // here + a cross-screen desync. "No date" on a timed task clears it.
      let patch: ReschedulePatch = { scheduledFor };
      if (t?.start_at && scheduledFor) {
        const startAt = shiftClockToDay(t.start_at, scheduledFor);
        const delta = Date.parse(startAt) - Date.parse(t.start_at);
        const endAt = t.end_at
          ? new Date(Date.parse(t.end_at) + delta).toISOString()
          : null;
        patch = { scheduledFor, startAt, endAt };
      } else if (t?.start_at && !scheduledFor) {
        patch = { scheduledFor: null, startAt: null, endAt: null };
      }
      setTasks((ts) =>
        ts.map((x) =>
          x.id === id
            ? {
                ...x,
                scheduled_for: patch.scheduledFor,
                ...(patch.startAt !== undefined ? { start_at: patch.startAt } : {}),
                ...(patch.endAt !== undefined ? { end_at: patch.endAt } : {}),
              }
            : x,
        ),
      );
      try {
        const updated = await updateTask(supabase, orgId, id, patch);
        setTasks((ts) => ts.map((x) => (x.id === id ? updated : x)));
      } catch {
        refresh();
      }
    },
    [orgId, refresh, tasks],
  );

  return { loading, refreshing, tasks, projects, refresh, reschedule };
}
