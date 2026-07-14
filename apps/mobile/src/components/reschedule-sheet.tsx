import { Modal, Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  addDaysISO,
  endOfWeekISO,
  fmtShort,
  todayISO,
} from "@second-brain/shared/domain/dates";
import type { Task } from "@second-brain/shared/db/tasks";

type Option = { key: string; label: string; value: string | null };

/** The quick-date set, matching web's add-task chips: Today · Tomorrow · End of
 *  week · No date. Resolved via shared date helpers — never hand-rolled math. */
function options(): Option[] {
  const today = todayISO();
  return [
    { key: "today", label: "Today", value: today },
    { key: "tomorrow", label: "Tomorrow", value: addDaysISO(today, 1) },
    { key: "eow", label: "End of week", value: endOfWeekISO() },
    { key: "none", label: "No date", value: null },
  ];
}

/**
 * Bottom-sheet reschedule picker (the quick-date sheet deferred from Step 3).
 * Open when `task` is set; tapping an option moves the task's scheduled_for and
 * closes. A calendar picker (arbitrary dates) is intentionally not here yet —
 * the four quick options cover the common moves without a new dependency.
 */
export function RescheduleSheet({
  task,
  onClose,
  onPick,
}: {
  task: Task | null;
  onClose: () => void;
  onPick: (scheduledFor: string | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const opts = options();

  return (
    <Modal
      transparent
      visible={task != null}
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Backdrop tap closes; inner Pressable absorbs taps so they don't. */}
      <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
        <Pressable
          onPress={() => {}}
          style={{ paddingBottom: insets.bottom + 8 }}
          className="rounded-t-2xl border-t border-border bg-surface px-4 pt-2"
        >
          <View className="items-center py-2">
            <View className="h-1 w-9 rounded-full bg-border-2" />
          </View>
          <View className="gap-0.5 px-2 pb-2">
            <Text className="text-sm text-fg-muted">Reschedule</Text>
            <Text className="text-fg" numberOfLines={1}>
              {task?.title ?? ""}
            </Text>
          </View>
          <View className="rounded-lg border border-border">
            {opts.map((o, i) => (
              <Pressable
                key={o.key}
                onPress={() => onPick(o.value)}
                className={`h-12 flex-row items-center justify-between px-4 ${
                  i > 0 ? "border-t border-border" : ""
                }`}
              >
                <Text className="text-fg">{o.label}</Text>
                {o.value ? (
                  <Text className="text-sm text-fg-muted">{fmtShort(o.value)}</Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
