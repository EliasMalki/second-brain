import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/lib/auth-context";

// Auth gate for the app's signed-in surface. While the session is still being
// restored the splash is up, so render nothing; with no session, bounce to
// sign-in. sign-in and auth/callback live OUTSIDE this group, so they stay
// reachable while signed out.
export default function AppLayout() {
  const { session, loading } = useAuth();

  if (loading) return null;
  if (!session) return <Redirect href="/sign-in" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
