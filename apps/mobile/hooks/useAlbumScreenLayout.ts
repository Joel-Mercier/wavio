import { useCallback } from "react";
import useApp from "@/stores/app";

// Persisted list/grid layout for an album-list screen. `screenKey` must be a
// stable id for the screen (one value per screen) — see the keys in the screens
// under app/(app) and components/albums.
export function useAlbumScreenLayout(screenKey: string) {
  const layout = useApp((s) => s.albumScreenLayouts[screenKey] ?? "list");
  const setAlbumScreenLayout = useApp((s) => s.setAlbumScreenLayout);
  const toggle = useCallback(() => {
    setAlbumScreenLayout(screenKey, layout === "list" ? "grid" : "list");
  }, [screenKey, layout, setAlbumScreenLayout]);
  return { layout, toggle };
}
