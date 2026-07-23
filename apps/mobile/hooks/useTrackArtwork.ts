import { useMemo } from "react";
import { useIsOnline } from "@/hooks/useIsOnline";
import useOffline from "@/stores/offline";
import { resolveCachedArtwork } from "@/utils/artwork";

type ArtworkTrack =
  | {
      artwork?: string;
      coverArt?: string;
      albumId?: string;
    }
  | null
  | undefined;

// Queue tracks bake their artwork URL at enqueue time (childToTrack), so
// offline it dead-ends on the server even when the cover sits in the offline
// artwork cache. Resolve at render time instead: the track's own coverArt id
// first, then its album collection's (track and album cover ids differ on
// Navidrome — mf-* vs al-* — and only album-level covers are cached).
export function useTrackArtwork(track: ArtworkTrack): string | undefined {
  const isOnline = useIsOnline();
  const artworkCache = useOffline((s) => s.artworkCache);
  const artworkAliases = useOffline((s) => s.artworkAliases);
  const downloadedCollections = useOffline((s) => s.downloadedCollections);
  return useMemo(() => {
    if (!track) return undefined;
    if (isOnline) return track.artwork;
    const cached = resolveCachedArtwork(
      track.coverArt,
      artworkCache,
      artworkAliases,
    );
    if (cached) return cached;
    // Backstop for a track the sync never enumerated (so it has no alias) but
    // whose album collection is registered.
    const albumCoverArt = track.albumId
      ? downloadedCollections[track.albumId]?.coverArt
      : undefined;
    if (albumCoverArt && artworkCache[albumCoverArt]) {
      return artworkCache[albumCoverArt];
    }
    return track.artwork;
  }, [track, isOnline, artworkCache, artworkAliases, downloadedCollections]);
}
