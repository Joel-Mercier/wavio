import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import useApp from "@/stores/app";

// Gap reserved between the floating player and the last list item.
const FLOATING_PLAYER_CONTENT_GAP = 24;

// Single source of truth for the bottom padding every scrollable screen must
// reserve. In portrait the floating player sits directly on top of the tab bar,
// so content must clear the tab bar height (which already bakes in the bottom
// safe-area inset — don't add it again), the player itself, and a gap below it.
// In landscape the player docks into the left sidebar and the tab bar reports a
// height of 0, so only the bottom safe-area inset is needed.
export function useScreenBottomPadding() {
  const isWideLayout = useApp((s) => s.isWideLayout);
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  return isWideLayout
    ? insets.bottom
    : bottomTabBarHeight + FLOATING_PLAYER_HEIGHT + FLOATING_PLAYER_CONTENT_GAP;
}
