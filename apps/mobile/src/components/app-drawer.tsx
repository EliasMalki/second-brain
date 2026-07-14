import { useEffect } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { router, usePathname } from "expo-router";
import { useDrawerStatus } from "expo-router/drawer";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolveProjectColor } from "@second-brain/shared/domain/colors";
import { useAuth } from "@/lib/auth-context";
import { useNavProjects, type NavProject } from "@/lib/use-nav-projects";
import { setThemePref, useThemePref, type ThemePref } from "@/lib/theme";

/**
 * Drawer contents — web's sidebar, one to one: primary nav, then project
 * groups (Business / Personal / Projects) with quiet color dots, then the
 * account card pinned at the bottom (avatar + email, Light/Dark/System
 * segmented control, sign out). Active row = web's .nav-item.on (lifted
 * surface, medium weight, 2.5px left accent bar). Web's search box, Notes and
 * Projects items are omitted — those screens don't exist on mobile (Phase 3).
 */

const NAV = [
  { href: "/", label: "Home" },
  { href: "/tasks", label: "Tasks" },
  { href: "/inbox", label: "Inbox" },
  { href: "/calendar", label: "Calendar" },
] as const;

// Active-row lift — web: box-shadow 0 1px 2px rgba(0,0,0,.06). Shadows are RN
// style props (not tokens on web either).
const ACTIVE_SHADOW = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  default: { elevation: 1 },
});

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function AppDrawer() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { session, signOut } = useAuth();
  const { groups, refresh } = useNavProjects();
  const status = useDrawerStatus();
  const pref = useThemePref();

  // Refetch project rows whenever the drawer opens — cheap, keeps names fresh.
  useEffect(() => {
    if (status === "open") refresh();
  }, [status, refresh]);

  const email = session?.user?.email ?? "";
  const initial = (email[0] ?? "?").toUpperCase();

  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <View
      className="flex-1 px-3"
      style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }}
    >
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="gap-px">
          {NAV.map((item) => {
            const on = isActive(item.href);
            return (
              <Pressable
                key={item.href}
                onPress={() => router.navigate(item.href)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                className={`h-11 flex-row items-center rounded-md px-2 ${
                  on ? "bg-surface" : ""
                }`}
                style={on ? ACTIVE_SHADOW : undefined}
              >
                {on ? (
                  <View className="absolute bottom-1.5 left-0 top-1.5 w-[2.5px] rounded-r bg-fg" />
                ) : null}
                <Text
                  className={`text-[13px] ${
                    on ? "font-medium text-fg" : "text-fg-secondary"
                  }`}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {groups.map((group) => (
          <View key={group.label}>
            <Text className="mb-1 mt-3 px-2 text-[11px] font-medium uppercase tracking-[0.9px] text-fg-muted">
              {group.label}
            </Text>
            <View className="gap-px">
              {group.projects.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  on={pathname === `/project/${p.id}`}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Account card — pinned under the scroll area, web's .account-card. */}
      <View className="gap-3 border-t border-border pt-3">
        <View className="flex-row items-center gap-2 px-2">
          <View className="h-[26px] w-[26px] items-center justify-center rounded-full bg-accent">
            <Text className="text-xs font-semibold text-accent-fg">
              {initial}
            </Text>
          </View>
          <Text className="flex-1 text-[13px] text-fg" numberOfLines={1}>
            {email}
          </Text>
        </View>

        <View className="flex-row rounded-md border border-border bg-surface-2 p-0.5">
          {THEME_OPTIONS.map((opt) => {
            const on = pref === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => setThemePref(opt.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                className={`h-11 flex-1 items-center justify-center rounded-[5px] ${
                  on ? "bg-surface" : ""
                }`}
                style={on ? ACTIVE_SHADOW : undefined}
              >
                <Text
                  className={`text-xs ${
                    on ? "font-medium text-fg" : "text-fg-secondary"
                  }`}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={signOut}
          accessibilityRole="button"
          className="h-11 flex-row items-center px-2"
        >
          <Text className="text-[13px] text-fg-muted">Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ProjectRow({ project, on }: { project: NavProject; on: boolean }) {
  const dot = resolveProjectColor(project.color);
  return (
    <Pressable
      onPress={() =>
        router.navigate({
          pathname: "/project/[id]",
          params: {
            id: project.id,
            name: project.name,
            color: project.color ?? "",
          },
        })
      }
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      className={`h-11 flex-row items-center gap-[7px] rounded-md pl-4 pr-2 ${
        on ? "bg-surface" : ""
      }`}
      style={on ? ACTIVE_SHADOW : undefined}
    >
      {on ? (
        <View className="absolute bottom-1.5 left-0 top-1.5 w-[2.5px] rounded-r bg-fg" />
      ) : null}
      {project.paused ? (
        // pause glyph (two bars) — web shows ti-player-pause for paused projects
        <View className="w-1.5 flex-row justify-center gap-[2px]">
          <View className="h-2 w-[1.5px] rounded-full bg-fg-muted" />
          <View className="h-2 w-[1.5px] rounded-full bg-fg-muted" />
        </View>
      ) : (
        <View
          className="h-1.5 w-1.5 rounded-full bg-fg-muted"
          style={dot ? { backgroundColor: dot } : undefined}
        />
      )}
      <Text
        numberOfLines={1}
        className={`flex-1 text-[13px] ${
          project.paused
            ? "text-fg-muted"
            : on
              ? "font-medium text-fg"
              : "text-fg-secondary"
        }`}
      >
        {project.name}
      </Text>
    </Pressable>
  );
}
