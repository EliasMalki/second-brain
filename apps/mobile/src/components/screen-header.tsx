import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useNavigation } from "expo-router";
import { DrawerActions } from "expo-router/react-navigation";

/**
 * Per-screen header row: hamburger (opens the drawer) · title · optional right
 * slot. The navigator's own headers stay off (headerShown: false) because they
 * style via RN props NativeWind can't reach — this row uses tokens like all
 * other chrome, mirroring web's sidebar-toggle + in-content title pattern.
 */
export function ScreenHeader({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  const navigation = useNavigation();
  return (
    <View className="h-11 flex-row items-center gap-1 pl-3 pr-6">
      <Pressable
        onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
        accessibilityRole="button"
        accessibilityLabel="Open navigation menu"
        className="h-11 w-11 items-center justify-center"
      >
        {/* three-bar hamburger drawn with Views — no icon library on mobile */}
        <View className="gap-[3px]">
          <View className="h-[1.5px] w-4 rounded-full bg-fg" />
          <View className="h-[1.5px] w-4 rounded-full bg-fg" />
          <View className="h-[1.5px] w-4 rounded-full bg-fg" />
        </View>
      </Pressable>
      <Text className="flex-1 text-lg text-fg" numberOfLines={1}>
        {title}
      </Text>
      {right}
    </View>
  );
}
