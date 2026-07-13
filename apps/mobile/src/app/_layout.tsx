import { Stack } from "expo-router";

// Minimal root during scaffold. Providers, the splash gate, and the auth-gated
// route groups are layered on in the auth step.
export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
