import {
  Modal,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolveProjectColor } from "@second-brain/shared/domain/colors";
import type { ProjectOption } from "@/lib/use-tasks";

/**
 * Bottom-sheet project picker for the Inbox "File to…" action. Open when
 * `title` is set (the caller keys visibility off a target item). Same Modal
 * idiom as RescheduleSheet: backdrop closes, inner Pressable absorbs taps.
 */
export function ProjectPickerSheet({
  title,
  projects,
  onPick,
  onClose,
  leading,
}: {
  /** Sheet header (e.g. "File to…"); null = closed. */
  title: string | null;
  projects: ProjectOption[];
  onPick: (projectId: string, projectName: string) => void;
  onClose: () => void;
  /** Optional first row (e.g. "Inbox / Unfiled" for moving a note out). */
  leading?: { label: string; onPress: () => void };
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      transparent
      visible={title != null}
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable className="flex-1 justify-end bg-scrim" onPress={onClose}>
        <Pressable
          onPress={() => {}}
          style={{ paddingBottom: insets.bottom + 8, maxHeight: "70%" }}
          className="rounded-t-2xl border-t border-border bg-surface px-4 pt-2"
        >
          <View className="items-center py-2">
            <View className="h-1 w-9 rounded-full bg-border-2" />
          </View>
          <Text className="px-2 pb-2 text-sm text-fg-muted">{title ?? ""}</Text>
          <ScrollView className="rounded-lg border border-border">
            {leading ? (
              <Pressable
                onPress={leading.onPress}
                className="h-12 flex-row items-center px-4"
              >
                <Text className="text-fg">{leading.label}</Text>
              </Pressable>
            ) : null}
            {projects.length === 0 && !leading ? (
              <Text className="px-4 py-3 text-fg-muted">No projects yet.</Text>
            ) : (
              projects.map((p, i) => {
                const dot = resolveProjectColor(p.color);
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => onPick(p.id, p.name)}
                    className={`h-12 flex-row items-center gap-2 px-4 ${
                      i > 0 || leading ? "border-t border-border" : ""
                    }`}
                  >
                    {dot ? (
                      <View
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: dot }}
                      />
                    ) : null}
                    <Text className="text-fg">{p.name}</Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
