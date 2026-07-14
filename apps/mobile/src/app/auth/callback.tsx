import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

// Magic-link tokens are single-use; guard so a remount or a duplicate deep-link
// event can't fire verifyOtp twice for the same token (the second would fail
// and flash an error after a real success).
const consumed = new Set<string>();

/**
 * Deep-link landing (public route, outside the auth-gated group). The root
 * DeepLinkHandler routes here with token_hash+type parsed from the raw URL; we
 * run the same verifyOtp the web uses. Success establishes the session and the
 * app gate takes over.
 */
export default function AuthCallback() {
  const { token_hash, type } = useLocalSearchParams<{
    token_hash?: string;
    type?: string;
  }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof token_hash !== "string" || typeof type !== "string") {
      setError("This sign-in link is missing its token. Request a new one.");
      return;
    }
    if (consumed.has(token_hash)) return;
    consumed.add(token_hash);
    supabase.auth
      .verifyOtp({ type: type as EmailOtpType, token_hash })
      .then(({ error: err }) => {
        if (err) setError(err.message);
        else router.replace("/");
      });
  }, [token_hash, type]);

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-4 px-6">
        {error ? (
          <>
            <Text className="text-center text-danger">{error}</Text>
            <Pressable
              onPress={() => router.replace("/sign-in")}
              className="h-11 items-center justify-center rounded bg-surface-3 px-4"
            >
              <Text className="text-fg">Back to sign in</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator />
            <Text className="text-fg-muted">Signing you in…</Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
