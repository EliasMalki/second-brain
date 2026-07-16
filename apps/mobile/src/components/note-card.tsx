import { memo } from "react";
import { Pressable, View } from "react-native";
import { fmtAgo } from "@second-brain/shared/domain/dates";
import type { PreviewLine } from "@second-brain/shared/domain/markdown";
import type { Note } from "@second-brain/shared/db/notes";
import { Text } from "@/components/ui/text";
import { noteTitle, notePreview } from "@/lib/note-format";

/** One preview line, styled by its kind (bullet dash, task boxes, heading). */
function PreviewRow({ line }: { line: PreviewLine }) {
  const dim = line.kind === "task-done";
  return (
    <View className="flex-row items-center gap-1">
      {line.kind === "bullet" ? (
        <Text className="text-[12px] text-fg-muted">–</Text>
      ) : line.kind === "task-open" ? (
        <View className="h-2.5 w-2.5 rounded-[3px] border border-fg-muted" />
      ) : line.kind === "task-done" ? (
        <View className="h-2.5 w-2.5 items-center justify-center rounded-[3px] bg-fg-muted" />
      ) : null}
      <Text
        numberOfLines={1}
        className={`flex-1 text-[12px] ${
          line.kind === "heading"
            ? "font-medium text-fg"
            : dim
              ? "text-fg-muted"
              : "text-fg-secondary"
        }`}
      >
        {line.text}
      </Text>
    </View>
  );
}

/**
 * A note as a card (mobile): title (+ pin glyph), up to 4 real preview lines
 * from body_text, a relative timestamp, and a quiet ⋯ menu. Same anatomy as
 * web, scaled for a 2-column phone grid. Hairline border, primary surface —
 * no fills, no thumbnails.
 */
export const NoteCard = memo(function NoteCard({
  note,
  onOpen,
  onMenu,
}: {
  note: Note;
  onOpen: () => void;
  onMenu: () => void;
}) {
  const lines = notePreview(note, 4);
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Note, ${noteTitle(note)}`}
      className="min-h-[128px] flex-1 rounded-xl border border-border bg-surface p-3"
    >
      <View className="mb-1 flex-row items-center gap-1">
        {note.pinned ? (
          <Text className="text-[11px] text-fg-muted">★</Text>
        ) : null}
        <Text
          numberOfLines={1}
          className="flex-1 text-[14px] font-medium text-fg"
        >
          {noteTitle(note)}
        </Text>
      </View>

      <View className="flex-1 gap-0.5">
        {lines.length === 0 ? (
          <Text className="text-[12px] text-fg-muted">No additional text</Text>
        ) : (
          lines.map((line, i) => <PreviewRow key={i} line={line} />)
        )}
      </View>

      <View className="mt-2 flex-row items-center justify-between">
        <Text className="text-[11px] text-fg-muted">
          {fmtAgo(note.updated_at)}
        </Text>
        <Pressable
          onPress={onMenu}
          accessibilityRole="button"
          accessibilityLabel="Note actions"
          hitSlop={8}
          className="h-6 w-6 items-center justify-center"
        >
          <Text className="text-[15px] leading-none text-fg-muted">⋯</Text>
        </Pressable>
      </View>
    </Pressable>
  );
});
