import { useEffect } from "react";
import { AppState } from "react-native";
import { autoDownloadService } from "@/services/offline/autoDownloadService";
import useOffline from "@/stores/offline";

// Mounted once at the app root. Nudges the automatic downloads (liked songs,
// liked albums, playlists) whenever they may have work: a rule changing — a
// restore, a rehydrated scope — and the app coming back to the foreground. The
// service itself reacts to reconnection, queue drains, likes and playlist edits,
// and throttles how often it lists the server.
export default function AutoDownloadsController() {
  const likedSongs = useOffline((s) => s.offlineModeEnabled);
  const likedAlbums = useOffline((s) => s.autoDownloadLikedAlbums);
  const playlists = useOffline((s) => s.autoDownloadPlaylists);

  useEffect(() => {
    if (!likedSongs && !likedAlbums && !playlists) return;
    void autoDownloadService.kick();
  }, [likedSongs, likedAlbums, playlists]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (status) => {
      if (status === "active") void autoDownloadService.kick();
    });
    return () => sub.remove();
  }, []);

  return null;
}
