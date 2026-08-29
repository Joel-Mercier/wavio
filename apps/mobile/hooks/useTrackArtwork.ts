import { useMemo } from "react";
import { useIsOnline } from "@/hooks/useIsOnline";
import useOffline from "@/stores/offline";
import { resolveOfflineTrackArtwork } from "@/utils/artwork";

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
// artwork cache. Resolve at render time instead — see
// resolveOfflineTrackArtwork for the order and why the track's own cover id is
// the last thing to fall back on.
export function useTrackArtwork(track: ArtworkTrack): string | undefined {
  const isOnline = useIsOnline();
  const artworkCache = useOffline((s) => s.artworkCache);
  const artworkAliases = useOffline((s) => s.artworkAliases);
  const downloadedCollections = useOffline((s) => s.downloadedCollections);
  return useMemo(() => {
    if (!track) return undefined;
    if (isOnline) return track.artwork;
    return resolveOfflineTrackArtwork(track, {
      artworkCache,
      artworkAliases,
      downloadedCollections,
    });
  }, [track, isOnline, artworkCache, artworkAliases, downloadedCollections]);
}
