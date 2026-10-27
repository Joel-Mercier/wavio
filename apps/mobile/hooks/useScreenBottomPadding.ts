import { BottomTabBarHeightContext } from "expo-router/js-tabs";
import { useContext } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import { useFloatingPlayerRestoreBadgeSpace } from "@/components/player/FloatingPlayerRestoreBadge";
import { useSleepTimerBadgeSpace } from "@/components/player/SleepTimerBadge";
import {
  TRACK_SELECTION_BAR_GAP,
  TRACK_SELECTION_BAR_HEIGHT,
} from "@/components/tracks/TrackSelectionBar";
import { useIsFloatingPlayerVisible } from "@/hooks/player";
import useApp from "@/stores/app";
import useTrackSelection from "@/stores/trackSelection";

// Gap reserved between the floating player and the last list item.
const FLOATING_PLAYER_CONTENT_GAP = 24;

// Single source of truth for the bottom padding every scrollable screen must
// reserve. In portrait the floating player sits directly on top of the tab bar,
// so content must clear the tab bar height (which already bakes in the bottom
// safe-area inset — don't add it again), the player itself, and a gap below it.
// In landscape the player docks into the left sidebar and the tab bar reports a
// height of 0, so only the bottom safe-area inset is needed.
//
// Every piece of chrome here is conditional, and a screen can be rendered with
// or without any of them: full-screen routes outside the tab navigator
// (playlists/new-ai and friends) have no tab bar to measure and hide the player
// as well. Reading
// the context directly rather than through useBottomTabBarHeight is deliberate —
// the hook throws off-navigator, and this hook is called from components that
// render on both sides of it.
//
// `floating` is for content pinned over the screen (FloatingSubmitButton) rather
// than scrolled to: it keeps the gap even with no chrome under it, instead of
// sitting flush on the tab bar or the screen edge.
export function useScreenBottomPadding({ floating = false } = {}) {
  const isWideLayout = useApp((s) => s.isWideLayout);
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useContext(BottomTabBarHeightContext);
  const playerVisible = useIsFloatingPlayerVisible();
  // A third piece of conditional chrome: the multi-select bar stacks on top of
  // the player rather than replacing it, so while a selection is open every
  // screen owes it its height as well — otherwise the rows the user is picking
  // from are the ones it covers.
  const selectionActive = useTrackSelection((state) => state.active);
  const measuredBarHeight = useTrackSelection((state) => state.barHeight);
  const sleepTimerBadgeSpace = useSleepTimerBadgeSpace();
  const restoreBadgeSpace = useFloatingPlayerRestoreBadgeSpace();
  const selectionSpace = selectionActive
    ? TRACK_SELECTION_BAR_GAP +
      (measuredBarHeight || TRACK_SELECTION_BAR_HEIGHT)
    : 0;

  if (isWideLayout) {
    return selectionActive || floating
      ? insets.bottom + selectionSpace + FLOATING_PLAYER_CONTENT_GAP
      : insets.bottom;
  }

  const chromeBase = bottomTabBarHeight ?? insets.bottom;
  // A swiped-away player leaves only its restore badge behind, reserved without
  // the content gap so it costs no more than the sleep-timer badge does.
  if (!playerVisible && !selectionActive) {
    return (
      chromeBase +
      Math.max(restoreBadgeSpace, floating ? FLOATING_PLAYER_CONTENT_GAP : 0)
    );
  }
  const playerSpace = playerVisible
    ? FLOATING_PLAYER_HEIGHT + sleepTimerBadgeSpace
    : restoreBadgeSpace;
  // The gap is counted once, above whichever pieces of chrome are stacked.
  return (
    chromeBase + playerSpace + selectionSpace + FLOATING_PLAYER_CONTENT_GAP
  );
}
