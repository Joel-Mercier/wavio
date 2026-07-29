import { usePathname } from "expo-router";
import { BottomTabBarHeightContext } from "expo-router/build/react-navigation/bottom-tabs";
import { useContext } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import useApp from "@/stores/app";
import { hidesFloatingPlayer } from "@/utils/floatingPlayerRoutes";

// Gap reserved between the floating player and the last list item.
const FLOATING_PLAYER_CONTENT_GAP = 24;

// Single source of truth for the bottom padding every scrollable screen must
// reserve. In portrait the floating player sits directly on top of the tab bar,
// so content must clear the tab bar height (which already bakes in the bottom
// safe-area inset — don't add it again), the player itself, and a gap below it.
// In landscape the player docks into the left sidebar and the tab bar reports a
// height of 0, so only the bottom safe-area inset is needed.
//
// Both pieces of chrome are conditional, and a screen can be rendered with or
// without either: full-screen routes outside the tab navigator (playlists/new-ai
// and friends) have no tab bar to measure and hide the player as well. Reading
// the context directly rather than through useBottomTabBarHeight is deliberate —
// the hook throws off-navigator, and this hook is called from components that
// render on both sides of it.
export function useScreenBottomPadding() {
  const isWideLayout = useApp((s) => s.isWideLayout);
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useContext(BottomTabBarHeightContext);
  const pathname = usePathname();

  if (isWideLayout) return insets.bottom;

  const chromeBase = bottomTabBarHeight ?? insets.bottom;
  return hidesFloatingPlayer(pathname)
    ? chromeBase
    : chromeBase + FLOATING_PLAYER_HEIGHT + FLOATING_PLAYER_CONTENT_GAP;
}
