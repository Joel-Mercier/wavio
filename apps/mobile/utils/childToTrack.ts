import i18n from "@/config/i18n";
import { streamUrl } from "@/services/backend/streaming";
import type { Child } from "@/services/openSubsonic/types";
import useOffline from "@/stores/offline";
import type { QueueTrack } from "@/stores/queue";
import { artworkUrl } from "@/utils/artwork";

export function childToTrack(child: Child) {
  const offlineStore = useOffline.getState();
  const offlineTrack = offlineStore.getDownloadedTrack(child.id);

  // Use offline track if available, otherwise use streaming URL
  const url = offlineTrack ? offlineTrack.path : streamUrl(child.id);

  // The local library's own mapper already substituted this same placeholder, so
  // an equal title means "untagged" there too.
  const unknown = i18n.t("app.shared.unknown");
  const title = child.title?.trim();

  return {
    id: child.id,
    url,
    // type: TrackType.HLS,
    // Local files frequently lack tags; keep consumers (player UI, lock screen,
    // car, widget) from receiving undefined for these display fields.
    title: title || unknown,
    // …but consumers that write a permanent record rather than render a row
    // (ListenBrainz) must skip the track instead of filing it as "Unknown".
    isUntitled: !title || title === unknown,
    artist: child.artist ?? "",
    album: child.album ?? "",
    artwork: artworkUrl(child.coverArt),
    coverArt: child.coverArt,
    genre: child.genre,
    duration: child.duration,
    contentType: child.contentType,
    suffix: child.suffix,
    bitRate: child.bitRate,
    // The server-reported size of the original file. Carried so the prefetch
    // cache's admission control (cacheEstimatedBytes) can use the exact number
    // for a raw fetch instead of a duration × bitrate guess, which is at its
    // worst on lossless sources.
    size: child.size,
    samplingRate: child.samplingRate,
    starred: child.starred,
    userRating: child.userRating,
    artistId: child.artistId,
    artists: child.artists,
    albumId: child.albumId,
    track: child.track,
    musicBrainzId: child.musicBrainzId,
    replayGain: child.replayGain,
    // Add offline indicator
    isOffline: !!offlineTrack,
  };
}

// The inverse of childToTrack, for rows that render queue tracks through
// Child-based components. Their actions ("Play next", "Add to queue") rebuild
// the track with childToTrack, so anything dropped here is lost from the copy
// they insert — replayGain was, and the copy played at full volume (#244).
export function trackToChild(track: QueueTrack): Child {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    coverArt: track.coverArt,
    genre: track.genre,
    duration: track.duration,
    contentType: track.contentType,
    suffix: track.suffix,
    bitRate: track.bitRate,
    size: track.size,
    samplingRate: track.samplingRate,
    starred: track.starred,
    userRating: track.userRating,
    artistId: track.artistId,
    artists: track.artists,
    albumId: track.albumId,
    track: track.track,
    musicBrainzId: track.musicBrainzId,
    replayGain: track.replayGain,
  } as Child;
}
