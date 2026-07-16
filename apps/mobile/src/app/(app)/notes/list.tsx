import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Text } from "@/components/ui/text";
import { BackHeader } from "@/components/back-header";

/**
 * Note list (drill-down level 2). Placeholder for S1 — the real 2-column card
 * grid lands in S4. Deeper stack screen: back chevron, no capture dock.
 */
export default function NoteListScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      <BackHeader title="All Notes" />
      <View className="flex-1 items-center justify-center gap-4 px-6">
        <Text className="text-fg-muted">Note list (S1 skeleton)</Text>
        <Pressable
          onPress={() => router.push("/notes/spike")}
          accessibilityRole="button"
          className="h-11 items-center justify-center rounded-md border border-border bg-surface px-4"
        >
          <Text className="text-fg">Open a note →</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
