import { KeyboardAvoidingView, Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "./screen-header";
import { CaptureDockBar } from "./capture-dock";

/**
 * The frame every drawer screen renders in: safe area → keyboard avoidance →
 * header (hamburger · title · actions) → the screen's content → the persistent
 * capture dock. The dock is IN-FLOW at the bottom of the column (not an
 * overlay), so content ends above it naturally and the keyboard lifts it on
 * every screen — the composer owns the bottom of the screen; there is no tab
 * bar. Screens supply only their scrollable content (and sheets/snackbars,
 * which position against the content area).
 */
export function ScreenShell({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScreenHeader title={title} right={right} />
        <View className="flex-1">{children}</View>
        <CaptureDockBar />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
