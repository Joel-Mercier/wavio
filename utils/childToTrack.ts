import type { Child } from "@/services/openSubsonic/types";
import useOffline from "@/stores/offline";
import { artworkUrl } from "@/utils/artwork";
import { streamUrl } from "@/utils/streaming";

export function childToTrack(child: Child) {
  const offlineStore = useOffline.getState();
  const offlineTrack = offlineStore.getDownloadedTrack(child.id);

  // Use offline track if available, otherwise use streaming URL
  const url = offlineTrack ? offlineTrack.path : streamUrl(child.id);

  return {
    id: child.id,
    url,
    // type: TrackType.HLS,
    title: child.title,
    artist: child.artist,
    album: child.album,
    artwork: artworkUrl(child.coverArt),
    genre: child.genre,
    duration: child.duration,
    contentType: child.contentType,
    starred: child.starred,
    artistId: child.artistId,
    albumId: child.albumId,
    // Add offline indicator
    isOffline: !!offlineTrack,
  };
}
