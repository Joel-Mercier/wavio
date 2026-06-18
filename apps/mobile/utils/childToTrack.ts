import i18n from "@/config/i18n";
import { streamUrl } from "@/services/backend/streaming";
import type { Child } from "@/services/openSubsonic/types";
import useOffline from "@/stores/offline";
import { artworkUrl } from "@/utils/artwork";

export function childToTrack(child: Child) {
  const offlineStore = useOffline.getState();
  const offlineTrack = offlineStore.getDownloadedTrack(child.id);

  // Use offline track if available, otherwise use streaming URL
  const url = offlineTrack ? offlineTrack.path : streamUrl(child.id);

  return {
    id: child.id,
    url,
    // type: TrackType.HLS,
    // Local files frequently lack tags; keep consumers (player UI, lock screen,
    // car, widget) from receiving undefined for these display fields.
    title: child.title ?? i18n.t("app.shared.unknown"),
    artist: child.artist ?? "",
    album: child.album ?? "",
    artwork: artworkUrl(child.coverArt),
    coverArt: child.coverArt,
    genre: child.genre,
    duration: child.duration,
    contentType: child.contentType,
    starred: child.starred,
    artistId: child.artistId,
    artists: child.artists,
    albumId: child.albumId,
    musicBrainzId: child.musicBrainzId,
    replayGain: child.replayGain,
    // Add offline indicator
    isOffline: !!offlineTrack,
  };
}
