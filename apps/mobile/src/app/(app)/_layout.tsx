import { Redirect } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { useColorScheme } from "react-native";
import { useAuth } from "@/lib/auth-context";

// Auth gate for the app's signed-in surface. While the session restores the
// splash is up (render nothing); with no session, bounce to sign-in. sign-in and
// auth/callback live OUTSIDE this group, so they stay reachable while signed out.
//
// The signed-in surface is a bottom tab bar (Capture + Today). `index` (Capture)
// is declared first so the app still launches on Capture. Tab-bar colors are RN
// style props NativeWind can't reach, so they use literal design-token hexes
// (mirroring src/global.css) keyed off the system color scheme.
export default function AppLayout() {
  const { session, loading } = useAuth();
  const dark = useColorScheme() === "dark";

  if (loading) return null;
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: dark ? "#f4f4f5" : "#18181b",
        tabBarInactiveTintColor: dark ? "#a1a1aa" : "#71717a",
        tabBarStyle: {
          backgroundColor: dark ? "#1b1b1f" : "#ffffff",
          borderTopColor: dark ? "#2e2e33" : "#e4e4e7",
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Capture" }} />
      <Tabs.Screen name="today" options={{ title: "Today" }} />
    </Tabs>
  );
}
