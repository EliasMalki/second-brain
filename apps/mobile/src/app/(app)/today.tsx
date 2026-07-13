import type { Session } from "@supabase/supabase-js";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { useToday } from "@/lib/use-today";
import { useCompletion } from "@/lib/use-completion";
import { TaskCard } from "@/components/completing-row";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function firstNameFrom(session: Session | null): string {
  const meta = session?.user?.user_metadata as
    | { name?: unknown; full_name?: unknown }
    | undefined;
  const raw =
    (typeof meta?.name === "string" && meta.name) ||
    (typeof meta?.full_name === "string" && meta.full_name) ||
    session?.user?.email?.split("@")[0] ||
    "there";
  return String(raw).split(" ")[0];
}

function fullDate(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="text-sm font-medium uppercase tracking-wide text-fg-muted">
      {children}
    </Text>
  );
}

export default function Today() {
  const { session } = useAuth();
  const {
    loading,
    refreshing,
    today,
    hiddenCount,
    waiting,
    doneToday,
    quickWins,
    projects,
    refresh,
  } = useToday();

  const c = useCompletion(refresh);

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pt-2 pb-8 gap-5"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        <View className="gap-1 pt-2">
          <Text className="text-2xl text-fg">
            {greeting()}, {firstNameFrom(session)}
          </Text>
          <Text className="text-fg-muted">
            {fullDate()} · {today.length} on deck · {quickWins} quick win
            {quickWins === 1 ? "" : "s"}
          </Text>
        </View>

        {loading ? (
          <View className="items-center py-8">
            <ActivityIndicator />
          </View>
        ) : (
          <>
            <View className="gap-2">
              <SectionLabel>Today</SectionLabel>
              {today.length === 0 ? (
                <Text className="py-2 text-fg-muted">
                  Nothing scheduled for today — enjoy the space.
                </Text>
              ) : (
                <TaskCard tasks={today} projects={projects} c={c} />
              )}
              {hiddenCount > 0 ? (
                <Text className="text-sm text-fg-muted">
                  {hiddenCount} hidden until 9–5
                </Text>
              ) : null}
            </View>

            {waiting.length > 0 ? (
              <View className="gap-2">
                <SectionLabel>Waiting / follow-ups</SectionLabel>
                <TaskCard tasks={waiting} projects={projects} c={c} />
              </View>
            ) : null}

            {doneToday > 0 ? (
              <Text className="text-sm text-fg-muted">{doneToday} done today.</Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
