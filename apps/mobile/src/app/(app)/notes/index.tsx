import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Text } from "@/components/ui/text";
import { ScreenShell } from "@/components/screen-shell";

/**
 * Notes home (drill-down level 1). Placeholder for S1 — the real folders /
 * search / pinned surface lands in S3. Uses ScreenShell (hamburger + capture
 * dock), like the other drawer screens.
 */
export default function NotesHomeScreen() {
  return (
    <ScreenShell title="Notes">
      <View className="flex-1 items-center justify-center gap-4 px-6">
        <Text className="text-fg-muted">Notes home (S1 skeleton)</Text>
        <Pressable
          onPress={() => router.push("/notes/list")}
          accessibilityRole="button"
          className="h-11 items-center justify-center rounded-md border border-border bg-surface px-4"
        >
          <Text className="text-fg">Open a folder →</Text>
        </Pressable>
      </View>
    </ScreenShell>
  );
}
