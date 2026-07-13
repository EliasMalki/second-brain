import { Text, View } from "react-native";
import { todayISO } from "@second-brain/shared/domain/dates";
import { listTasks } from "@second-brain/shared/db/tasks";

// Scaffold proof-of-plumbing: importing from BOTH a domain module and a db
// module (the latter pulls in @supabase/supabase-js) verifies Metro resolves
// @second-brain/shared's raw-TS `./*` subpath exports across the monorepo.
// Referenced as a value so the import can't be elided from the bundle.
const sharedDbResolves = typeof listTasks === "function";

export default function Index() {
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-bg px-6">
      <Text className="text-lg text-fg">Second Brain — scaffold OK</Text>
      <Text className="text-fg-muted">today (shared/domain): {todayISO()}</Text>
      <Text className="text-fg-muted">
        shared/db resolves: {String(sharedDbResolves)}
      </Text>
      {/* Priority-A chip: the only saturated color, proving tokens + NativeWind. */}
      <View className="rounded-sm bg-prio-a-bg px-2 py-1">
        <Text className="font-medium text-prio-a-fg">A</Text>
      </View>
    </View>
  );
}
