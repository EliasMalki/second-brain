import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Note } from "@second-brain/shared/db/notes";
import { Text } from "@/components/ui/text";
import { noteTitle } from "@/lib/note-format";

/**
 * Note actions bottom sheet (pin / move / archive) — the mobile equivalent of
 * the web card's ⋯ menu. Same hand-rolled Modal idiom as RescheduleSheet.
 * Open when `note` is set; each action fires and closes. Move opens the
 * project picker (orchestrated by the caller).
 */
export function NoteActionsSheet({
  note,
  onClose,
  onTogglePin,
  onMove,
  onArchive,
}: {
  note: Note | null;
  onClose: () => void;
  onTogglePin: (note: Note) => void;
  onMove: (note: Note) => void;
  onArchive: (note: Note) => void;
}) {
  const insets = useSafeAreaInsets();

  const rows: { key: string; label: string; run: (n: Note) => void }[] = note
    ? [
        {
          key: "pin",
          label: note.pinned ? "Unpin" : "Pin",
          run: onTogglePin,
        },
        { key: "move", label: "Move to project…", run: onMove },
        {
          key: "archive",
          label: note.archived ? "Unarchive" : "Archive",
          run: onArchive,
        },
      ]
    : [];

  return (
    <Modal
      transparent
      visible={note != null}
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 justify-end bg-scrim"
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Pressable
          onPress={() => {}}
          accessibilityViewIsModal
          style={{ paddingBottom: insets.bottom + 8 }}
          className="rounded-t-2xl border-t border-border bg-surface px-4 pt-2"
        >
          <View className="items-center py-2">
            <View className="h-1 w-9 rounded-full bg-border-2" />
          </View>
          <Text className="px-2 pb-2 text-sm text-fg-muted" numberOfLines={1}>
            {note ? noteTitle(note) : ""}
          </Text>
          <View className="rounded-lg border border-border">
            {rows.map((r, i) => (
              <Pressable
                key={r.key}
                onPress={() => note && r.run(note)}
                accessibilityRole="button"
                accessibilityLabel={r.label}
                className={`h-12 flex-row items-center px-4 ${
                  i > 0 ? "border-t border-border" : ""
                }`}
              >
                <Text className="text-fg">{r.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
