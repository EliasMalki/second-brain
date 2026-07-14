import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import * as Haptics from "expo-haptics";
import type { CompletionPhase } from "@second-brain/shared/ui/use-row-completion";

const DISARM_MS = 2500;

/**
 * Native Done control — the view layer of the shared grace hook. Touch-only
 * two-step (no hover on mobile): idle circle → first tap ARMS (pale green) →
 * second tap COMMITS (kicks off the grace via onComplete). Auto-disarms after
 * 2.5s. Once completing (`phase` set) or settled `done`, it's a solid green
 * check. Haptics: a tick on arm, a success notification on commit.
 */
export function DonePill({
  phase,
  done,
  onComplete,
}: {
  phase?: CompletionPhase;
  done?: boolean;
  onComplete: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const disarmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(
    () => () => {
      if (disarmTimer.current) clearTimeout(disarmTimer.current);
    },
    [],
  );

  const settled = done || !!phase;

  const onPress = () => {
    if (settled) return;
    if (!armed) {
      setArmed(true);
      void Haptics.selectionAsync();
      disarmTimer.current = setTimeout(() => setArmed(false), DISARM_MS);
      return;
    }
    if (disarmTimer.current) clearTimeout(disarmTimer.current);
    setArmed(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onComplete();
  };

  return (
    <Pressable
      onPress={onPress}
      // 32px visual + 8px hitSlop = a 48px touch target without inflating the
      // 13px row padding the way a 44px box would.
      hitSlop={8}
      accessibilityLabel={armed ? "Confirm complete" : "Complete task"}
      className="h-8 w-8 items-center justify-center"
    >
      <View
        className={`h-6 w-6 items-center justify-center rounded-full border ${
          settled
            ? "border-ok-solid bg-ok-solid"
            : armed
              ? "border-ok-bd bg-ok-bg"
              : "border-border-2"
        }`}
      >
        {settled ? (
          <Text className="text-xs font-medium text-ok-fg">✓</Text>
        ) : armed ? (
          <Text className="text-xs font-medium text-ok">✓</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Inline row Undo, shown only during the grace window. */
export function RowUndo({ onUndo }: { onUndo: () => void }) {
  return (
    <Pressable
      onPress={onUndo}
      hitSlop={8}
      className="h-11 justify-center px-1"
    >
      <Text className="font-medium text-ok-solid">Undo</Text>
    </Pressable>
  );
}
