import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import useApp from "@/stores/app";

// Bottom padding a scroll view must reserve for the floating player. In
// landscape the player docks into the left sidebar instead of overlaying the
// content, so it no longer needs any bottom clearance.
export function useFloatingPlayerInset() {
  const isLandscape = useApp((s) => s.isLandscape);
  return isLandscape ? 0 : FLOATING_PLAYER_HEIGHT;
}
