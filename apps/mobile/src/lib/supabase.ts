// URL/fetch polyfill supabase-js needs on React Native. Import before the client.
import "react-native-url-polyfill/auto";
import { AppState } from "react-native";
import { processLock } from "@supabase/supabase-js";
import { createSupabaseClient } from "@second-brain/shared";
import { env } from "./env";
import { largeSecureStore } from "./large-secure-store";

/**
 * The app's single Supabase client, built from the shared factory with native
 * auth options. The session persists in encrypted on-device storage and the
 * library refreshes tokens while the app is foreground.
 *
 * detectSessionInUrl is off — there is no browser URL to read a session from on
 * native; the magic-link deep link is verified explicitly (verifyOtp) instead.
 */
export const supabase = createSupabaseClient(
  env.supabaseUrl,
  env.supabaseAnonKey,
  {
    auth: {
      storage: largeSecureStore,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
  },
);

// Supabase's recommended RN lifecycle: refresh tokens only while foreground.
// The initial startAutoRefresh() covers the already-active launch state — the
// listener alone would miss it (it fires on CHANGE, not on the current state).
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
supabase.auth.startAutoRefresh();
