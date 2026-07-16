import { Pressable, View } from "react-native";
import type { EditorCommand } from "@second-brain/editor/core";
import { Text } from "@/components/ui/text";

/**
 * Formatting bar pinned above the iOS keyboard while the editor is focused —
 * discoverability for the markdown commands (checkbox, bold, italic, heading,
 * list, indent) so they aren't shortcuts you have to already know. Each button
 * dispatches an editor command over the DOM bridge (the parent bumps
 * command.seq). It's a plain RN view (not InputAccessoryView, which can't bind
 * to a WebView) positioned at the keyboard's top edge.
 */

const ITEMS: { cmd: EditorCommand; glyph: string; label: string; bold?: boolean; italic?: boolean }[] = [
  { cmd: "task", glyph: "☑", label: "Checkbox" },
  { cmd: "bold", glyph: "B", label: "Bold", bold: true },
  { cmd: "italic", glyph: "I", label: "Italic", italic: true },
  { cmd: "heading-2", glyph: "H", label: "Heading" },
  { cmd: "bullet-list", glyph: "•", label: "List" },
  { cmd: "indent", glyph: "⇥", label: "Indent" },
];

export function KeyboardToolbar({
  visible,
  bottom,
  onCommand,
}: {
  visible: boolean;
  bottom: number;
  onCommand: (cmd: EditorCommand) => void;
}) {
  if (!visible) return null;
  return (
    <View
      style={{ position: "absolute", left: 0, right: 0, bottom }}
      className="h-11 flex-row items-center border-t border-border bg-surface-2 px-2"
    >
      {ITEMS.map((item) => (
        <Pressable
          key={item.cmd}
          onPress={() => onCommand(item.cmd)}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          className="h-11 w-11 items-center justify-center"
        >
          <Text
            allowFontScaling={false}
            className={`text-[17px] text-fg ${item.bold ? "font-bold" : ""}`}
            style={item.italic ? { fontStyle: "italic" } : undefined}
          >
            {item.glyph}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
