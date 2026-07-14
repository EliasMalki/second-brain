import type { Session } from "@supabase/supabase-js";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/auth-context";
import { useToday } from "@/lib/use-today";
import { useCompletion } from "@/lib/use-completion";
import { TaskCard } from "@/components/completing-row";
import { ScreenShell } from "@/components/screen-shell";

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

// web .h-card-h .ttl — 11px / fw-label(500-ish) / uppercase card titles
function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="text-[11px] font-medium uppercase text-fg-muted">
      {children}
    </Text>
  );
}

/** web .h-sub .dotsep — the 3px round separator between subline fragments. */
function DotSep() {
  return <View className="h-[3px] w-[3px] rounded-full bg-fg-muted opacity-60" />;
}

export default function Home() {
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
    <ScreenShell title="Home">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pt-2 pb-4 gap-5"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        <View className="gap-[5px] pt-2">
          {/* web .h-greet: 30px / fw-heading(500) / -0.02em */}
          <Text className="text-[30px] font-medium tracking-[-0.6px] text-fg">
            {greeting()}, {firstNameFrom(session)}
          </Text>
          {/* web .h-sub: 13.5px muted fragments joined by 3px dot separators */}
          <View className="flex-row flex-wrap items-center gap-2.5">
            <Text className="text-[13.5px] text-fg-muted">{fullDate()}</Text>
            <DotSep />
            <Text className="text-[13.5px] text-fg-muted">
              {today.length} on deck
            </Text>
            <DotSep />
            <Text className="text-[13.5px] text-fg-muted">
              {quickWins} quick win{quickWins === 1 ? "" : "s"}
            </Text>
          </View>
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
                <Text className="text-[13px] text-fg-muted">
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
              <Text className="text-[13px] text-fg-muted">
                {doneToday} done today.
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </ScreenShell>
  );
}
