import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Text } from "@/components/ui/text";

/**
 * Header for the deeper stack screens (note list, note editor): a back chevron
 * that pops the stack, a title, and an optional right slot. Mirrors
 * ScreenHeader's layout/tokens but swaps the hamburger for a back affordance —
 * the native back-swipe does the same pop, this is the visible control.
 */
export function BackHeader({
  title,
  right,
  onBack,
}: {
  title: string;
  right?: React.ReactNode;
  onBack?: () => void;
}) {
  return (
    <View className="h-11 flex-row items-center gap-1 pl-2 pr-4">
      <Pressable
        onPress={() => (onBack ? onBack() : router.back())}
        accessibilityRole="button"
        accessibilityLabel="Back"
        className="h-11 w-11 items-center justify-center"
      >
        {/* chevron-left drawn with two bars — no icon library on mobile */}
        <View className="h-3 w-3 -rotate-45 border-b-[1.5px] border-l-[1.5px] border-fg" />
      </Pressable>
      <Text className="flex-1 text-lg text-fg" numberOfLines={1}>
        {title}
      </Text>
      {right}
    </View>
  );
}
