import useApp from "@/stores/app";
import useRecentPlays, { setFavoritesPinned } from "@/stores/recentPlays";

// Wired from index.js so the flag is in place before either rehydrate path
// (app/(app)/_layout.tsx or a headless car boot) restores the shortcuts.
export function startHomeShortcutsSync(): () => void {
  setFavoritesPinned(useApp.getState().pinFavoritesShortcut);
  return useApp.subscribe((state, prev) => {
    if (state.pinFavoritesShortcut === prev.pinFavoritesShortcut) return;
    setFavoritesPinned(state.pinFavoritesShortcut);
    if (state.pinFavoritesShortcut) useRecentPlays.getState().pinFavorites();
  });
}
