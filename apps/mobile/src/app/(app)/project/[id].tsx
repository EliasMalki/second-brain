import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { resolveProjectColor } from "@second-brain/shared/domain/colors";
import { ScreenHeader } from "@/components/screen-header";

/**
 * Placeholder project view — the drawer's project rows navigate here so the
 * sidebar behaves like web's without building the real project screen (that's
 * Phase 3). Name/color arrive as params; no fetch, no new feature.
 */
export default function ProjectStub() {
  const { name, color } = useLocalSearchParams<{
    id: string;
    name?: string;
    color?: string;
  }>();
  const dot = resolveProjectColor(typeof color === "string" ? color : null);
  const title = typeof name === "string" && name ? name : "Project";

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      <ScreenHeader title={title} />
      <View className="flex-1 items-center justify-center gap-3 px-6 pb-24">
        <View
          className="h-2.5 w-2.5 rounded-full bg-fg-muted"
          style={dot ? { backgroundColor: dot } : undefined}
        />
        <Text className="text-center text-fg-muted">
          The full project view is coming later — use the web app for now.
        </Text>
      </View>
    </SafeAreaView>
  );
}
