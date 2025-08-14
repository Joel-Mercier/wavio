import type { Child } from "@/services/openSubsonic/types";
import { streamUrl } from "./streaming";

export function childToTrack(child: Child, cover?: string) {
  return {
    id: child.id,
    url: streamUrl(child.id),
    // type: TrackType.HLS,
    title: child.title,
    artist: child.artist,
    album: child.album,
    artwork: cover,
    genre: child.genre,
    duration: child.duration,
    contentType: child.contentType,
    starred: child.starred,
    artistId: child.artistId,
    albumId: child.albumId,
  };
}
