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
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
      <Text>Second Brain — scaffold OK</Text>
      <Text>today (shared/domain): {todayISO()}</Text>
      <Text>shared/db resolves: {String(sharedDbResolves)}</Text>
    </View>
  );
}
