import "../global.css";
import { useEffect } from "react";
import { Stack, router } from "expo-router";
import * as Linking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/lib/auth-context";

// Hold the native splash until the first session restore resolves (SplashGate),
// so there's no flash of the sign-in screen for an already-authenticated user.
SplashScreen.preventAutoHideAsync();

function SplashGate() {
  const { loading } = useAuth();
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);
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
          <Stack screenOptions={{ headerShown: false }} />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
