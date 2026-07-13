import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Today / daily-brief screen (filled in next step). Top edge only — the tab bar
// owns the bottom inset.
export default function Today() {
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      <View className="flex-1 items-center justify-center">
        <Text className="text-fg-muted">Today</Text>
      </View>
    </SafeAreaView>
  );
}
