import type { Child } from "@/services/openSubsonic/types";
import { artworkUrl } from "./artwork";
import { streamUrl } from "./streaming";

export function childToTrack(child: Child) {
  return {
    id: child.id,
    url: streamUrl(child.id),
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
  };
}
