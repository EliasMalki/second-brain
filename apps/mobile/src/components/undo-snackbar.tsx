import { useEffect } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";

const AUTO_HIDE_MS = 5000;

/**
 * A single bottom snackbar with an Undo action (the Inbox's reverse-an-action
 * affordance, matching web's undo toast). Shown while `message` is set; owns its
 * own auto-hide timer (re-armed whenever the message changes) and calls
 * `onExpire` when it lapses. Positions against the screen's CONTENT area
 * (ScreenShell), whose bottom edge is where the capture dock begins — so it
 * always floats just above the dock with no inset math.
 */
export function UndoSnackbar({
  message,
  nonce,
  onUndo,
  onExpire,
}: {
  message: string | null;
  /** Bumped per action so the timer re-arms even when the message text repeats
   *  (two "Note archived" in a row would otherwise share one stale timer). */
  nonce: number;
  onUndo: () => void;
  onExpire: () => void;
}) {
  useEffect(() => {
    if (message == null) return;
    const t = setTimeout(onExpire, AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [nonce, message, onExpire]);

  if (message == null) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 0, right: 0, bottom: 12 }}
      className="items-center px-6"
    >
      <View className="w-full max-w-md flex-row items-center justify-between rounded-lg bg-accent px-4 py-3">
        <Text className="flex-1 text-accent-fg" numberOfLines={1}>
          {message}
        </Text>
        <Pressable onPress={onUndo} hitSlop={8} className="h-8 justify-center pl-4">
          <Text className="font-medium text-accent-fg underline">Undo</Text>
        </Pressable>
      </View>
    </View>
  );
}
