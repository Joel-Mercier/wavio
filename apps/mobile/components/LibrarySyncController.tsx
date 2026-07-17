import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useIsOnline } from "@/hooks/useIsOnline";
import { librarySyncService } from "@/services/offline";
import useLibrarySync from "@/stores/librarySync";

// Mounted once at the app root (like OfflineStarredAutoSync). Nudges the
// extended-offline library sync whenever it might have work to do: toggle-on,
// app start, coming back online, returning to the foreground (which also
// triggers the 24h delta resync of a completed pass). The service itself
// resumes from its persisted cursor and no-ops when there's nothing to do.
export default function LibrarySyncController() {
  const isOnline = useIsOnline();
  const enabled = useLibrarySync((s) => s.extendedOfflineModeEnabled);

  useEffect(() => {
    if (!enabled || !isOnline) return;
    librarySyncService.startIfNeeded();
  }, [enabled, isOnline]);

  useEffect(() => {
    if (!enabled) return;
    const onChange = (status: AppStateStatus) => {
      if (status === "active") librarySyncService.startIfNeeded();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [enabled]);

  return null;
}
