import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import {
  BUCKET_LABEL,
  BUCKET_ORDER,
  bucketOf,
  byPriority,
  isOverdue,
  type Bucket,
} from "@second-brain/shared/domain/buckets";
import { todayISO } from "@second-brain/shared/domain/dates";
import type { Task } from "@second-brain/shared/db/tasks";
import { useTasks } from "@/lib/use-tasks";
import { useCompletion } from "@/lib/use-completion";
import { TaskCard } from "@/components/completing-row";
import { RescheduleSheet } from "@/components/reschedule-sheet";
import { AddTask } from "@/components/add-task";
import { ScreenShell } from "@/components/screen-shell";

type Section = { key: Bucket; label: string; tasks: Task[] };

/**
 * Group open tasks into the same ordered, non-empty time buckets web's Tasks
 * page renders — Overdue · Today · This week · Backlog — via the shared
 * bucketOf/BUCKET_ORDER/BUCKET_LABEL, sorted within each by byPriority. Assembly
 * only; every rule lives in shared so the two surfaces can't drift.
 */
function buildSections(tasks: Task[], today: string): Section[] {
  const groups = new Map<Bucket, Task[]>();
  for (const t of tasks) {
    const b = bucketOf(t, today);
    (groups.get(b) ?? groups.set(b, []).get(b)!).push(t);
  }
  const out: Section[] = [];
  for (const b of BUCKET_ORDER) {
    const list = groups.get(b);
    if (!list || list.length === 0) continue;
    out.push({ key: b, label: BUCKET_LABEL[b], tasks: list.sort(byPriority) });
  }
  return out;
}

export default function Tasks() {
  const {
    loading,
    refreshing,
    tasks,
    projects,
    projectOptions,
    refresh,
    addTask,
    reschedule,
  } = useTasks();
  const c = useCompletion(refresh);
  const [rescheduling, setRescheduling] = useState<Task | null>(null);

  const today = todayISO();
  // Hide rows whose grace has fired (in the completed set) so a done task drops
  // out of its bucket and the header counts stay fresh — web parity, done
  // locally (no refetch/race). If the server write fails, useCompletion removes
  // the id from the set, so the row reappears, re-completable.
  const visible = useMemo(
    () => tasks.filter((t) => !c.completed.has(t.id)),
    [tasks, c.completed],
  );
  const sections = useMemo(() => buildSections(visible, today), [visible, today]);
  const overdue = useMemo(
    () => visible.filter((t) => isOverdue(t, today)).length,
    [visible, today],
  );

  return (
    <ScreenShell title="Tasks">
      <View className="px-6 pt-1">
        <Text className="text-fg-muted">
          {visible.length} open{overdue > 0 ? ` · ${overdue} overdue` : ""}
        </Text>
      </View>

      <View className="pt-3">
        <AddTask projects={projectOptions} onAdd={addTask} />
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
        ) : sections.length === 0 ? (
          <Text className="py-2 text-fg-muted">
            No open tasks — you&apos;re all clear.
          </Text>
        ) : (
          sections.map((s) => (
            <View key={s.key} className="gap-2">
              <View className="flex-row items-baseline gap-2">
                <Text className="text-sm font-medium uppercase tracking-wide text-fg-muted">
                  {s.label}
                </Text>
                <Text className="text-sm text-fg-muted">{s.tasks.length}</Text>
              </View>
              <TaskCard
                tasks={s.tasks}
                projects={projects}
                c={c}
                variant="list"
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
