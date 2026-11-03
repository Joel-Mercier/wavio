import { usePathname } from "expo-router";
import { usePlayingTrack } from "@/hooks/player/usePlayingTrack";
import useApp from "@/stores/app";
import useFloatingPlayer from "@/stores/floatingPlayer";
import { hidesFloatingPlayer } from "@/utils/floatingPlayerRoutes";

// Mirrors FloatingPlayer's own render conditions, so the chrome and padding
// stacked around it only make room while it is actually on screen. Swiping it
// away only hides the portrait player; the landscape one docks in the sidebar.
export function useIsFloatingPlayerVisible(): boolean {
  const playingTrack = usePlayingTrack();
  const hidden = useFloatingPlayer((s) => s.hidden);
  const isWideLayout = useApp((s) => s.isWideLayout);
  const pathname = usePathname();
  return (
    !!playingTrack &&
    !hidesFloatingPlayer(pathname) &&
    (isWideLayout || !hidden)
  );
}
