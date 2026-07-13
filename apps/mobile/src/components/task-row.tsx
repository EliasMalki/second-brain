import { Text, View, type ViewProps } from "react-native";
import { resolveProjectColor } from "@second-brain/shared/domain/colors";
import { isOverdue } from "@second-brain/shared/domain/buckets";
import { todayISO } from "@second-brain/shared/domain/dates";
import type { Task, Priority } from "@second-brain/shared/db/tasks";
import type { ProjectMeta } from "@/lib/use-today";

// Priority chips are the ONLY saturated color; A/B carry it, C/D stay neutral.
const CHIP_BG: Record<Priority, string> = {
  A: "bg-prio-a-bg",
  B: "bg-prio-b-bg",
  C: "bg-surface-3",
  D: "bg-surface-3",
};
const CHIP_FG: Record<Priority, string> = {
  A: "text-prio-a-fg",
  B: "text-prio-b-fg",
  C: "text-fg-secondary",
  D: "text-fg-secondary",
};

function PriorityChip({ priority, dim }: { priority: Priority; dim?: boolean }) {
  return (
    <View
      className={`h-6 w-6 items-center justify-center rounded ${dim ? "bg-surface-3" : CHIP_BG[priority]}`}
    >
      <Text
        className={`text-xs font-medium ${dim ? "text-fg-muted" : CHIP_FG[priority]}`}
      >
        {priority}
      </Text>
    </View>
  );
}

function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * One task row, reused across Today / Tasks / Inbox. Anatomy:
 * [leading (done pill)] [priority chip] [title + project dot·name·sub] [when].
 * `struck` dims the chip + strikes the title while completing; `trailing`
 * overrides the right-side "when" (used to slot the inline Undo during grace).
 */
export function TaskRow({
  task,
  project,
  struck,
  leading,
  trailing,
}: {
  task: Task;
  project?: ProjectMeta;
  struck?: boolean;
  leading?: ViewProps["children"];
  trailing?: ViewProps["children"];
}) {
  const today = todayISO();
  const dot = resolveProjectColor(project?.color);
  const sub = isOverdue(task, today)
    ? "late"
    : task.effort === "quick"
      ? "quick win"
      : task.start_at
        ? "now"
        : "today";
  const time = task.start_at ? fmtClock(task.start_at) : null;

  return (
    <View className="min-h-11 flex-row items-center gap-3 py-2">
      {leading}
      <PriorityChip priority={task.priority} dim={struck} />
      <View className="flex-1 gap-0.5">
        <Text
          className={struck ? "text-fg-muted line-through" : "text-fg"}
          numberOfLines={1}
        >
          {task.title}
        </Text>
        <View className="flex-row items-center gap-1.5">
          {dot ? (
            <View
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: dot }}
            />
          ) : null}
          {project?.name ? (
            <Text className="text-sm text-fg-muted" numberOfLines={1}>
              {project.name}
            </Text>
          ) : null}
          <Text className="text-sm text-fg-muted">·</Text>
          <Text className="text-sm text-fg-muted">{sub}</Text>
        </View>
      </View>
      {trailing ?? (time ? <Text className="text-sm text-fg-muted">{time}</Text> : null)}
    </View>
  );
}
