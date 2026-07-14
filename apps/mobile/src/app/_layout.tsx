import "../global.css";
import { useEffect, useState } from "react";
import { Stack, router } from "expo-router";
import * as Linking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { initTheme } from "@/lib/theme";

// Hold the native splash until the first session restore resolves (SplashGate),
// so there's no flash of the sign-in screen for an already-authenticated user.
SplashScreen.preventAutoHideAsync();

// Restore the persisted theme override alongside the session restore, so a
// forced light/dark never flashes the system scheme on cold start.
const themeReady = initTheme();

function SplashGate() {
  const { loading } = useAuth();
  const [theme, setTheme] = useState(false);
  useEffect(() => {
    void themeReady.then(() => setTheme(true));
  }, []);
  useEffect(() => {
    if (!loading && theme) SplashScreen.hideAsync();
  }, [loading, theme]);
  return null;
}

/**
 * Single authority for magic-link deep links. iOS opens the app for anything on
 * the `servo://` scheme regardless of how the host/path parse, so we read
 * the RAW url, pull token_hash+type from its query ourselves, and navigate
 * internally to /auth/callback (by pathname — deterministic, unlike matching the
 * scheme URL to a route). The callback screen does the one-time verifyOtp.
 */
function DeepLinkHandler() {
  const url = Linking.useURL();
  useEffect(() => {
    if (!url) return;
    const { queryParams } = Linking.parse(url);
    const tokenHash = queryParams?.token_hash;
    const type = queryParams?.type;
    if (typeof tokenHash === "string" && typeof type === "string") {
      router.replace({
        pathname: "/auth/callback",
        params: { token_hash: tokenHash, type },
      });
    }
  }, [url]);
  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <SplashGate />
          <DeepLinkHandler />
          {/* "auto" resolves via useColorScheme, so the status bar follows the
              user's in-app theme override, not just the OS scheme. */}
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }} />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
