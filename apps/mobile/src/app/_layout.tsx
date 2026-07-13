import "../global.css";
import { Stack } from "expo-router";

// Minimal root during scaffold. Providers, the splash gate, and the auth-gated
// route groups are layered on in the auth step. global.css must be imported at
// the app root so NativeWind registers the design tokens before first paint.
export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
