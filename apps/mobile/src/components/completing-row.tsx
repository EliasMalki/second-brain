import { Pressable, View } from "react-native";
import type { Task } from "@second-brain/shared/db/tasks";
import type { CompletionPhase } from "@second-brain/shared/ui/use-row-completion";
import { TaskRow } from "@/components/task-row";
import { DonePill, RowUndo } from "@/components/done-pill";
import type { ProjectMeta } from "@/lib/use-today";

/**
 * The screen-facing view of the grace-completion lifecycle, shared by Today and
 * Tasks so the two never hold two copies of the Done-pill/undo wiring. `c` is
 * the completion controller from `useCompletion`; `phaseOf` drives the pill and
 * the inline Undo, `completed` keeps a fired row struck until the next refetch.
 */
export type Completion = {
  phaseOf: (id: string) => CompletionPhase | undefined;
  undo: (id: string) => void;
  onComplete: (id: string) => void;
  completed: Set<string>;
};

/**
 * One completing task row. The Done pill (leading) and the grace Undo (trailing)
 * are inner Pressables, so they win the touch; an optional `onPress` makes the
 * rest of the row tappable (Tasks uses it to open the reschedule sheet — Today
 * leaves rows inert).
 */
export function CompletingRow({
  task,
  project,
  c,
  onPress,
}: {
  task: Task;
  project?: ProjectMeta;
  c: Completion;
  onPress?: () => void;
}) {
  const phase = c.phaseOf(task.id);
  const settledDone = c.completed.has(task.id);
  const row = (
    <TaskRow
      task={task}
      project={project}
      struck={settledDone || !!phase}
      leading={
        <DonePill
          phase={phase}
          done={settledDone}
          onComplete={() => c.onComplete(task.id)}
        />
      }
      trailing={
        phase === "grace" ? (
          <RowUndo onUndo={() => c.undo(task.id)} />
        ) : undefined
      }
    />
  );
  if (!onPress) return row;
  return <Pressable onPress={onPress}>{row}</Pressable>;
}

/** A hairline card of completing rows, divided by top borders. */
export function TaskCard({
  tasks,
  projects,
  c,
  onPressRow,
}: {
  tasks: Task[];
  projects: Record<string, ProjectMeta>;
  c: Completion;
  onPressRow?: (task: Task) => void;
}) {
  return (
    <View className="rounded-lg border border-border bg-surface px-4">
      {tasks.map((t, i) => (
        <View key={t.id} className={i > 0 ? "border-t border-border" : ""}>
          <CompletingRow
            task={t}
            project={projects[t.project_id ?? ""]}
            c={c}
            onPress={onPressRow ? () => onPressRow(t) : undefined}
          />
        </View>
      ))}
    </View>
  );
}
