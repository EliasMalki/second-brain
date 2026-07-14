import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { resolveProjectColor } from "@second-brain/shared/domain/colors";
import { ScreenShell } from "@/components/screen-shell";

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
    <ScreenShell title={title}>
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <View
          className="h-2.5 w-2.5 rounded-full bg-fg-muted"
          style={dot ? { backgroundColor: dot } : undefined}
        />
        <Text className="text-center text-fg-muted">
          The full project view is coming later — use the web app for now.
        </Text>
      </View>
    </ScreenShell>
  );
}
