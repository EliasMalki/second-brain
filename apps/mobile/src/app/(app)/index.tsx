import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { listTasks } from "@second-brain/shared/db/tasks";
import { APP_NAME } from "@/lib/branding";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";

/**
 * Placeholder home — proof the whole shared pipeline works end to end: an
 * authenticated session, a resolved org, and a real org-scoped shared query
 * (listTasks). The actual screens (capture, today, tasks, inbox, calendar)
 * land in later steps. Styled only with design tokens so the theme is visible.
 */
export default function Home() {
  const { session, orgId, orgError, retryOrg, signOut } = useAuth();
  const [taskCount, setTaskCount] = useState<number | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    setTaskError(null);
    listTasks(supabase, orgId)
      .then((tasks) => setTaskCount(tasks.length))
      .catch((e) =>
        setTaskError(e instanceof Error ? e.message : "Failed to load tasks"),
      );
  }, [orgId]);

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 gap-4 px-6 pt-6">
        <Text className="text-xl text-fg">{APP_NAME}</Text>
        <Text className="text-fg-muted">
          Signed in as {session?.user.email}
        </Text>

        {orgError ? (
          <View className="gap-2">
            <Text className="text-danger">{orgError}</Text>
            <Pressable
              onPress={retryOrg}
              className="h-11 items-center justify-center rounded bg-surface-3 px-4"
            >
              <Text className="text-fg">Retry</Text>
            </Pressable>
          </View>
        ) : (
          <Text className="text-fg-muted">
            Workspace: {orgId ?? "resolving…"}
          </Text>
        )}

        {orgId ? (
          <Text className="text-fg">
            Open tasks:{" "}
            {taskError ?? (taskCount === null ? "loading…" : taskCount)}
          </Text>
        ) : null}

        <Pressable
          onPress={signOut}
          className="mt-2 h-11 items-center justify-center rounded bg-surface-3 px-4"
        >
          <Text className="text-fg">Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
