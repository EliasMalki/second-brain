import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { Text } from "@/components/ui/text";
import { BackHeader } from "@/components/back-header";

/**
 * The note (drill-down level 3). Placeholder for S1 — the shared editor in a
 * DOM component + autosave land in S2/S5. Full-screen: back chevron, no
 * capture dock (the editor owns the keyboard).
 */
export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      <BackHeader title="Note" />
      <View className="flex-1 items-center justify-center gap-2 px-6">
        <Text className="text-fg-muted">Note editor (S1 skeleton)</Text>
        <Text className="text-fg-muted text-xs">id: {id}</Text>
      </View>
    </SafeAreaView>
  );
}
