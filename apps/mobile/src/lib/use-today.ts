import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  listCompletedTasks,
  listOverdueTasks,
  listTasksScheduledBetween,
  listWaitingFollowUps,
  partitionByAvailability,
  type Task,
} from "@second-brain/shared/db/tasks";
import { listProjects } from "@second-brain/shared/db/projects";
import { getFirstOpenBrief } from "@second-brain/shared/db/brief";
import { byPriority } from "@second-brain/shared/domain/buckets";
import { isBusinessHoursNow, todayISO } from "@second-brain/shared/domain/dates";
import { useAuth } from "./auth-context";
import { supabase } from "./supabase";

export type ProjectMeta = { name: string; color: string | null };

export type TodayData = {
  loading: boolean;
  refreshing: boolean;
  /** availability-filtered, sorted timed-first (by time) then A→D */
  today: Task[];
  hiddenCount: number; // tasks suppressed by the off-hours filter
  waiting: Task[];
  doneToday: number;
  quickWins: number;
  projects: Record<string, ProjectMeta>;
  refresh: () => void;
};

/** Web's home-brief agenda sort: timed items first (by time), then A→D. */
function agendaSort(a: Task, b: Task): number {
  const at = a.start_at ? 0 : 1;
  const bt = b.start_at ? 0 : 1;
  if (at !== bt) return at - bt;
  if (a.start_at && b.start_at) return a.start_at.localeCompare(b.start_at);
  return byPriority(a, b);
}

/** Local (device-tz) YYYY-MM-DD for a timestamp — matches how todayISO is local. */
function localYMD(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type State = {
  today: Task[];
  hiddenCount: number;
  waiting: Task[];
  doneToday: number;
  quickWins: number;
  projects: Record<string, ProjectMeta>;
};

const EMPTY: State = {
  today: [],
  hiddenCount: 0,
  waiting: [],
  doneToday: 0,
  quickWins: 0,
  projects: {},
};

/**
 * Today / daily-brief data — all direct org-scoped shared reads (no web route).
 * Mirrors web's page.tsx: the availability-filtered `now` set is the brief, and
 * getFirstOpenBrief runs once for its side effect (briefs_log bookkeeping), its
 * payload discarded. Refetches on focus so "today" is recomputed after a
 * background/midnight boundary.
 */
export function useToday(): TodayData {
  const { orgId, session } = useAuth();
  const [state, setState] = useState<State>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const briefMarked = useRef(false);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (!orgId) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        const today = todayISO();
        const [overdue, todays, completed, waiting, projs] = await Promise.all([
          listOverdueTasks(supabase, orgId),
          listTasksScheduledBetween(supabase, orgId, today, today),
          listCompletedTasks(supabase, orgId),
          listWaitingFollowUps(supabase, orgId),
          listProjects(supabase, orgId, { includeArchived: true }),
        ]);
        const { available, offHours } = await partitionByAvailability(
          supabase,
          orgId,
          [...overdue, ...todays],
          isBusinessHoursNow(),
        );
        const projectMap: Record<string, ProjectMeta> = {};
        for (const p of projs) projectMap[p.id] = { name: p.name, color: p.color };

        setState({
          today: [...available].sort(agendaSort),
          hiddenCount: offHours.length,
          waiting,
          doneToday: completed.filter(
            (t) => t.completed_at && localYMD(t.completed_at) === today,
          ).length,
          quickWins: available.filter((t) => t.effort === "quick").length,
          projects: projectMap,
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [orgId],
  );

  // First-open-of-day bookkeeping — once per app session, side effect only
  // (create/stamp today's briefs_log row); the payload is intentionally
  // discarded (the live list above is the brief), exactly as web does.
  useEffect(() => {
    if (!orgId || !session || briefMarked.current) return;
    briefMarked.current = true;
    void getFirstOpenBrief(supabase, orgId, session.user.id).catch(() => {});
  }, [orgId, session]);

  useFocusEffect(
    useCallback(() => {
      void load("initial");
    }, [load]),
  );

  return {
    loading,
    refreshing,
    ...state,
    refresh: () => void load("refresh"),
  };
}
