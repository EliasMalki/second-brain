import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import type { Task } from "@second-brain/shared/db/tasks";
import { byPriority } from "@second-brain/shared/domain/buckets";
import { calendarDayKey, calendarTimed } from "@second-brain/shared/domain/calendar";
import { addDaysISO, fmtDayLabel, todayISO } from "@second-brain/shared/domain/dates";
import { useCalendar, AGENDA_DAYS } from "@/lib/use-calendar";
import { useCompletion } from "@/lib/use-completion";
import { TaskCard } from "@/components/completing-row";
import { RescheduleSheet } from "@/components/reschedule-sheet";
import { ScreenShell } from "@/components/screen-shell";

type Day = { dayKey: string; tasks: Task[] };

/** Within a day: timed items first (by time), then A→D. */
function daySort(a: Task, b: Task): number {
  const at = calendarTimed(a) ? 0 : 1;
  const bt = calendarTimed(b) ? 0 : 1;
  if (at !== bt) return at - bt;
  if (a.start_at && b.start_at) return a.start_at.localeCompare(b.start_at);
  return byPriority(a, b);
}

/**
 * Bucket tasks into ascending, non-empty day groups by their calendar day,
 * clamped to [startISO, endISO]. The fetch matches a task on ANY of start_at /
 * scheduled_for / due_date, but calendarDayKey buckets by precedence — so a task
 * matched via one field can land (by a higher-precedence field) on a day outside
 * the window (or in the past); drop those so no stray/past header appears (web
 * likewise only renders days inside its window).
 */
function buildDays(tasks: Task[], startISO: string, endISO: string): Day[] {
  const groups = new Map<string, Task[]>();
  for (const t of tasks) {
    const key = calendarDayKey(t);
    if (!key || key < startISO || key > endISO) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([dayKey, ts]) => ({ dayKey, tasks: ts.sort(daySort) }));
}

export default function Calendar() {
  const { loading, refreshing, tasks, projects, refresh, reschedule } =
    useCalendar();
  const c = useCompletion(refresh);
  const [rescheduling, setRescheduling] = useState<Task | null>(null);

  // Drop rows whose grace has fired (web-parity drop-after-grace, local, no refetch).
  const visible = useMemo(
    () => tasks.filter((t) => !c.completed.has(t.id)),
    [tasks, c.completed],
  );
  const days = useMemo(() => {
    const start = todayISO();
    return buildDays(visible, start, addDaysISO(start, AGENDA_DAYS));
  }, [visible]);

  return (
    <ScreenShell title="Calendar">
      <View className="px-6 pt-1">
        <Text className="text-fg-muted">Next {AGENDA_DAYS} days</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pt-4 pb-4 gap-5"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        {loading ? (
          <View className="items-center py-8">
            <ActivityIndicator />
          </View>
        ) : days.length === 0 ? (
          <Text className="py-2 text-fg-muted">
            Nothing scheduled — the next {AGENDA_DAYS} days are clear.
          </Text>
        ) : (
          days.map((d) => (
            <View key={d.dayKey} className="gap-2">
              <Text className="text-sm font-medium text-fg">
                {fmtDayLabel(d.dayKey)}
              </Text>
              <TaskCard
                tasks={d.tasks}
                projects={projects}
                c={c}
                variant="calendar"
                onPressRow={setRescheduling}
              />
            </View>
          ))
        )}
      </ScrollView>

      <RescheduleSheet
        task={rescheduling}
        onClose={() => setRescheduling(null)}
        onPick={(scheduledFor) => {
          const t = rescheduling;
          setRescheduling(null);
          if (t) void reschedule(t.id, scheduledFor);
        }}
      />
    </ScreenShell>
  );
}
