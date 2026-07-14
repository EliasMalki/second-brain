import { Redirect } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { useColorScheme, useWindowDimensions } from "react-native";
import { tokenColor } from "@second-brain/shared/design/tokens";
import { useAuth } from "@/lib/auth-context";
import { CaptureDockProvider } from "@/lib/capture-dock-context";
import { AppDrawer } from "@/components/app-drawer";

// Auth gate for the app's signed-in surface. While the session restores the
// splash is up (render nothing); with no session, bounce to sign-in. sign-in and
// auth/callback live OUTSIDE this group, so they stay reachable while signed out.
//
// The signed-in surface is a left drawer (matching web's sidebar) + the
// persistent bottom capture composer — NO tab bar; the composer owns the bottom
// of the screen. `index` (Home/Today) is declared first so the app launches on
// the brief. The drawer opens by hamburger (ScreenHeader) and left-edge swipe.
// Drawer panel colors are RN style props NativeWind can't reach, so they read
// the shared token map directly, keyed off the (possibly overridden) scheme.
export default function AppLayout() {
  const { session, loading } = useAuth();
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const { width } = useWindowDimensions();

  if (loading) return null;
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <CaptureDockProvider>
      <Drawer
        drawerContent={() => <AppDrawer />}
        screenOptions={{
          headerShown: false,
          drawerType: "front",
          swipeEnabled: true,
          swipeEdgeWidth: 32,
          // web's .sidebar-backdrop scrim + .sidebar surface/sizing (82vw, max 300px)
          overlayColor: tokenColor("scrim", scheme),
          drawerStyle: {
            width: Math.min(width * 0.82, 300),
            backgroundColor: tokenColor("surface-2", scheme),
          },
        }}
      >
        <Drawer.Screen name="index" options={{ title: "Home" }} />
        <Drawer.Screen name="tasks" options={{ title: "Tasks" }} />
        <Drawer.Screen name="inbox" options={{ title: "Inbox" }} />
        <Drawer.Screen name="calendar" options={{ title: "Calendar" }} />
      </Drawer>
    </CaptureDockProvider>
  );
}
